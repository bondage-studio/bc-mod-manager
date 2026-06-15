// The runtime module is the vendored `bondage-club-mod-sdk` build (aliased to
// `.built-sdk/` by Vite). It is imported for its side effect in main.tsx, which
// publishes the SDK global as `window.bcModSdk`.
declare module 'bondage-club-mod-sdk';

/** Any function — used by the SDK's hook/patch signatures. */
type AnyFunction = (...args: any[]) => any;

/**
 * A mod hook: receives the original arguments plus a `next` continuation that
 * calls the original (or next hook in the chain); its return value replaces the
 * original return value.
 */
type PatchHook<TFunction extends AnyFunction = AnyFunction> = (
  args: [...Parameters<TFunction>],
  next: (args: [...Parameters<TFunction>]) => ReturnType<TFunction>,
) => ReturnType<TFunction>;

/** Info a mod supplies when registering with the SDK. */
interface ModSDKModInfo {
  name: string;
  fullName: string;
  version: string;
  repository?: string;
}

/** Optional registration flags. */
interface ModSDKModOptions {
  /** When true, re-registering the same name unloads and replaces the old one. */
  allowReplace?: boolean;
}

/** The per-mod API returned by `registerMod`. */
interface ModSDKModAPI {
  unload(): void;
  hookFunction(functionName: string, priority: number, hook: PatchHook): () => void;
  callOriginal(functionName: string, args: any[], context?: any): any;
  patchFunction(functionName: string, patches: Record<string, string | null>): void;
  removePatches(functionName: string): void;
  getOriginalHash(functionName: string): string;
}

/**
 * The global Mod SDK API, accessible as `window.bcModSdk`. BMM owns/initializes
 * this; mods and hosts register against the same instance.
 */
interface ModSDKGlobalAPI {
  readonly version: string;
  readonly apiVersion: number;
  registerMod(info: ModSDKModInfo, options?: ModSDKModOptions): ModSDKModAPI;
  getModsInfo(): ModSDKModInfo[];
  getPatchingInfo(): Map<string, unknown>;
}

interface Window {
  /** The BC Mod SDK global, published when the SDK initializes (see main.tsx). */
  bcModSdk?: ModSDKGlobalAPI;
}