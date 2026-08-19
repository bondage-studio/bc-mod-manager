---
title: Registry 格式
description: BC Mod Manager 读取的 registry 与自定义来源所用的 FUSAM manifest 格式。
order: 3
---

BMM 当前主要支持 FUSAM manifest 格式：

```json
{
  "version": "1",
  "addons": [
    {
      "id": "example-mod",
      "name": "Example Mod",
      "description": "Short description",
      "author": "Author",
      "repository": "https://github.com/example/example-mod",
      "tags": ["enhancements"],
      "type": "script",
      "versions": [
        {
          "distribution": "stable",
          "source": "https://example.com/mod.js"
        },
        {
          "distribution": "beta",
          "source": "https://example.com/mod.beta.js"
        }
      ]
    }
  ]
}
```

## 字段说明

- `id`：registry 内唯一 ID。
- `name`：字符串，或按语言拆分的对象。
- `description`、`author`：展示用元数据。
- `repository`、`website`、`discord`、`icon`、`tags`：可选展示字段。
- `type`：`script`、`module` 或 `eval`，缺省时按 `script` 加载。
- `versions`：可选 distribution 列表，每项提供一个可加载的 `source`。
- `noCacheBusting`：设为 `true` 后，BMM 会原样加载 URL，不追加 hash/session 参数。

> `aurora` registry 类型目前仅保留类型入口，解析结构仍是 TODO。
