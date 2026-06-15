import {Logger} from "@/infrastructure/logging/Logger";
import {Observable} from "@/infrastructure/pubsub/Observable";
import {PlatformBridge, BRIDGE_VERSION, type BmmPlatformInfo} from "@/infrastructure/bridge/PlatformBridge";
import {ModService} from "@/service/ModService";
import {ModLoaderService} from "@/service/ModLoaderService";
import {RegistryService} from "@/service/RegistryService";
import {RegistryDataService} from "@/service/RegistryDataService";
import {SettingsService} from "@/service/SettingsService";
import {SdkStateService} from "@/service/SdkStateService";
import {LogService} from "@/service/LogService";
import {currentLanguage} from "@/i18n/i18n";
import {formatLocalizedName} from "@/util/format";
import type {PageName} from "@/app";
import type {AppSettings} from "@/domain/Settings";
import type {ModConfig, ModWithDetails} from "@/domain/Mod";
import type {ModLoadProgress} from "@/domain/ModLoad";
import type {Registry, RegistryType} from "@/domain/Registry";

/**
 * Events BMM publishes to API subscribers and (mirrored) to the host bridge.
 * Each key maps to the payload its listeners receive.
 */
export interface BmmEventMap {
  /** Fired once the public API has been installed and handed to the host. */
  ready: BmmPlatformInfo;
  /** Mod loader progress changed (download/execute lifecycle). */
  loadProgress: ModLoadProgress;
  /** The user's mod configuration set changed (install/enable/version/remove). */
  modsChanged: ModConfig[];
  /** Application settings changed. */
  settingsChanged: AppSettings;
  /** The active full-screen page changed (null = closed to launcher). */
  pageChanged: {page: PageName | null};
  /** BMM wants the embedded view reloaded but the host owns reloads. */
  reloadRequested: {reason: string};
}

/** The `{type, payload}` envelope delivered to `host.onEvent`. */
export type BmmPlatformEvent = {
  [K in keyof BmmEventMap]: {type: K; payload: BmmEventMap[K]};
}[keyof BmmEventMap];

/** Public mod shape exposed to plugins (a stable view over internal details). */
export interface BmmModInfo {
  modId: string;
  registryId: string;
  name: string;
  author: string;
  enabled: boolean;
  loaded: boolean;
  selectedVersion: string;
  availableVersions: string[];
  tags?: string[];
  type?: string;
  sourceUrl?: string;
}

/**
 * The public BMM API. Exposed at `window.bmm.api` for plugins and third parties,
 * and handed to the embedding host via `host.onReady`. It is a thin, stable
 * facade over the internal services; the internal services remain free to change.
 */
export interface BmmApi {
  /** Bridge/API protocol version. */
  readonly version: number;
  /** Resolved platform identity BMM is running in. */
  readonly platform: BmmPlatformInfo;

  mods: {
    /** All installed (configured) mods with resolved details. */
    list(): BmmModInfo[];
    /** Every mod available across cached registries and custom extensions. */
    available(): BmmModInfo[];
    /** A single installed mod, or null. */
    get(modId: string, registryId: string): BmmModInfo | null;
    isInstalled(modId: string, registryId: string): boolean;
    isEnabled(modId: string, registryId: string): boolean;
    isLoaded(modId: string, registryId: string): boolean;
    /** Install (and enable) an available mod, optionally pinning a version. */
    install(modId: string, registryId: string, version?: string): boolean;
    /** Enable an already-installed mod. */
    enable(modId: string, registryId: string): boolean;
    /** Disable an installed mod (a page reload is required to fully unload it). */
    disable(modId: string, registryId: string): boolean;
    /** Remove a mod's configuration entirely. */
    remove(modId: string, registryId: string): boolean;
    /** Change the selected distribution/version of an installed mod. */
    setVersion(modId: string, registryId: string, version: string): boolean;
    /** Current loader progress snapshot. */
    progress(): ModLoadProgress;
  };

  registries: {
    list(): Registry[];
    add(url: string, type?: RegistryType): Registry | null;
    remove(id: string): boolean;
    /** Re-fetch every registry manifest and refresh the cache. */
    refresh(): Promise<void>;
  };

  settings: {
    getAll(): AppSettings;
    get<K extends keyof AppSettings>(key: K): AppSettings[K];
    /** Set a setting. No-op for keys the host has locked. */
    set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void;
    /** Whether a key is pinned by the host and cannot be changed. */
    isLocked<K extends keyof AppSettings>(key: K): boolean;
  };

