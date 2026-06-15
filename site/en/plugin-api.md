---
title: Plugin API
description: Call window.bmm.api from a mod or plugin to read and control BMM — mods, registries, settings, UI, and events.
order: 5
---

BMM exposes a stable, namespaced API at `window.bmm.api` for mods, plugins, and
third-party code running on the same page. Use it to read and control mods,
registries, settings and the UI, and to subscribe to lifecycle events.

For embedding BMM inside a host (a browser shell, an Electron client, or a
reverse-proxy client) and intercepting its storage / network, see
[platform-integration](platform-integration).

## Readiness

`window.bmm.api` is installed once BMM's app shell has mounted, so it may be
absent for a moment at startup. Guard for it, and poll or wait if you load early:

```js
function withBmm(fn) {
  if (window.bmm?.api) return fn(window.bmm.api);
  const timer = setInterval(() => {
    if (window.bmm?.api) {
      clearInterval(timer);
      fn(window.bmm.api);
    }
  }, 50);
}

withBmm((api) => {
  console.log("BMM", api.version, "on", api.platform.name);
});
```

`api.version` is the API/bridge protocol version (a number). `api.platform`
identifies where BMM is running:

```ts
interface BmmPlatformInfo {
  id: string;            // "browser", "studio-bondage-club", "electron-foo", ...
  name: string;
  version?: string;
  capabilities: string[];
  embedded: boolean;     // true when running inside a host (not a plain tab)
}
```

## Mods

```js
const api = window.bmm.api;

api.mods.list();                                // installed mods (BmmModInfo[])
api.mods.available();                           // every installable mod
api.mods.get(modId, registryId);               // BmmModInfo | null
api.mods.isInstalled(modId, registryId);
api.mods.isEnabled(modId, registryId);
api.mods.isLoaded(modId, registryId);

api.mods.install(modId, registryId, "stable"); // install + enable (version optional)
api.mods.enable(modId, registryId);
api.mods.disable(modId, registryId);           // needs a reload to fully unload
api.mods.remove(modId, registryId);
api.mods.setVersion(modId, registryId, "beta");

api.mods.progress();                            // ModLoadProgress snapshot
```

A mod is addressed by the pair `(modId, registryId)`. Each entry looks like:

```ts
interface BmmModInfo {
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
```

> Disabling or removing an already-loaded mod needs a page reload to fully take
> effect — most BC mods can't be unloaded once executed. BMM handles the reload
> when the mod manager closes (or defers to the host; see
> [platform-integration](platform-integration)).

## Registries

```js
api.registries.list();
api.registries.add("https://example.com/manifest.json"); // type defaults to "fusam"
api.registries.remove(registryId);
await api.registries.refresh();                           // re-fetch all manifests
```

## Settings

```js
api.settings.getAll();
api.settings.get("modCacheEnabled");
api.settings.set("modCacheEnabled", true);
api.settings.isLocked("modCacheEnabled");  // true when pinned by the host
```

When BMM runs inside a host that pins a setting, `set()` is a no-op for that key
and `isLocked()` returns `true`. Check it before offering the user a toggle.

## UI control

```js
api.ui.open("mod-manager");        // open a page (defaults to "mod-manager")
api.ui.close();                    // close back to the launcher
api.ui.current();                  // active page name, or null
api.ui.setLauncherVisible(true);   // force the launcher on/off; null = auto-manage
```

Page names: `"mod-manager"`, `"registry-manager"`, `"log-viewer"`, `"settings"`.

## Events

`api.events.on(type, listener)` returns an unsubscribe function:

```js
const off = api.events.on("loadProgress", (p) => {
  console.log(`${p.loaded}/${p.total} loaded, ${p.errored} failed`);
});
// later: off();
```

| Event | Payload | Fires when |
| --- | --- | --- |
| `ready` | `BmmPlatformInfo` | The API has been installed. |
| `loadProgress` | `ModLoadProgress` | A mod's load lifecycle changes. |
| `modsChanged` | `ModConfig[]` | A mod is installed / enabled / version-changed / removed. |
| `settingsChanged` | `AppSettings` | A setting changes. |
| `pageChanged` | `{ page }` | The active page changes (`null` = closed). |
| `reloadRequested` | `{ reason }` | BMM wants a reload but the host owns reloads. |

## Debug report

Register a named section that appears in BMM's debug report and log viewer
(FUSAM-compatible with `FUSAM.registerDebugMethod`):

```js
api.log.registerDebugMethod("My Plugin", () => {
  return `state: ${JSON.stringify(myPluginState)}`;
});
```

## Notes

- Mods and plugins share the page with BMM; the API is not a security boundary.
- `<script src>` mod loads go through the browser directly and are not affected
  by a host's `fetch` override.