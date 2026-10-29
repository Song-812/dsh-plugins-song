# Glass Theme · dsh-glass-theme

English | [简体中文](README.md)

A **frosted-glass theme** for DeepSeek Harness desktop: wallpaper background + glass panels, with a global accent color, hover lift, cursor glow, edge fade blur, and a glossy Harness wordmark in dark mode.

- Author: Song-812
- Version: 1.0.1
- License: MIT

## Features

| Area | What you get |
|---|---|
| Theme | Global accent (8 presets + picker, light/dark), glass blur, frost |
| Background | Image / video wallpaper, blur / frost, video blur / brightness, dim (follows light/dark) |
| Effects | Hover lift, cursor glow (follows accent) |
| Always on | Readability fixes, Space Grotesk, top/bottom edge fade |
| Dark mode | Glossy Harness badge bottom-left (light mode untouched) |

Settings live under **Settings → Glass Theme**. “Restore defaults” **resets knobs only — it does not delete wallpaper**.

There is no master theme switch: disable `dsh-glass-theme` in the plugin sidebar to tear the whole layer down.

## Install

Needs DSH desktop (`dsh` engine `>=0.2.1-rc.3 <0.3.0`). Install this folder from the DSH plugin panel, or point `plugin_manager install_bundle` at it.

**Restart DSH** after install (host half loads at startup), then Ctrl+Shift+R to refresh the client.

## Where wallpaper lives

Wallpaper files are stored under this plugin’s `壁纸/` directory (not localStorage):

- Picking an image/video uploads into that folder; the current filename is recorded in `壁纸/state.json` (machine-local — **do not** commit it)
- “Open folder” reveals it in Explorer on Windows
- Factory default: [`壁纸/默认壁纸.jpg`](壁纸/默认壁纸.jpg) when there is no `state.json` yet
- Delete removes the current upload only (factory file stays)
- Video is served with Range support for native looping

The repo ships only the factory `默认壁纸.jpg`; `wallpaper-*.*` and `state.json` are gitignored.

## Configuration

Theme knobs (blur, accent, effects, …) are saved via the settings page / DSH settings stack; wallpaper bytes live in `壁纸/`.

Refresh after settings edits; restart DSH if you change host-side `lib/index.js`.

## Behavior & limits

- Host half: `/api/glass-theme/*` for wallpaper I/O, fonts, reveal-folder; files under plugin `壁纸/`
- Client half: settings page + global glass CSS under `<html data-glass>`; disable the plugin to remove everything
- Selectors target host CSS-module **semantic suffixes** (hashes change; suffixes are stabler). A future DSH rename may drop a panel back to stock styling without crashing
- Image wallpaper path is well covered; treat video wallpaper as best-effort on your machine

## Layout

```
glass-theme/
  src/                    TypeScript (host / client / shared)
  lib/                    build output (index.js host · client.js browser)
  locale/                 zh / en strings
  assets/fonts/           Space Grotesk subsets
  壁纸/默认壁纸.jpg        factory wallpaper
  docs/                   visual checklist
  test/                   offline unit tests (*.test.mjs)
  build.mjs / check.mjs
  cordis.patch.yml
  README.md / README.en.md
```

## Develop & test

```bash
npm install
npm test
npm run build
npm run check         # same as selfcheck
```

Browser visual scripts (`test/*.browser.mjs`) need local Chrome and a DSH install tree — they are **not** shipped in this open-source package.

## License

MIT. © Song-812