  ui: {
    /** Open a page (defaults to the mod manager). */
    open(page?: PageName): void;
    /** Close the active page back to the launcher. */
    close(): void;
    /** The active page, or null when nothing is open. */
    current(): PageName | null;
    /** Force the floating launcher visible/hidden, or `null` to auto-manage. */
    setLauncherVisible(visible: boolean | null): void;
  };

  sdk: {
    /**
     * The BC Mod SDK global instance BMM owns (`window.bcModSdk`), or null if it
     * is not available yet. This is the same instance mods register against, so
     * hooks/patches share one chain. Prefer obtaining it here (e.g. inside the
     * host's `onReady`) over reading `window.bcModSdk` directly, since BMM
     * guarantees it is the authoritative SDK by the time the API is ready.
     */
    get(): ModSDKGlobalAPI | null;
    /**
     * Convenience wrapper: register a mod against BMM's SDK instance. Returns the
     * per-mod API, or null when the SDK is unavailable.
     */
    registerMod(info: ModSDKModInfo, options?: ModSDKModOptions): ModSDKModAPI | null;
    /**
     * True when BC's bundled SDK initialized before BMM and could not be
     * replaced (mods had already registered). Hooks still work, but BMM's crash
     * diagnostics are limited in this state.
     */
    isHijacked(): boolean;
  };

  events: {
    /** Subscribe to an API event. Returns an unsubscribe function. */
    on<K extends keyof BmmEventMap>(type: K, listener: (payload: BmmEventMap[K]) => void): () => void;
  };

  log: {
    /** Register a named section shown in the debug report (FUSAM-compatible). */
    registerDebugMethod(name: string, method: () => string | Promise<string>): void;
  };
}

/**
 * Platform API Service
 *
 * Builds the {@link BmmApi}, owns the event bus that bridges internal service
 * notifications to API subscribers and the host, and installs the API onto
 * `window.bmm.api`. Call {@link install} once after the app shell has mounted.
 */
export class PlatformApiService {
  private static readonly listeners = new Map<keyof BmmEventMap, Set<(payload: any) => void>>();
  private static api: BmmApi | null = null;
  private static installed = false;
  // null = auto-manage (login/preference screens); boolean = forced override.
  private static launcherOverride: boolean | null = null;
  private static readonly launcherObservable = new Observable<boolean | null>({
    emitOnSubscribe: false,
  });

  /** Build the API, wire service notifications, and publish it. Idempotent. */
  static install(): BmmApi {
    if (this.installed && this.api) {
      return this.api;
    }
    this.installed = true;
    this.api = this.build();

    // Bridge internal service notifications into the unified event bus. Each of
    // these emits to both API subscribers and the host.
    ModLoaderService.subscribeProgress((progress) => this.emit("loadProgress", progress));
    ModService.subscribe((configs) => this.emit("modsChanged", configs));
    SettingsService.subscribe((settings) => this.emit("settingsChanged", settings));

    window.bmm.api = this.api;
    PlatformBridge.bindApi(this.api);
    this.emit("ready", this.api.platform);
    Logger.info("PlatformApiService: public API installed", {platform: this.api.platform.id});
    return this.api;
  }

  /** Emit an event to API subscribers and mirror it to the host bridge. */
  static emit<K extends keyof BmmEventMap>(type: K, payload: BmmEventMap[K]): void {
    const set = this.listeners.get(type);
    if (set) {
      set.forEach((listener) => {
        try {
          listener(payload);
        } catch (error) {
          Logger.error(`PlatformApiService: '${String(type)}' listener threw`, error);
        }
      });
    }
    PlatformBridge.dispatchEvent({type, payload} as BmmPlatformEvent);
  }

  /** Subscribe to launcher-visibility overrides (used by the app shell). */
  static subscribeLauncherOverride(listener: (override: boolean | null) => void): () => void {
    return this.launcherObservable.subscribe(listener);
  }

  /** Current forced launcher visibility, or null when auto-managed. */
  static launcherVisibleOverride(): boolean | null {
    return this.launcherOverride;
  }

  private static on<K extends keyof BmmEventMap>(
    type: K,
    listener: (payload: BmmEventMap[K]) => void,
  ): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  private static toModInfo(mod: ModWithDetails): BmmModInfo {
    return {
      modId: mod.modId,
      registryId: mod.registryId,
      name: mod.name,
      author: mod.author,
      enabled: mod.enabled,
      loaded: ModLoaderService.isModLoaded(mod.modId, mod.registryId),
      selectedVersion: mod.selectedVersion,
      availableVersions: mod.availableVersions,
      tags: mod.tags,
      type: mod.type,
      sourceUrl: mod.sourceUrl,
    };
  }

