import {ModService} from '@/service/ModService';
import {ModCacheService} from '@/service/ModCacheService';
import {SettingsService} from '@/service/SettingsService';
import {Logger} from '@/infrastructure/logging/Logger';
import {Observable} from '@/infrastructure/pubsub/Observable';
import {ScriptInjector} from '@/infrastructure/dom/ScriptInjector';
import {PlatformBridge} from '@/infrastructure/bridge/PlatformBridge';
import {PlatformApiService} from '@/service/PlatformApiService';
import {BcGameState} from '@/service/BcGameState';
import type {ModLoadEntry, ModLoadProgress, ModLoadStatus, ModLoadType} from '@/domain/ModLoad';

/**
 * Mod Loader Service
 * Handles loading and injecting mod scripts into the page. DOM mechanics are
 * delegated to {@link ScriptInjector}; this service owns the load state machine,
 * runtime-error attribution and progress reporting.
 */
export class ModLoaderService {
  private static loadedMods: Set<string> = new Set();
  private static initialEnabledMods: Set<string> = new Set();
  private static hasDisabledMods: boolean = false;
  private static scheduledPreload: number | null = null;
  private static scheduledLoad: number | null = null;
  private static loadProgress: Map<string, ModLoadEntry> = new Map();
  private static loadStarted: boolean = false;
  private static waitingForGame: boolean = false;
  // Maps an absolute script URL to the mod it belongs to, so runtime errors
  // surfaced by the global error handler can be attributed to the right mod.
  private static sourceUrlToModKey: Map<string, string> = new Map();
  // The mod whose eval source is being executed synchronously right now (eval
  // scripts run inline, so their runtime errors have no useful filename).
  private static executingEvalModKey: string | null = null;
  private static runtimeErrorListenerInstalled: boolean = false;
  private static readonly observable = new Observable<ModLoadProgress>({
    emitOnSubscribe: true,
    getSnapshot: () => this.getProgress(),
    onListenerError: (error) => Logger.error('ModLoaderService: progress listener threw', error),
  });

  /**
   * Initialize the mod loader
   * Loads all enabled mods on startup
   */
  static initialize(): void {
    Logger.info('ModLoaderService: Initializing mod loader');

    // Watch for runtime errors thrown by mod scripts so a mod that downloads
    // fine but crashes while initializing is reported as failed, not loaded.
    this.ensureRuntimeErrorListener();

    // Track initially enabled mods
    const enabledMods = ModService.getAllModsWithDetails().filter(mod => mod.enabled);
    enabledMods.forEach(mod => {
      const modKey = `${mod.modId}_${mod.registryId}`;
      this.initialEnabledMods.add(modKey);
    });

    Logger.info(`ModLoaderService: Initialize succeed`);
  }

  /**
   * Load all enabled mods
   */
  static loadAllEnabledMods(): void {
    this.loadStarted = true;
    // Register the enabled mods up front so the loading window can show them as
    // pending even while we are still waiting for the game to become available.
    this.registerPendingMods();

    if (BcGameState.canLoadMods()) {
      this.waitingForGame = false;
      this.notifyProgress();
      this.loadAllEnabledModsImpl();
    } else if (!this.scheduledLoad) {
      this.waitingForGame = true;
      this.notifyProgress();

      this.scheduledLoad = setInterval(() => {
        if (BcGameState.canLoadMods()) {
          this.onGameReady();
        }
      }, 5);
    }
  }

  /**
   * Force-start mod loading immediately, bypassing the waitingForGame check.
   * Called when the user clicks "Load now" in the loading window.
   */
  static forceLoad(): void {
    if (!this.waitingForGame) {
      return;
    }
    Logger.info('ModLoaderService: User triggered force load');
    this.onGameReady();
  }

  private static onGameReady(): void {
    if (this.scheduledLoad !== null) {
      clearInterval(this.scheduledLoad);
      this.scheduledLoad = null;
    }
    this.waitingForGame = false;
    this.notifyProgress();
    this.loadAllEnabledModsImpl();
  }

