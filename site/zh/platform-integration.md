---
title: 平台集成
description: 通过 window.__bmmHost 把 BMM 嵌入宿主（浏览器外壳、Electron、反代客户端）—— 拦截存储与网络、锁定设置、驱动 UI。
order: 6
---

BMM 运行在宿主页面*内部* —— 可能是普通浏览器标签页、第三方 Electron 客户端，或反代
客户端（如 studio-bondage-club，它把 BMM 作为注入的用户脚本之一）。**平台桥接**让这样
的宿主能够驱动 BMM，并拦截它所持久化和拉取的内容。

如果你只想从模组或插件中读取和控制 BMM，应使用[插件 API](plugin-api)，无需宿主对象。

## 工作原理

宿主通过在 BMM 包运行**之前**（`document-start`）于 `window.__bmmHost` 放置一个
`BmmHost` 对象来表明自身。BMM 在启动时将其捕获进模块闭包并删除该全局变量，使后续
（不受信任的）模组脚本无法读取或冒充它。

```
window.__bmmHost ──(启动时捕获)──► PlatformBridge
   宿主 → BMM：存储、fetch、设置、UI/生命周期 标志
   BMM → 宿主：host.onReady(api) + host.onEvent(event)
```

没有宿主时，BMM 的行为与纯浏览器安装完全一致，且 `window.bmm.api` 仍会发布给插件。

## 宿主对象

每个字段都是可选的 —— 只提供平台需要的部分。

```js
// 由宿主在 document-start、BMM 脚本标签之前注入。
window.__bmmHost = {
  version: 1,
  platform: {
    id: "studio-bondage-club",
    name: "Studio Bondage Club",
    version: "1.4.2",
    capabilities: ["storage", "fetch", "reload"],
  },

  // --- UI / 生命周期集成 ---
  ui: {
    hideLauncher: true,       // 宿主自带入口
    autoOpen: "mod-manager",  // 启动时直接打开某个页面
    suppressReload: true,     // 由宿主接管刷新（见 reloadRequested）
  },

  // --- 锁定设置（在 BMM UI 中只读）---
  settings: { modCacheEnabled: false },

  // --- 接管存储（替代 localStorage 作为 BMM 的存储后端）---
  storage: {
    getItem: (k) => myKvGet(k),
    setItem: (k, v) => myKvSet(k, v),
    removeItem: (k) => myKvDelete(k),
    clear: () => myKvClear(),
  },

  // --- 拦截 BMM 的数据请求 ---
  // 作用于 registry manifest、eval 模组源和缓存校验。
  // 注意：<script src> 元素加载仍由浏览器原样发起。
  fetch: (url, init) => myProxiedFetch(url, init),

  // --- BMM → 宿主 ---
  onReady: (api) => { myHost.bmm = api; },       // 就绪的公开 API
  onEvent: (event) => myHost.dispatch(event),    // { type, payload }
};
```

## 能力参考

| 字段 | 方向 | 作用 |
| --- | --- | --- |
| `platform` | 宿主 → BMM | 通过 `api.platform`、日志和 UI 体现的身份。 |
| `ui.hideLauncher` | 宿主 → BMM | 完全隐藏悬浮启动器。 |
| `ui.autoOpen` | 宿主 → BMM | BMM 挂载后打开指定页面。 |
| `ui.suppressReload` | 宿主 → BMM | BMM 改为发出 `reloadRequested` 事件，而非 `location.reload()`。 |
| `settings` | 宿主 → BMM | 锁定设置；被锁定的键覆盖存储值并拒绝 UI 写入。 |
| `storage` | 宿主 → BMM | 替代 `localStorage` 作为 BMM 的存储后端。 |
| `fetch` | 宿主 → BMM | 覆盖 registry / eval 源 / 缓存校验的请求。 |
| `onReady(api)` | BMM → 宿主 | 就绪时接收公开 API。 |
| `onEvent(event)` | BMM → 宿主 | 接收生命周期/状态事件。 |

交给 `onReady` 的 API 与发给 `onEvent` 的事件，与插件使用的是完全相同的接口面 ——
完整的方法与事件参考见[插件 API](plugin-api)。

## 模式

**就绪后驱动 BMM。** `onReady` 在 API 一存在时就交给你，无需轮询：

```js
window.__bmmHost = {
  platform: { id: "electron-foo", name: "Foo Client" },
  onReady(api) {
    api.events.on("modsChanged", (configs) => syncToDisk(configs));
    if (api.mods.list().length === 0) api.ui.open("mod-manager");
  },
};
```

**接管刷新。** 当嵌入视图无法自行 `location.reload()` 时，设置 `ui.suppressReload`
并处理事件：

```js
window.__bmmHost = {
  ui: { suppressReload: true },
  onEvent(event) {
    if (event.type === "reloadRequested") myWebview.reload();
  },
};
```

**按账号隔离存储。** 提供一个以当前登录角色为键的 `storage` 后端，使每个账号各自
保留自己的模组集合：

```js
window.__bmmHost = {
  storage: {
    getItem: (k) => accountStore.get(currentAccount, k),
    setItem: (k, v) => accountStore.set(currentAccount, k, v),
    removeItem: (k) => accountStore.del(currentAccount, k),
  },
};
```

## 边界

- **不是安全边界。** 捕获并删除 `window.__bmmHost` 只是尽力而为的加固，并非隔离。
  同页的模组脚本共享页面；需要真正隔离的宿主必须在自身层面强制实施（例如反代的
  逐帧能力令牌）。
- **`<script src>` 加载不经代理。** `fetch` 覆盖仅作用于数据请求。若要完全控制模组
  *脚本*的加载，请在网络层拦截 —— 反代已对 `<script src>` 这样做。
- **启动器停靠位置**（一项装饰性 UI 偏好）仍直接使用 `localStorage`，不经宿主
  `storage`。