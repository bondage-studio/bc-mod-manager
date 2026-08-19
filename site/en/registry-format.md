---
title: Registry format
description: The FUSAM manifest format BC Mod Manager reads for registries and custom sources.
order: 3
---

BMM primarily supports the FUSAM manifest format:

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

## Fields

- `id` — unique ID within the registry.
- `name` — a string, or an object split by language.
- `description`, `author` — display metadata.
- `repository`, `website`, `discord`, `icon`, `tags` — optional display fields.
- `type` — `script`, `module`, or `eval`; loads as `script` when omitted.
- `versions` — an optional list of distributions, each providing one loadable
  `source`.
- `noCacheBusting` — when `true`, BMM loads the URL as-is without appending a
  hash / session parameter.

> The `aurora` registry type currently only reserves the type entry; its parsing
> structure is still a TODO.