  static preloadAllEnabledMods(): void {
    if (document.head !== null) {
      this.preloadAllEnabledModsImpl();
    } else if (!this.scheduledPreload) {
      this.scheduledPreload = setInterval(() => {
        if (document.head !== null) {
          clearInterval(this.scheduledPreload!);
          this.scheduledPreload = null;
          this.preloadAllEnabledModsImpl();
        }
      }, 5);
    }
  }

  /**
   * Load a single mod by injecting its script into the page
   */
  static loadMod(modId: string, type: string, registryId: string, sourceUrl: string | undefined, modName: string, distribution: string = 'unknown', noCacheBusting: boolean = false): void {
    const modKey = `${modId}_${registryId}`;
    const loadType = this.normalizeLoadType(type);

    // Skip if already loaded
    if (this.loadedMods.has(modKey)) {
      Logger.debug(`ModLoaderService: Mod ${modName} (${modKey}) already loaded, skipping`);
      this.trackMod(modKey, modId, registryId, modName, 'loaded', {loadType, distribution});
      return;
    }

    // Skip if no source URL
    if (!sourceUrl) {
      Logger.warn(`ModLoaderService: Mod ${modName} (${modKey}) has no source URL, skipping`);
      this.trackMod(modKey, modId, registryId, modName, 'error', {loadType, distribution, error: 'No source URL'});
      return;
    }

    try {
      // Decide which URL to request: the pinned (cached) build, a fresh fetch,
      // or the verbatim URL for mods that opt out of cache busting.
      const plan = ModCacheService.planLoad(sourceUrl, SettingsService.get('modCacheEnabled'), noCacheBusting);
      const loadUrl = plan.url;
      Logger.info(`ModLoaderService: Loading mod ${modName} from ${loadUrl}`);

      // Register in FUSAM as loading if available
      this.setFusamStatus(modId, distribution, 'loading');
      this.trackMod(modKey, modId, registryId, modName, 'loading', {loadType, distribution});

      if (plan.cached) {
        ModCacheService.beginLoad(modKey, sourceUrl);
      }

      // If a pinned (cached) build fails to load, drop the pin and retry the
      // canonical URL once so a bad cache entry can never permanently break a mod.
      const usedPin = plan.cached && ModCacheService.hasPin(modKey);
      const onError = usedPin
        ? () => {
            Logger.warn(`ModLoaderService: Pinned build of ${modName} failed to load, retrying canonical URL`, {modKey});
            ModCacheService.clearPin(modKey, sourceUrl);
            this.registerSourceUrl(sourceUrl, modKey);
            this.dispatchLoad(modId, registryId, modKey, modName, distribution, loadType, sourceUrl, sourceUrl);
          }
        : undefined;

      this.registerSourceUrl(loadUrl, modKey);
      this.dispatchLoad(modId, registryId, modKey, modName, distribution, loadType, loadUrl, sourceUrl, onError);

      if (plan.cached) {
        ModCacheService.scheduleValidate(modKey, sourceUrl);
      }
    } catch (error) {
      this.handleLoadError(modId, distribution, modName, modKey, error);
    }
  }

  /**
   * Inject a mod via the appropriate strategy for its load type. Extracted so a
   * failed cached load can be retried against the canonical URL.
   */
  private static dispatchLoad(
    modId: string,
    registryId: string,
    modKey: string,
    modName: string,
    distribution: string,
    loadType: ModLoadType,
    loadUrl: string,
    sourceUrl: string,
    onError?: (error: unknown) => void,
  ): void {
    switch (loadType) {
      case 'module':
        this.injectScriptElement(modId, registryId, loadUrl, modName, distribution, modKey, 'module', onError);
        break;
      case 'eval':
        void this.loadEvalScript(modId, registryId, loadUrl, sourceUrl, modName, distribution, modKey, onError);
        break;
      case 'script':
      default:
        this.injectScriptElement(modId, registryId, loadUrl, modName, distribution, modKey, 'script', onError);
        break;
    }
  }

