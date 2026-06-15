---
title: 插件 API
description: 在模组或插件中调用 window.bmm.api 读取与控制 BMM —— 模组、registry、设置、UI 与事件。
order: 5
---

BMM 在 `window.bmm.api` 上暴露了一套稳定、带命名空间的 API，供同页运行的模组、
插件与第三方代码使用。你可以用它读取和控制模组、registry、设置与 UI，并订阅生命
周期事件。

如果你要把 BMM 嵌入到某个宿主中（浏览器外壳、Electron 客户端或反代客户端）并拦截
其存储 / 网络，请看[平台集成](platform-integration)。

## 就绪检测

`window.bmm.api` 在 BMM 的应用外壳挂载后才安装，因此启动初期可能短暂不存在。请做好
判空，若你加载较早可轮询等待：

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

`api.version` 是 API/桥接协议版本（数字）。`api.platform` 标识 BMM 的运行环境：

```ts
interface BmmPlatformInfo {
  id: string;            // "browser"、"studio-bondage-club"、"electron-foo" 等
  name: string;
  version?: string;
  capabilities: string[];
  embedded: boolean;     // 在宿主中运行时为 true（非普通标签页）
}
```

## 模组

```js
const api = window.bmm.api;

api.mods.list();                                // 已安装的模组（BmmModInfo[]）
api.mods.available();                           // 所有可安装的模组
api.mods.get(modId, registryId);               // BmmModInfo | null
api.mods.isInstalled(modId, registryId);
api.mods.isEnabled(modId, registryId);
api.mods.isLoaded(modId, registryId);

api.mods.install(modId, registryId, "stable"); // 安装并启用（版本可选）
api.mods.enable(modId, registryId);
api.mods.disable(modId, registryId);           // 需刷新页面才能完全卸载
api.mods.remove(modId, registryId);
api.mods.setVersion(modId, registryId, "beta");

api.mods.progress();                            // ModLoadProgress 快照
```

一个模组由 `(modId, registryId)` 这对值定位。每条记录形如：

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

> 禁用或移除一个已加载的模组需刷新页面才能完全生效 —— 大多数 BC 模组执行后无法被
> 卸载。BMM 会在模组管理器关闭时处理刷新（或交由宿主处理，见
> [平台集成](platform-integration)）。

## Registry

```js
api.registries.list();
api.registries.add("https://example.com/manifest.json"); // type 默认为 "fusam"
api.registries.remove(registryId);
await api.registries.refresh();                           // 重新拉取所有 manifest
```

## 设置

```js
api.settings.getAll();
api.settings.get("modCacheEnabled");
api.settings.set("modCacheEnabled", true);
api.settings.isLocked("modCacheEnabled");  // 被宿主锁定时为 true
```

当 BMM 运行在锁定了某项设置的宿主中时，`set()` 对该键无效，且 `isLocked()` 返回
`true`。在向用户提供开关前先检查它。

## UI 控制

```js
api.ui.open("mod-manager");        // 打开页面（默认 "mod-manager"）
api.ui.close();                    // 关闭回到启动器
api.ui.current();                  // 当前页面名，或 null
api.ui.setLauncherVisible(true);   // 强制显示/隐藏启动器；null = 自动管理
```

页面名：`"mod-manager"`、`"registry-manager"`、`"log-viewer"`、`"settings"`。

## 事件

`api.events.on(type, listener)` 返回一个取消订阅函数：

```js
const off = api.events.on("loadProgress", (p) => {
  console.log(`${p.loaded}/${p.total} 已加载，${p.errored} 失败`);
});
// 之后：off();
```

| 事件 | 载荷 | 触发时机 |
| --- | --- | --- |
| `ready` | `BmmPlatformInfo` | API 已安装。 |
| `loadProgress` | `ModLoadProgress` | 某模组的加载生命周期变化。 |
| `modsChanged` | `ModConfig[]` | 安装 / 启用 / 改版本 / 移除模组。 |
| `settingsChanged` | `AppSettings` | 某项设置变化。 |
| `pageChanged` | `{ page }` | 活动页面变化（`null` = 已关闭）。 |
| `reloadRequested` | `{ reason }` | BMM 需要刷新但刷新由宿主接管。 |

## 调试报告

注册一个出现在 BMM 调试报告与日志查看器中的命名段（与 FUSAM 的
`FUSAM.registerDebugMethod` 兼容）：

```js
api.log.registerDebugMethod("My Plugin", () => {
  return `state: ${JSON.stringify(myPluginState)}`;
});
```

## 注意

- 模组和插件与 BMM 共享页面；该 API 不是安全边界。
- `<script src>` 形式的模组加载由浏览器直接发起，不受宿主 `fetch` 覆盖影响。