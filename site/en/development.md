---
title: Development
description: Build BC Mod Manager from source, run the dev server, and understand the deploy pipeline.
order: 4
---

## Requirements

- Node.js 22 or a compatible version
- Initialized git submodules

## Setup

```sh
git submodule update --init
npm install
```

## Dev server

```sh
npm run dev
```

## Build

```sh
npm run build
```

## Preview the build output

```sh
npm run preview
```

## Build & deploy

The repository includes a GitHub Pages workflow: on push to `main`, it runs
`npm install` and `npm run build` with Node.js 22, then deploys `dist/` to Pages.

The Vite build configuration:

- uses Preact and Tailwind CSS;
- injects CSS into BMM's Shadow DOM;
- bundles the entry script as `main.js`;
- reads the version from the upstream SDK `package.json` and injects `VERSION`.
