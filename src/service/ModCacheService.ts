import {ModVersionPinRepository} from '@/repository/ModVersionPinRepository';
import {Observable} from '@/infrastructure/pubsub/Observable';
import {Logger} from '@/infrastructure/logging/Logger';
import {PlatformBridge} from '@/infrastructure/bridge/PlatformBridge';

/**
 * Per-mod runtime cache state. Mirrors the loader version bridge in
 * public/bmm.user.js, but tracked per mod inside the page.
 *
 * `loadedVersion` is the pinned content hash we booted from (null on a fresh
 * load whose content is current by definition); `latestVersion` is refreshed by
 * validate() once the newest build has been fetched and hashed.
 */
interface ModCacheRuntime {
  sourceUrl: string;
  loadedVersion: string | null;
  latestVersion: string | null;
}

type CacheListener = () => void;

// Run the background update check shortly after the mod has been injected so it
// never blocks (or competes with) the initial load.
const VALIDATE_DELAY_MS = 1500;

/**
 * Mod Cache Service
 *
 * Implements a bmm.user.js-style cached loading mechanism for individual mods:
 * the stable `?v=<hash>` URL is served from the browser's HTTP cache on repeat
 * visits, while a background check re-fetches the canonical source, hashes it,
 * and repoints the pin if it changed so the NEXT load picks up the new build.
 * When the cached build differs from the latest, the mod is reported as
 * outdated so the loading window can prompt the user to reload.
 *
 * Mods that opt out of cache busting (FUSAM `noCacheBusting`) never reach this
 * service; the loader honours their URL verbatim.
 */
export class ModCacheService {
  // In-memory per-mod runtime state, keyed by modKey (`${modId}_${registryId}`).
  private static runtime: Map<string, ModCacheRuntime> = new Map();
  private static scheduledValidations: Map<string, number> = new Map();
  // A token, fixed for the lifetime of this page, used to force a fresh fetch
  // when caching is disabled — stable within the session so a preload and its
  // load resolve to the same URL, but new on the next visit.
  private static sessionToken: string | null = null;
  // Persisted `sourceUrl -> pinned content hash` map.
  private static readonly pins = new ModVersionPinRepository();
  private static readonly observable = new Observable<void>({
    emitOnSubscribe: false,
    onListenerError: (error) => Logger.error('ModCacheService: listener threw', error),
  });

  /**
   * Decide how to load a mod source and produce the URL to request.
   * `cached` is true only for the pinned cache mode (the caller should then
   * register the load with beginLoad() and schedule a validation).
   */
  static planLoad(sourceUrl: string, cacheEnabled: boolean, noCacheBusting: boolean): { url: string; cached: boolean } {
    // Honour the author's opt-out (and anything we can't cache-bust safely):
    // load the URL exactly as provided.
    if (noCacheBusting || !this.isCacheableUrl(sourceUrl)) {
      return {url: sourceUrl, cached: false};
    }
    // Caching on: serve the pinned (cached) build and detect updates.
    if (cacheEnabled) {
      return {url: this.resolveLoadUrl(sourceUrl), cached: true};
    }
    // Caching off: force a fresh fetch on every visit.
    return {url: this.freshUrl(sourceUrl), cached: false};
  }

  /**
   * Record that a mod is being loaded from the pinned (possibly cached) build so
   * its staleness can be reported later. A pinned hash means we may be booting a
   * cached build; no pin means a fresh load whose content is current.
   */
  static beginLoad(modKey: string, sourceUrl: string): void {
    const pinned = this.getPinnedVersion(sourceUrl);
    this.runtime.set(modKey, {sourceUrl, loadedVersion: pinned, latestVersion: pinned});
  }

  /** Whether the running mod booted from a pinned (potentially stale) build. */
  static hasPin(modKey: string): boolean {
    return this.runtime.get(modKey)?.loadedVersion != null;
  }

  /**
   * Drop the pin for a mod whose pinned URL failed to load so the caller can
   * retry the canonical URL. The mod is no longer considered outdated.
   */
  static clearPin(modKey: string, sourceUrl: string): void {
    this.setPinnedVersion(sourceUrl, null);
    const entry = this.runtime.get(modKey);
    if (entry) {
      entry.loadedVersion = null;
      entry.latestVersion = null;
    }
    this.notify();
  }

  /** Forget a mod's runtime state (e.g. it failed to load) so it never prompts. */
  static clearRuntime(modKey: string): void {
    if (this.runtime.delete(modKey)) {
      this.notify();
    }
  }

