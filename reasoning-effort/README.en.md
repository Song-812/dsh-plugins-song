# Thinking Levels · dsh-reasoning-effort

English | [简体中文](README.md)

A reasoning-effort slider on the composer model seat, plus a turbo (lightning) toggle.

This is a DeepSeek Harness web plugin. It does not take over model config or rewrite the official catalog: effort levels always follow DSH’s official model metadata; the plugin only makes choosing them smoother.

- Author: Song-812
- Version: 1.0.0
- License: MIT

## Features

- **Effort slider**: thick track, discrete ticks; live preview while dragging, commit on release; top tier gets a purple glow, edge flicker, and trail.
- **Two-level Off / On**: when a model only publishes two levels, the UI becomes a switch instead of a slider.
- **Turbo lightning**: the composer bolt and the popover header bolt are the same control — one click flips standard ↔ turbo; both are disabled on flash models.
- **Model list**: Provider groups collapse; pick Provider then model; turbo builds can be hidden from the list and reached only via the bolt.
- **Back to default**: the popover’s top-right button jumps to DeepSeek-V4.1-Flash + High and also sets that combo as the new-session default.
- **Keyboard**: ↑↓ move, Home / End jump, Enter confirm, Esc close; the list only scrolls on enter / keyboard move — expanding / collapsing a Provider does not yank the scroll.
- **No flicker**: model and effort are staged on the client and submitted together when the picker closes.

## Configuration

Settings are not in the DSH Settings page; they live in the plugin’s own text file:

`$DSH_HOME/reasoning-effort/settings.json` (default `~/.dsh/reasoning-effort/settings.json`)

[`settings.example.json`](settings.example.json) is a sample: copy it to the path above and edit. Missing or corrupt files fall back to built-in defaults.

| Key | Purpose | Default |
| --- | --- | --- |
| `turboBaseModelId` | Standard-build model id | `mimo-v2.6-pro` |
| `turboModelId` | Turbo-build model id | `mimo-v2.6-pro-ultraspeed` |
| `boltOnFlash` | Whether the bolt is clickable on flash | `false` (disabled) |
| `hiddenModels` | Model ids hidden from the list | turbo build hidden by default |

Refresh the page after editing (this file is outside DSH settings HMR).

## Layout

| Path | Purpose |
| --- | --- |
| `lib/index.js` | Host half: `GET`/`POST` `/api/reasoning-effort` against settings.json |
| `lib/settings.js` | Read / merge / atomic write for settings.json |
| `lib/client.js` | Client half: handwritten, no build step, loaded via `window.__ModuleLoader__` |
| `cordis.patch.yml` | Bundle patch: inserts `id/name = dsh-reasoning-effort` (no config fields) |
| `locale/` | Locale override anchors |
| `settings.example.json` | Sample config (copy to `$DSH_HOME/reasoning-effort/settings.json`) |
| `test/*.test.mjs` | Offline tests (no DSH install needed) |

## Install & disable

Install from the DSH plugin panel, or `plugin_manager install_bundle` pointing at this directory. The plugin ships its own `cordis.patch.yml`; do **not** add the same row again in your profile’s `cordis.patch.yml`. The package name `dsh-reasoning-effort` must stay as-is — DSH resolves the plugin row by it.

After changing `lib/client.js`, restart DSH to reload the client bundle; after changing the host half (`lib/index.js` / `lib/settings.js`), re-enable the plugin row (or restart); config edits only need a page refresh.

Disable: turn it off in the plugin panel. Uninstall: remove `dsh-reasoning-effort` from the profile’s dependencies and bundles.

No third-party npm dependencies; the host side uses Node built-ins; the client uses the host-provided React.

## Tests

```bash
cd reasoning-effort
npm test
npm run check
```

Covers: back-to-default success / failure / busy-reset flow; slider click, drag, cancel, keyboard, and disabled state.

## Known limitations

- Any model switch (bolt, back-to-default, or picking in the list) also updates the “new session default model” — that is DSH core behavior; the plugin cannot block it.
- Turbo depends on the model ids in settings.json; rename or retire a model and update the config.
- Effort levels come only from the official DSH catalog; models without an official effort map show no control.

## License

MIT. © Song-812
