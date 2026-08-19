import {Logger} from "@/infrastructure/logging/Logger";
import type {AppSettings} from "@/domain/Settings";
import type {BmmApi, BmmPlatformEvent} from "@/service/PlatformApiService";

/**
 * Platform Bridge
 *
 * BMM runs *inside* a host page — a plain browser tab, a third-party Electron
 * client, or our reverse-proxy client (studio-bondage-club, which injects BMM as
 * one of its userscripts). This module is the single seam through which such a
 * host can drive BMM and through which BMM offers a public API back.
 *
 * The host advertises itself by placing a {@link BmmHost} object on
 * `window.__bmmHost` *before* the BMM bundle runs (document-start). Like the
 * native bridge in studio-bondage-club, we capture it into module closure at
 * import time and erase the global so later (untrusted) mod scripts can't reach
 * or impersonate it. When no host is present every accessor returns a safe
 * default and BMM behaves exactly as a vanilla browser install.
 *
 * Direction of control:
 *  - host -> BMM: storage/fetch interception, locked settings, UI/lifecycle
 *    flags (read by the services and the app shell).
 *  - BMM -> host: lifecycle events ({@link dispatchEvent}) and the ready public
 *    API handed over via {@link bindApi}; the host then calls `window.bmm.api`.
 */

/** Storage backend a host may supply to replace `localStorage` for BMM keys. */
export interface BmmHostStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear?(): void;
}

/** Identity a host reports about the platform BMM is embedded in. */
export interface BmmHostPlatform {
  /** Stable machine id, e.g. "studio-bondage-club", "electron-foo". */
  id: string;
  /** Human-readable label shown in the UI and logs. */
  name?: string;
  /** Host build version. */
  version?: string;
  /** Free-form capability tags the host opts into (for feature detection). */
  capabilities?: string[];
}

/** UI / lifecycle integration flags a host may set. */
export interface BmmHostUiConfig {
  /** Hide BMM's floating launcher (the host renders its own entry point). */
  hideLauncher?: boolean;
  /** Open this page immediately once BMM has mounted. */
  autoOpen?: import("@/app").PageName;
  /**
   * The host owns page reloads. When set, BMM emits a `reloadRequested` event
   * instead of calling `window.location.reload()` (e.g. after a mod is disabled),
   * so the host can reload the embedded view on its own terms.
   */
  suppressReload?: boolean;
}

/** The capability object a host publishes on `window.__bmmHost`. */
export interface BmmHost {
  /** Bridge protocol version the host targets (current is {@link BRIDGE_VERSION}). */
  version?: number;
  platform?: BmmHostPlatform;
  ui?: BmmHostUiConfig;
  /**
   * Settings the host pins. These override stored values and are surfaced as
   * read-only ("managed by platform") in the settings UI.
   */
  settings?: Partial<AppSettings>;
  /** Replaces `localStorage` as BMM's persistence backend when present. */
  storage?: BmmHostStorage;
  /**
   * Overrides network fetches BMM performs for registry manifests, eval-mod
   * sources and cache validation (e.g. to route through a proxy cache or RPC).
   * `<script src>` loads still go through the browser and are not affected.
   */
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Invoked once with the public API as soon as BMM is ready. */
  onReady?: (api: BmmApi) => void;
  /** Receives lifecycle/state events pushed from BMM. */
  onEvent?: (event: BmmPlatformEvent) => void;
}

/** Resolved platform identity, always populated (defaults to the browser). */
export interface BmmPlatformInfo {
  id: string;
  name: string;
  version?: string;
  capabilities: string[];
  /** True when a host bridge is present (i.e. BMM is embedded). */
  embedded: boolean;
}

/** The bridge protocol version this BMM build implements. */
export const BRIDGE_VERSION = 1;

const HOST_GLOBAL = "__bmmHost";

const holder = window as unknown as Record<string, BmmHost | undefined>;
const captured = holder[HOST_GLOBAL];
let host: BmmHost | null = captured && typeof captured === "object" ? captured : null;

if (host) {
  try {
    // Best-effort: drop the global so later untrusted mod code can't read or
    // swap it. Our closure reference survives.
    delete holder[HOST_GLOBAL];
  } catch {
    // Non-configurable on some engines — ignore.
  }
  Logger.info("PlatformBridge: host detected", {
    id: host.platform?.id,
    version: host.version,
  });
}

export class PlatformBridge {
  /** Whether a host bridge captured at startup is present. */
  static isEmbedded(): boolean {
    return host !== null;
  }

  /** Resolved platform identity (safe defaults when running standalone). */
  static info(): BmmPlatformInfo {
    const p = host?.platform;
    return {
      id: p?.id ?? "browser",
      name: p?.name ?? p?.id ?? "Browser",
      version: p?.version,
      capabilities: p?.capabilities ? [...p.capabilities] : [],
      embedded: host !== null,
    };
  }

  /** Host-supplied storage backend, or null to use `localStorage`. */
  static storage(): BmmHostStorage | null {
    return host?.storage ?? null;
  }

  /** Host UI/lifecycle flags (empty object when standalone). */
  static ui(): BmmHostUiConfig {
    return host?.ui ?? {};
  }

  /** Settings pinned by the host; keys present here are locked in the UI. */
  static settingsOverrides(): Partial<AppSettings> {
    return host?.settings ?? {};
  }

  /**
   * Fetch through the host override when provided, else the global `fetch`.
   * Used for data fetches (registry/eval source/cache validation), not for
   * `<script src>` element loads which the browser performs directly.
   */
  static fetch(url: string, init?: RequestInit): Promise<Response> {
    if (host?.fetch) {
      return host.fetch(url, init);
    }
    return window.fetch(url, init);
  }

  /** Hand the ready public API to the host (calls `host.onReady`). */
  static bindApi(api: BmmApi): void {
    if (!host?.onReady) {
      return;
    }
    try {
      host.onReady(api);
    } catch (error) {
      Logger.error("PlatformBridge: host.onReady threw", error);
    }
  }

  /** Push a lifecycle/state event to the host (calls `host.onEvent`). */
  static dispatchEvent(event: BmmPlatformEvent): void {
    if (!host?.onEvent) {
      return;
    }
    try {
      host.onEvent(event);
    } catch (error) {
      Logger.error("PlatformBridge: host.onEvent threw", error);
    }
  }
}
