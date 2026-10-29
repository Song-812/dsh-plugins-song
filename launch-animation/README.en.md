# Boot Animation · dsh-launch-animation

English | [简体中文](README.md)

A **boot animation** for DeepSeek Harness desktop: as soon as the window appears, a line-drawing animation (from your artwork) covers the built-in `HARNESS / Loading plugins…` card; when the UI is **actually ready**, the overlay unveils and tears itself down cleanly.

- Author: Song-812
- Version: 1.0.0
- License: MIT

## Features

- **Official inject channel only**: `webserver/index-inject` rows (`global` + `script`) — **does not modify** the DSH install tree.
- **Shadow DOM overlay**: never touches DSH’s own DOM; on unload removes the overlay, forwarded key listeners, and timers.
- **Assets inlined**: sketch paths + artwork + brand whale are baked into `lib/payload.json` at build time — zero network at runtime.
- **On when installed**: no master switch on the settings page; disable the whole plugin in the sidebar to stop it.
- **Skip anytime**: Esc / click; holds on a wait screen until ready; 25s fail-open so users are never trapped.

## Install

Needs DSH desktop (0.2.0-rc.2+). Install this folder from the DSH plugin panel, or point `plugin_manager install_bundle` at it.

**Restart DSH** after install (host plugins load at startup).

## Configuration

Settings live under **Settings → Boot Animation** (mode, avatar/artwork upload, restore defaults). You can also edit the plain text file:

`$DSH_HOME/launch-animation/settings.json` (default `~/.dsh/launch-animation/settings.json`)

[`settings.example.json`](settings.example.json) mirrors the built-in defaults. **Do not** commit your real machine settings into the repo.

| Key | Meaning | Default |
|---|---|---|
| `mode` | `full` (~14.5s) or `fast` (~4s) | `full` |
| `showSkipHint` | Show “click / Esc to skip” (Esc still works if false) | `true` |
| `identityMode` | `brand` / `custom` / `none` | `brand` |
| `identityImage` | When `custom`: filename under `$DSH_HOME/launch-animation/uploads/` only | `""` |
| `captionMode` | Native title bar: `transparent` / `match` / `off` | `transparent` |

Refresh the page after edits (restart DSH if you change host-side `lib/index.js`). Custom sketch processing needs local Python (`opencv-python` + `numpy`); built-in assets need neither.

## Default assets

| File | Role |
|---|---|
| `assets/brand-whale.png` | Default identity mark (brand whale) |
| `assets/artwork.jpg` | Default sketch reference for the line-drawing pass |
| `assets/contours.json` | Precomputed contour paths from the default artwork |
| `lib/payload.json` | Build artifact: CSS / inject script / inlined assets |

Custom uploads land under `$DSH_HOME/launch-animation/uploads/` (and `artwork/`) — they are **never** written back into this plugin folder.

## Behavior & limits

- Host half: reads settings, registers `/api/launch-animation`, builds inject rows.
- Client half: settings page + diagnostics; the animation itself runs inside the inject script’s Shadow DOM.
- Covers the **DSH client window**, not the OS screen; the taskbar is untouched.
- Windows caption buttons are system-drawn; the plugin can only tint/transparent the overlay strip — **not** the OS title-bar chrome color.
- If a future DSH major changes boot DOM (`[data-dsh-boot]` / `#root`), readiness detection may fail — then the 25s fail-open still releases the overlay.

## Layout

```
launch-animation/
  assets/                 default art + animation source templates
  lib/                    host / client / artwork helpers / payload
  test/                   offline regression
  cordis.patch.yml        mount row
  settings.example.json   sample config
  check.mjs               optional self-check
  README.md / README.en.md
```

## Tests

```bash
npm run check
npm test
npm run selfcheck   # optional
```

## License

MIT. © Song-812