  static preloadMod(modId: string, type: string | undefined, registryId: string, sourceUrl: string | undefined, modName: string, distribution: string = 'unknown', noCacheBusting: boolean = false): void {
    const modKey = `${modId}_${registryId}`;

    // Skip if already loaded
    if (this.loadedMods.has(modKey)) {
      Logger.debug(`ModLoaderService: Mod ${modName} (${modKey}) already loaded, skipping`);
      return;
    }

    // Skip if no source URL
    if (!sourceUrl) {
      Logger.warn(`ModLoaderService: Mod ${modName} (${modKey}) has no source URL, skipping`);
      return;
    }

    try {
      // Resolve the same URL loadMod will request so the preload actually warms
      // the cache entry the eventual load uses.
      const {url: preloadUrl} = ModCacheService.planLoad(sourceUrl, SettingsService.get('modCacheEnabled'), noCacheBusting);
      Logger.info(`ModLoaderService: Preloading mod ${modName} from ${preloadUrl}`);
      ScriptInjector.injectPreloadLink({
        href: preloadUrl,
        loadType: this.normalizeLoadType(type),
        dataset: {
          'data-mod-id': modId,
          'data-registry-id': registryId,
          'data-mod-name': modName,
          'data-distribution': distribution,
        },
      });
      Logger.debug(`ModLoaderService: Script element created and appended for ${modName}`);
    } catch (error) {
      Logger.error(`ModLoaderService: Error preloading mod ${modName}`, error);
    }
  }

  /**
   * Check if a mod is currently loaded
   */
  static isModLoaded(modId: string, registryId: string): boolean {
    const modKey = `${modId}_${registryId}`;
    return this.loadedMods.has(modKey);
  }

  /**
   * Mark that a mod has been disabled
   * This will trigger a page refresh when the mod manager closes
   */
  static markModDisabled(modId: string, registryId: string): void {
    const modKey = `${modId}_${registryId}`;

    // Only mark as disabled if it was initially enabled
    if (this.initialEnabledMods.has(modKey)) {
      Logger.info(`ModLoaderService: Mod ${modKey} has been disabled, page refresh will be required`);
      this.hasDisabledMods = true;
    }
  }

  /**
   * Check if any mods have been disabled during this session
   */
  static hasModsBeenDisabled(): boolean {
    return this.hasDisabledMods;
  }

  /**
   * Reset the disabled mods flag
   */
  static resetDisabledFlag(): void {
    this.hasDisabledMods = false;
  }

  /**
   * Refresh the page if mods have been disabled
   * Should be called when the mod manager closes
   */
  static refreshIfNeeded(): void {
    if (this.hasDisabledMods) {
      // When the host owns reloads (embedded view), ask it to reload instead of
      // navigating the page ourselves.
      if (PlatformBridge.ui().suppressReload) {
        Logger.info('ModLoaderService: Mods disabled; host owns reload, emitting reloadRequested');
        PlatformApiService.emit('reloadRequested', {reason: 'mods-disabled'});
        return;
      }
      Logger.info('ModLoaderService: Mods have been disabled, refreshing page...');
      window.location.reload();
    } else {
      this.loadAllEnabledMods();
    }
  }

  /**
   * Get statistics about loaded mods
   */
  static getStats(): {
    loadedCount: number;
    enabledCount: number;
    hasDisabledMods: boolean;
  } {
    const enabledCount = ModService.getEnabledCount();
    return {
      loadedCount: this.loadedMods.size,
      enabledCount: enabledCount,
      hasDisabledMods: this.hasDisabledMods,
    };
  }

  /**
   * Get list of loaded mod keys
   */
  static getLoadedMods(): string[] {
    return Array.from(this.loadedMods);
  }

  /**
   * Subscribe to mod loading progress updates.
   * The listener is invoked immediately with the current snapshot and again on
   * every change. Returns an unsubscribe function.
   */
  static subscribeProgress(listener: (progress: ModLoadProgress) => void): () => void {
    return this.observable.subscribe(listener);
  }

