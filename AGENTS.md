# Repository Guidelines

## Project Structure & Module Organization

This is a Hexo site. Author content lives in `source/`: posts are in
`source/_posts/`, pages in named directories, and site settings in `_config.yml`.
Local Hexo extensions live in `scripts/`; skins are under
`assets/hexo-sil-*/skins/`. Node maintenance tools are in `tools/`, tests in
`test/`, and the Cloudflare R2 proxy Worker in `workers/ephesus-files-proxy/`.

`source/_data/assets.json` is the asset metadata manifest. Do not hand-edit its
hashes, sizes, or audio metadata. Use the asset scripts instead.

## Build, Test, and Development Commands

- `npm run server` starts Hexo locally.
- `npm run build` generates the site; `npm run clean` clears generated output.
- `npm run test:hexo-sil-audio`, `npm run test:hexo-sil-archive`, and
  `npm run test:hexo-sil-podcast` run focused Node test suites.
- `npm run test:assets` validates asset-tool behaviour; run the relevant focused
  test after editing a plugin or tool.
- `npm run assets:seed` refreshes the manifest in legacy mode without uploading.

## R2 Asset Updates

When `source/_data/assets.json` has `state: r2`, R2 is authoritative and binary
assets in `source/files/` and `source/img/df.zip` are ignored local working
copies. Export `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and
optionally `R2_BUCKET` before changing assets; never store them in the repo.

Add, edit, or delete the local file, preview changes with
`npm run publish -- --dry-run`, then run `npm run publish`. It hashes and uploads
changed objects, verifies R2, refreshes `assets.json`, runs checks, and
interactively commits and pushes. Restore only what is needed on a new machine
with `npm run assets:pull -- --prefix files/path`. Do not use `git add -f` to
commit R2-managed binaries.

## Coding Style & Naming Conventions

Use CommonJS and `'use strict';` in repository Node scripts. Follow the existing
two-space JavaScript indentation, semicolons, and single quotes. Keep plugin
names and CSS selectors namespaced as `hexo-sil-*` and `sil-*-*`. Prefer small,
pure configuration helpers. Preserve CSS selector naming and light/dark custom
property structure.

## Testing Guidelines

Use Node's built-in `node:test` and `node:assert/strict`; name tests
`*.test.js`. Add a regression assertion for every behaviour or skin change.
Before handing off a site-affecting change, run its focused test and
`npx hexo generate --bail`. Run `git diff --check` before committing.

## Commit & Pull Request Guidelines

Use the established format `[type] 简短中文标题`, such as
`[fix] 简化资料库搜索框焦点样式` or `[feat] 建立 R2 原生资产工作流`.
Use a short commit body for non-trivial work. Keep commits focused. PRs should
explain user-visible changes, list validation commands, link relevant issues,
and include screenshots for visual changes.