  /** Schedule a one-off background update check after a mod has been loaded. */
  static scheduleValidate(modKey: string, sourceUrl: string): void {
    if (this.scheduledValidations.has(modKey)) {
      return;
    }
    const timer = window.setTimeout(() => {
      this.scheduledValidations.delete(modKey);
      void this.validate(modKey, sourceUrl);
    }, VALIDATE_DELAY_MS);
    this.scheduledValidations.set(modKey, timer);
  }

  /**
   * Best-effort update check: re-fetch the canonical source (cache:"no-cache"
   * => a cheap 304 when unchanged), hash the body, and repoint the pin if it
   * changed so the NEXT load uses the new build. Never throws, never blocks.
   */
  static async validate(modKey: string, sourceUrl: string): Promise<void> {
    if (typeof fetch !== 'function') {
      return;
    }
    try {
      const response = await PlatformBridge.fetch(sourceUrl, {mode: 'cors', credentials: 'omit', cache: 'no-cache'});
      if (!response.ok) {
        return;
      }
      const text = await response.text();
      const hash = this.hash(text);

      let changed = false;
      const entry = this.runtime.get(modKey);
      if (entry && entry.latestVersion !== hash) {
        entry.latestVersion = hash;
        changed = true;
      }
      if (hash !== this.getPinnedVersion(sourceUrl)) {
        this.setPinnedVersion(sourceUrl, hash);
      }
      if (changed) {
        this.notify();
      }
    } catch {
      // offline / blocked / CORS: keep the cached version.
    }
  }

  /** Whether a specific mod is running an older build than the latest known. */
  static isModOutdated(modKey: string): boolean {
    const entry = this.runtime.get(modKey);
    return !!entry
      && entry.loadedVersion != null
      && entry.latestVersion != null
      && entry.loadedVersion !== entry.latestVersion;
  }

  /** Number of loaded mods whose cached build is older than the latest. */
  static getOutdatedCount(): number {
    let count = 0;
    this.runtime.forEach(entry => {
      if (entry.loadedVersion != null && entry.latestVersion != null && entry.loadedVersion !== entry.latestVersion) {
        count++;
      }
    });
    return count;
  }

  /** Keys of loaded mods whose cached build is older than the latest. */
  static getOutdatedModKeys(): string[] {
    const keys: string[] = [];
    this.runtime.forEach((entry, modKey) => {
      if (entry.loadedVersion != null && entry.latestVersion != null && entry.loadedVersion !== entry.latestVersion) {
        keys.push(modKey);
      }
    });
    return keys;
  }

  static isAnyOutdated(): boolean {
    return this.getOutdatedCount() > 0;
  }

  /**
   * Subscribe to cache state changes (an update was detected, or a pin was
   * dropped). Returns an unsubscribe function.
   */
  static subscribe(listener: CacheListener): () => void {
    return this.observable.subscribe(listener);
  }

  /**
   * Dependency-free 53-bit hash (cyrb53) — matches public/bmm.user.js so the
   * same content always hashes to the same pin. No crypto.subtle / secure
   * context required.
   */
  static hash(str: string): string {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  /** Only http(s) URLs can be cache-busted and fetched for validation. */
  static isCacheableUrl(sourceUrl: string): boolean {
    try {
      const url = new URL(sourceUrl);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private static resolveLoadUrl(sourceUrl: string): string {
    const pinned = this.getPinnedVersion(sourceUrl);
    // No pin yet => load the canonical URL; its content is current by definition
    // and validate() will pin it for the next visit.
    return pinned ? this.cacheBustUrl(sourceUrl, pinned) : sourceUrl;
  }

  private static freshUrl(sourceUrl: string): string {
    return this.cacheBustUrl(sourceUrl, this.getSessionToken());
  }

  private static getSessionToken(): string {
    if (this.sessionToken === null) {
      this.sessionToken = 'r' + Date.now();
    }
    return this.sessionToken;
  }

  private static cacheBustUrl(sourceUrl: string, token: string): string {
    try {
      const url = new URL(sourceUrl);
      url.searchParams.set('v', token);
      return url.toString();
    } catch {
      const separator = sourceUrl.includes('?') ? '&' : '?';
      return `${sourceUrl}${separator}v=${encodeURIComponent(token)}`;
    }
  }

  private static getPinnedVersion(sourceUrl: string): string | null {
    return this.pins.get(sourceUrl);
  }

  private static setPinnedVersion(sourceUrl: string, hash: string | null): void {
    this.pins.set(sourceUrl, hash);
  }

  private static notify(): void {
    this.observable.notify(undefined);
  }
}