  /**
   * Get a snapshot of the current mod loading progress.
   */
  static getProgress(): ModLoadProgress {
    const entries = Array.from(this.loadProgress.values());
    const loaded = entries.filter(entry => entry.status === 'loaded').length;
    const errored = entries.filter(entry => entry.status === 'error').length;
    const settled = loaded + errored;
    const total = entries.length;
    const finished = this.loadStarted && !this.waitingForGame && settled === total;

    const startTimes = entries.map(entry => entry.startedAt).filter((t): t is number => t !== undefined);
    const settleTimes = entries.map(entry => entry.settledAt).filter((t): t is number => t !== undefined);
    const totalDurationMs = startTimes.length > 0 && settleTimes.length > 0
      ? Math.max(...settleTimes) - Math.min(...startTimes)
      : undefined;

    return {
      entries,
      total,
      settled,
      loaded,
      errored,
      waitingForGame: this.waitingForGame,
      started: this.loadStarted,
      finished,
      totalDurationMs,
    };
  }

  /**
   * Unload all mods (remove script tags)
   * Note: This may not fully unload mods that have already executed
   */
  static unloadAllMods(): void {
    Logger.info('ModLoaderService: Unloading all mods');

    // Find all mod script elements and remove them
    ScriptInjector.removeAllModScripts();

    // Clear loaded mods set
    this.loadedMods.clear();

    Logger.info('ModLoaderService: All mod scripts removed');
  }

  private static preloadAllEnabledModsImpl(): void {
    const modsWithDetails = ModService.getAllModsWithDetails();
    const enabledMods = modsWithDetails.filter(mod => mod.enabled);
    enabledMods.forEach(mod => {
      this.preloadMod(mod.modId, mod.type, mod.registryId, mod.sourceUrl, mod.name, mod.selectedVersion, mod.noCacheBusting);
    });
    Logger.info(`ModLoaderService: Preloaded ${enabledMods.length} enabled mods`);
  }

  private static loadAllEnabledModsImpl(): void {
    const modsWithDetails = ModService.getAllModsWithDetails();
    const enabledMods = modsWithDetails.filter(mod => mod.enabled);

    Logger.info(`ModLoaderService: Loading ${enabledMods.length} enabled mods`);

    enabledMods.forEach(mod => {
      this.loadMod(mod.modId, mod.type || 'script', mod.registryId, mod.sourceUrl, mod.name, mod.selectedVersion, mod.noCacheBusting);
    });
  }

  private static normalizeLoadType(type: string | undefined): ModLoadType {
    if (type === 'module' || type === 'eval') {
      return type;
    }
    return 'script';
  }

