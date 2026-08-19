---
title: 开发
description: 从源码构建 BC Mod Manager、运行开发服务器，并了解部署流程。
order: 4
---

## 环境要求

- Node.js 22 或兼容版本
- Git submodule 已初始化

## 初始化

```sh
git submodule update --init
npm install
```

## 开发服务器

```sh
npm run dev
```

## 构建

```sh
npm run build
```

## 预览构建产物

```sh
npm run preview
```

## 构建与部署

仓库包含 GitHub Pages workflow：推送到 `main` 后会使用 Node.js 22 执行 `npm install` 和
`npm run build`，然后将 `dist/` 部署到 Pages。

Vite 构建配置会：

- 使用 Preact 和 Tailwind CSS；
- 将 CSS 注入 BMM 的 Shadow DOM；
- 将入口脚本打包为 `main.js`；
- 从上游 SDK `package.json` 读取版本并注入 `VERSION`。
