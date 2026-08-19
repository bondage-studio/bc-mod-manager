declare interface Bmm {
  shadowRootContainer: HTMLDivElement;
  shadowRoot: ShadowRoot;
  root: HTMLDivElement;
  app: import('@/app.tsx').default;
  /**
   * Public, stable API for plugins and third parties. Installed once the app
   * shell has mounted (see main.tsx); absent before then.
   */
  api?: import('@/service/PlatformApiService').BmmApi;
}

/**
 * Loader version bridge published by the bootstrap userscript (public/bmm.user.js).
 * Absent when running outside the userscript (e.g. the Vite dev server).
 */
declare interface BmmLoaderState {
  loadedVersion: string | null;
  latestVersion: string | null;
  listeners: Array<(latestVersion: string | null) => void>;
}

declare interface Window {
  bmm: Bmm;
  __bmmLoader?: BmmLoaderState;
  __bmmHost?: import('@/infrastructure/bridge/PlatformBridge').BmmHost;
}