  private static async loadEvalScript(
    modId: string,
    registryId: string,
    loadUrl: string,
    sourceUrl: string,
    modName: string,
    distribution: string,
    modKey: string,
    onError?: (error: unknown) => void,
  ): Promise<void> {
    try {
      const response = await PlatformBridge.fetch(loadUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const source = await response.text();
      // Use the canonical source URL for the sourceURL comment so stack traces
      // stay readable even when the body was fetched from a ?v= cache URL.
      this.executeInGlobalScope(modId, registryId, source, sourceUrl, modName, distribution, modKey);
      this.handleLoadSuccess(modId, distribution, modName, modKey);
    } catch (error) {
      if (onError) {
        onError(error);
      } else {
        this.handleLoadError(modId, distribution, modName, modKey, error);
      }
    }
  }

  private static executeInGlobalScope(
    modId: string,
    registryId: string,
    source: string,
    sourceUrl: string,
    modName: string,
    distribution: string,
    modKey: string,
  ): void {
    const dataset = {
      'data-mod-id': modId,
      'data-registry-id': registryId,
      'data-mod-name': modName,
      'data-distribution': distribution,
      'data-load-type': 'eval',
    };
    // Inline scripts execute synchronously on append; if the source throws, the
    // global error handler fires during this window and attributes it to this mod.
    this.executingEvalModKey = modKey;
    try {
      ScriptInjector.injectInlineScript({source, sourceUrl, dataset});
    } finally {
      this.executingEvalModKey = null;
    }
  }

  private static injectScriptElement(
    modId: string,
    registryId: string,
    loadUrl: string,
    modName: string,
    distribution: string,
    modKey: string,
    type: Exclude<ModLoadType, 'eval'>,
    onError?: (error: unknown) => void,
  ): void {
    ScriptInjector.injectScript({
      src: loadUrl,
      type,
      dataset: {
        'data-mod-id': modId,
        'data-registry-id': registryId,
        'data-mod-name': modName,
        'data-distribution': distribution,
      },
      onLoad: () => {
        this.handleLoadSuccess(modId, distribution, modName, modKey);
      },
      onError: (error) => {
        if (onError) {
          onError(error);
        } else {
          this.handleLoadError(modId, distribution, modName, modKey, error);
        }
      },
    });

    Logger.debug(`ModLoaderService: Script element created and appended for ${modName}`);
  }

  private static handleLoadSuccess(modId: string, distribution: string, modName: string, modKey: string): void {
    // The script's load event fired, but if the mod threw while executing it was
    // already marked as errored by the runtime error handler — keep that verdict.
    const existing = this.loadProgress.get(modKey);
    if (existing && existing.status === 'error') {
      Logger.warn(`ModLoaderService: Mod ${modName} downloaded but crashed during execution`, {
        modKey,
        error: existing.error,
      });
      this.setFusamStatus(modId, distribution, 'error');
      return;
    }

    this.loadedMods.add(modKey);
    this.setFusamStatus(modId, distribution, 'loaded');
    this.updateModStatus(modKey, 'loaded');

    const durationMs = this.loadProgress.get(modKey)?.durationMs;
    Logger.info(
      `ModLoaderService: Successfully loaded mod ${modName}${durationMs !== undefined ? ` in ${durationMs}ms` : ''}`,
      {modKey, durationMs},
    );
  }

  private static handleLoadError(modId: string, distribution: string, modName: string, modKey: string, error: unknown): void {
    const message = this.toErrorMessage(error);
    Logger.error(`ModLoaderService: Failed to load mod ${modName}`, {modKey, error: message});
    // A mod that never loaded must not surface an "update available" prompt.
    ModCacheService.clearRuntime(modKey);
    this.setFusamStatus(modId, distribution, 'error');
    this.updateModStatus(modKey, 'error', message);
  }

  /**
   * Attribute a runtime error (surfaced by the global error handler) to a mod.
   * A crash before the mod settles flips it to "error"; a crash after it has
   * already loaded is recorded separately so the loaded verdict is not lost.
   */
  private static handleRuntimeError(modKey: string, message: string): void {
    const entry = this.loadProgress.get(modKey);
    if (!entry) {
      return;
    }

    if (entry.status === 'loaded') {
      if (entry.postLoadError !== message) {
        entry.postLoadError = message;
        Logger.error(`ModLoaderService: Mod ${entry.name} threw after loading`, {modKey, error: message});
        this.notifyProgress();
      }
      return;
    }

    if (entry.status === 'error') {
      return;
    }

    Logger.error(`ModLoaderService: Mod ${entry.name} crashed during load`, {modKey, error: message});
    this.setFusamStatus(entry.modId, entry.distribution ?? 'unknown', 'error');
    this.updateModStatus(modKey, 'error', message);
  }

  /**
   * Seed the progress map with all currently enabled mods as "pending".
   * Existing entries are left untouched so already-resolved statuses are kept.
   */
  private static registerPendingMods(): void {
    const enabledMods = ModService.getAllModsWithDetails().filter(mod => mod.enabled);
    let changed = false;
    enabledMods.forEach(mod => {
      const modKey = `${mod.modId}_${mod.registryId}`;
      if (!this.loadProgress.has(modKey)) {
        this.loadProgress.set(modKey, {
          modKey,
          modId: mod.modId,
          registryId: mod.registryId,
          name: mod.name,
          status: 'pending',
          loadType: this.normalizeLoadType(mod.type),
          distribution: mod.selectedVersion,
        });
        changed = true;
      }
    });
    if (changed) {
      this.notifyProgress();
    }
  }

  /**
   * Create or update a progress entry, notifying listeners only on a real change.
   */
  private static trackMod(
    modKey: string,
    modId: string,
    registryId: string,
    name: string,
    status: ModLoadStatus,
    opts?: { loadType?: ModLoadType; distribution?: string; error?: string },
  ): void {
    const existing = this.loadProgress.get(modKey);
    if (existing) {
      let changed = false;
      if (name && existing.name !== name) {
        existing.name = name;
        changed = true;
      }
      if (opts?.loadType && existing.loadType !== opts.loadType) {
        existing.loadType = opts.loadType;
        changed = true;
      }
      if (opts?.distribution && existing.distribution !== opts.distribution) {
        existing.distribution = opts.distribution;
        changed = true;
      }
      if (opts?.error && existing.error !== opts.error) {
        existing.error = opts.error;
        changed = true;
      }
      if (existing.status !== status) {
        existing.status = status;
        this.applyStatusTiming(existing, status);
        changed = true;
      }
      if (changed) {
        this.notifyProgress();
      }
      return;
    }
    const entry: ModLoadEntry = {modKey, modId, registryId, name, status};
    if (opts?.loadType) entry.loadType = opts.loadType;
    if (opts?.distribution) entry.distribution = opts.distribution;
    if (opts?.error) entry.error = opts.error;
    this.applyStatusTiming(entry, status);
    this.loadProgress.set(modKey, entry);
    this.notifyProgress();
  }

  /**
   * Update the status (and optionally the error) of an existing progress entry.
   */
  private static updateModStatus(modKey: string, status: ModLoadStatus, error?: string): void {
    const existing = this.loadProgress.get(modKey);
    if (!existing) {
      return;
    }
    let changed = false;
    if (error !== undefined && existing.error !== error) {
      existing.error = error;
      changed = true;
    }
    if (existing.status !== status) {
      existing.status = status;
      this.applyStatusTiming(existing, status);
      changed = true;
    }
    if (changed) {
      this.notifyProgress();
    }
  }

  /**
   * Stamp start/settle timestamps (and compute the duration) as a mod moves
   * through its lifecycle. Timestamps are only ever written once.
   */
  private static applyStatusTiming(entry: ModLoadEntry, status: ModLoadStatus): void {
    const now = Date.now();
    if (status === 'loading' && entry.startedAt === undefined) {
      entry.startedAt = now;
    }
    if ((status === 'loaded' || status === 'error') && entry.settledAt === undefined) {
      entry.settledAt = now;
      if (entry.startedAt !== undefined) {
        entry.durationMs = now - entry.startedAt;
      }
    }
  }

  /**
   * Remember which mod a script URL belongs to so runtime errors reported with
   * that filename can be attributed back to the mod.
   */
  private static registerSourceUrl(sourceUrl: string, modKey: string): void {
    try {
      const absolute = new URL(sourceUrl, location.href).href;
      this.sourceUrlToModKey.set(absolute, modKey);
    } catch {
      this.sourceUrlToModKey.set(sourceUrl, modKey);
    }
  }

  /**
   * Install the global error listener (once) that detects mods crashing during
   * initialization — script load events alone can't tell a clean load from one
   * that downloaded but threw.
   */
  private static ensureRuntimeErrorListener(): void {
    if (this.runtimeErrorListenerInstalled) {
      return;
    }
    this.runtimeErrorListenerInstalled = true;

    window.addEventListener('error', (event: ErrorEvent) => {
      let modKey: string | undefined;
      if (event.filename) {
        modKey = this.sourceUrlToModKey.get(event.filename);
      }
      // Eval mods run as inline scripts, so the filename won't match; fall back
      // to whichever eval source is executing synchronously right now.
      if (!modKey && this.executingEvalModKey) {
        modKey = this.executingEvalModKey;
      }
      if (!modKey) {
        return;
      }

      const message = event.message
        || (event.error instanceof Error ? event.error.message : 'Runtime error');
      this.handleRuntimeError(modKey, message);
    }, true);
  }

  private static toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error instanceof Event) {
      // script.onerror passes a generic event with no detail for cross-origin
      // failures; describe the most likely cause.
      return 'Failed to load script (network, CORS, or syntax error)';
    }
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message);
    }
    return String(error);
  }

  private static notifyProgress(): void {
    this.observable.notify(this.getProgress());
  }

  private static setFusamStatus(modId: string, distribution: string, status: FUSAMAddonState['status']): void {
    if (window.FUSAM) {
      window.FUSAM.addons[modId] = {
        distribution: distribution,
        status: status
      };
    }
  }
}