  private static build(): BmmApi {
    const self = this;
    return {
      version: BRIDGE_VERSION,
      platform: PlatformBridge.info(),

      mods: {
        list() {
          return ModService.getAllModsWithDetails().map((m) => self.toModInfo(m));
        },
        available() {
          return ModService.getAvailableMods().map(({addon, registryId, config}) => {
            const selectedVersion = config?.selectedVersion ?? addon.versions[0]?.distribution ?? "";
            return {
              modId: addon.id,
              registryId,
              name: formatLocalizedName(addon.name, currentLanguage()),
              author: addon.author,
              enabled: config?.enabled ?? false,
              loaded: ModLoaderService.isModLoaded(addon.id, registryId),
              selectedVersion,
              availableVersions: addon.versions.map((v) => v.distribution),
              tags: addon.tags,
              type: addon.type,
              sourceUrl: addon.versions.find((v) => v.distribution === selectedVersion)?.source,
            };
          });
        },
        get(modId, registryId) {
          const mod = ModService.getAllModsWithDetails().find(
            (m) => m.modId === modId && m.registryId === registryId,
          );
          return mod ? self.toModInfo(mod) : null;
        },
        isInstalled(modId, registryId) {
          return ModService.getConfig(modId, registryId) !== null;
        },
        isEnabled(modId, registryId) {
          return ModService.getConfig(modId, registryId)?.enabled === true;
        },
        isLoaded(modId, registryId) {
          return ModLoaderService.isModLoaded(modId, registryId);
        },
        install(modId, registryId, version) {
          const existing = ModService.getConfig(modId, registryId);
          if (existing) {
            return ModService.enableMod(modId, registryId);
          }
          const available = ModService.getAvailableMods().find(
            (m) => m.addon.id === modId && m.registryId === registryId,
          );
          if (!available || available.addon.versions.length === 0) {
            Logger.warn(`PlatformApiService: cannot install unknown mod ${modId}/${registryId}`);
            return false;
          }
          ModService.saveConfig({
            modId,
            registryId,
            enabled: true,
            selectedVersion: version ?? available.addon.versions[0].distribution,
          });
          return true;
        },
        enable(modId, registryId) {
          return ModService.enableMod(modId, registryId);
        },
        disable(modId, registryId) {
          const config = ModService.getConfig(modId, registryId);
          if (!config) {
            return false;
          }
          ModService.saveConfig({...config, enabled: false});
          ModLoaderService.markModDisabled(modId, registryId);
          return true;
        },
        remove(modId, registryId) {
          return ModService.removeConfig(modId, registryId);
        },
        setVersion(modId, registryId, version) {
          return ModService.changeVersion(modId, registryId, version);
        },
        progress() {
          return ModLoaderService.getProgress();
        },
      },

      registries: {
        list() {
          return RegistryService.getAll();
        },
        add(url, type) {
          return RegistryService.add(url, type);
        },
        remove(id) {
          return RegistryService.delete(id);
        },
        async refresh() {
          await RegistryDataService.fetchAllRegistries(RegistryService.getAll());
        },
      },

      settings: {
        getAll() {
          return SettingsService.getAll();
        },
        get(key) {
          return SettingsService.get(key);
        },
        set(key, value) {
          SettingsService.set(key, value);
        },
        isLocked(key) {
          return SettingsService.isLocked(key);
        },
      },

      ui: {
        open(page = "mod-manager") {
          window.bmm.app?.openPage(page);
        },
        close() {
          window.bmm.app?.closePage();
        },
        current() {
          return window.bmm.app?.currentPage() ?? null;
        },
        setLauncherVisible(visible) {
          self.launcherOverride = visible;
          self.launcherObservable.notify(visible);
        },
      },

      sdk: {
        get() {
          return window.bcModSdk ?? null;
        },
        registerMod(info, options) {
          const sdk = window.bcModSdk;
          if (!sdk) {
            Logger.warn("PlatformApiService: bcModSdk unavailable, cannot register mod", {mod: info.name});
            return null;
          }
          return sdk.registerMod(info, options);
        },
        isHijacked() {
          return SdkStateService.isHijacked();
        },
      },

      events: {
        on(type, listener) {
          return self.on(type, listener);
        },
      },

      log: {
        registerDebugMethod(name, method) {
          LogService.registerDebugMethod(name, method);
        },
      },
    };
  }
}
