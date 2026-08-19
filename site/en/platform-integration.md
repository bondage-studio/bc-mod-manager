---
title: Platform integration
description: Embed BMM in a host (browser shell, Electron, reverse proxy) via window.__bmmHost — intercept storage and network, pin settings, and drive the UI.
order: 6
---

BMM runs *inside* a host page — a plain browser tab, a third-party Electron
client, or a reverse-proxy client (such as studio-bondage-club, which injects BMM
as one of its userscripts). The **platform bridge** lets such a host drive BMM and
intercept what it persists and fetches.

If you only want to read and control BMM from a mod or plugin, you want the
[plugin-api](plugin-api) instead — no host object required.

## How it works

A host advertises itself by placing a `BmmHost` object on `window.__bmmHost`
**before** the BMM bundle runs (at `document-start`). BMM captures it into a
module closure at startup and erases the global, so later (untrusted) mod scripts
can't read or impersonate it.

```
window.__bmmHost ──(captured at startup)──► PlatformBridge
   host → BMM: storage, fetch, settings, UI/lifecycle flags
   BMM → host: host.onReady(api) + host.onEvent(event)
```

With no host present, BMM behaves exactly as a vanilla browser install, and
`window.bmm.api` is still published for plugins.

## The host object

Every field is optional — supply only what the platform needs.

```js
// Injected by the host at document-start, BEFORE the BMM script tag.
window.__bmmHost = {
  version: 1,
  platform: {
    id: "studio-bondage-club",
    name: "Studio Bondage Club",
    version: "1.4.2",
    capabilities: ["storage", "fetch", "reload"],
  },

  // --- UI / lifecycle integration ---
  ui: {
    hideLauncher: true,       // host renders its own entry point
    autoOpen: "mod-manager",  // open straight into a page on boot
    suppressReload: true,     // host owns reloads (see reloadRequested)
  },

  // --- Pinned settings (read-only in BMM's UI) ---
  settings: { modCacheEnabled: false },

  // --- Storage takeover (replaces localStorage for BMM keys) ---
  storage: {
    getItem: (k) => myKvGet(k),
    setItem: (k, v) => myKvSet(k, v),
    removeItem: (k) => myKvDelete(k),
    clear: () => myKvClear(),
  },

  // --- Network interception for BMM's data fetches ---
  // Applies to registry manifests, eval-mod sources, and cache validation.
  // NOTE: <script src> element loads still go through the browser unchanged.
  fetch: (url, init) => myProxiedFetch(url, init),

  // --- BMM → host ---
  onReady: (api) => { myHost.bmm = api; },       // the public API, ready to use
  onEvent: (event) => myHost.dispatch(event),    // { type, payload }
};
```

## Capability reference

| Field | Direction | Effect |
| --- | --- | --- |
| `platform` | host → BMM | Identity surfaced via `api.platform`, in logs and the UI. |
| `ui.hideLauncher` | host → BMM | Suppresses the floating launcher entirely. |
| `ui.autoOpen` | host → BMM | Opens the named page once BMM mounts. |
| `ui.suppressReload` | host → BMM | BMM emits `reloadRequested` instead of `location.reload()`. |
| `settings` | host → BMM | Pins settings; pinned keys override stored values and reject UI writes. |
| `storage` | host → BMM | Replaces `localStorage` as BMM's persistence backend. |
| `fetch` | host → BMM | Overrides registry / eval-source / cache-validation fetches. |
| `onReady(api)` | BMM → host | Receives the public API when ready. |
| `onEvent(event)` | BMM → host | Receives lifecycle/state events. |

The API handed to `onReady` and the events delivered to `onEvent` are exactly the
same surface plugins use — see [plugin-api](plugin-api) for the full method and
event reference.

## Accessing the Mod SDK

BMM owns and initializes the [BC Mod SDK](https://github.com/Jomshir98/bondage-club-mod-sdk)
and publishes it as `window.bcModSdk`. A host that wants to register its own hooks
or patches should get the SDK through the API handed to `onReady`, **not** by
reading the global — `onReady` fires once BMM has resolved the SDK race with BC's
own bundled SDK and guarantees the instance is the authoritative one:

```js
window.__bmmHost = {
  platform: { id: "studio-bondage-club", name: "Studio Bondage Club" },
  onReady(api) {
    if (api.sdk.isHijacked()) {
      console.warn("BC's bundled SDK won the race; diagnostics limited");
    }

    // Register the host's own mod against the same SDK instance.
    const mod = api.sdk.registerMod({
      name: "StudioHost",
      fullName: "Studio Bondage Club host",
      version: "1.4.2",
    });
    mod?.hookFunction("ServerSend", 1, (args, next) => next(args));

    // ...or grab the raw SDK global for full access:
    const sdk = api.sdk.get(); // ModSDKGlobalAPI | null
  },
};
```

Why go through `api.sdk` instead of `window.bcModSdk`:

- **Timing.** The host injects `__bmmHost` at `document-start`, before BMM creates
  the SDK. By the time `onReady` runs, `window.bcModSdk` exists; `api.sdk.get()`
  saves you from polling for it.
- **Authoritative instance.** BMM may replace a pre-existing SDK with its own.
  `api.sdk` always returns the instance BMM (and every mod) actually uses.
- **Hijack awareness.** `api.sdk.isHijacked()` tells you when BC's bundled SDK
  loaded first and couldn't be replaced.

The SDK surface (`registerMod`, `hookFunction`, `patchFunction`, …) is documented
upstream and summarized in [plugin-api](plugin-api#mod-sdk).

## Patterns

**Drive BMM after it's ready.** `onReady` gives you the API as soon as it exists;
no polling needed:

```js
window.__bmmHost = {
  platform: { id: "electron-foo", name: "Foo Client" },
  onReady(api) {
    api.events.on("modsChanged", (configs) => syncToDisk(configs));
    if (api.mods.list().length === 0) api.ui.open("mod-manager");
  },
};
```

**Own the reload.** When an embedded view can't `location.reload()` itself, set
`ui.suppressReload` and handle the event:

```js
window.__bmmHost = {
  ui: { suppressReload: true },
  onEvent(event) {
    if (event.type === "reloadRequested") myWebview.reload();
  },
};
```

**Scope storage per account.** Supply a `storage` backend keyed by the logged-in
character so each account keeps its own mod set:

```js
window.__bmmHost = {
  storage: {
    getItem: (k) => accountStore.get(currentAccount, k),
    setItem: (k, v) => accountStore.set(currentAccount, k, v),
    removeItem: (k) => accountStore.del(currentAccount, k),
  },
};
```

## Boundaries

- **Not a security boundary.** Capturing and deleting `window.__bmmHost` is
  best-effort hardening, not isolation. Co-resident mod scripts share the page; a
  host that needs real isolation must enforce it at its own layer (for example a
  reverse proxy's per-frame capability token).
- **`<script src>` loads are not proxied.** The `fetch` override covers data
  fetches only. For full control of mod *script* loads, intercept at the network
  layer — a reverse proxy already does this for `<script src>`.
- **The launcher dock position** (a cosmetic UI preference) still uses
  `localStorage` directly and is not routed through host `storage`.