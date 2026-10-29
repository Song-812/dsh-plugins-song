# Message Notice · dsh-msg-notify

English | [简体中文](README.md)

A small DSH alert plugin: one sound each for needs-answer, output-complete, error, and stalled.
Pure client-side — lives under DSH Settings, watches session state, and plays a tone when something happens. No external dependencies and no build step.

- Author: Song-812
- Version: 0.1.0
- License: MIT

## Four alerts

| Kind | When it fires | Default tone |
| --- | --- | --- |
| Needs answer | The model stops to wait for your choice or reply | Tap |
| Output complete | A turn finishes normally | Ding |
| Error | The turn errors or is interrupted | Fault |
| Stalled | No progress for 5 continuous minutes | Fault |

Each kind has its own tone and repeat mode. Tones: Ding / Fault / Tap / Mute. Repeat: off / 3 more times / always (every 30 seconds). There is no volume slider; each tone has a built-in gain and overall level follows the system volume.

Open **Settings → Message Notice** in DSH. Each row has a preview button for the current tone.

## Where settings live

Settings are stored in the browser’s `localStorage` under `dsh-msg-notify.v1`:

- Not in DSH config files, and not per session — **one copy per browser**;
- Switching browsers, clearing cache, or reinstalling means you set them again;
- They are not on disk as a text file you can edit by hand.

## What does not count as “stalled”

The stall detector is conservative:

| Situation | Counts as stalled? |
| --- | --- |
| Waiting for your answer / waiting for approval | No |
| A command still pending, or a child agent still running | No |
| A session whose event stream cannot be attached (never opened in the client) | No |
| A running session just after the page opens | Quiet for 5 minutes first |

Approval waits do not ring on their own, but they block false “complete” and “stalled” alerts.

## Layout

| Path | Role |
| --- | --- |
| `lib/index.js` | Host half: empty shell so the bundle can resolve `main` by package name |
| `lib/client.js` | Client half: detection, audio, and the settings page — handwritten, no build |
| `locale/` | Locale overlay anchors |
| `cordis.patch.yml` | Plugin row declaration |
| `test/*.test.mjs` | Offline tests for the engine, menus, and service-shape probes |

## Install & develop

Install this directory from the DSH plugin panel, or point `plugin_manager install_bundle` at it.

Refresh the page after changing `lib/client.js`. Re-enable the plugin row (or restart) after changing `lib/index.js`.

```bash
cd msg-notify
node --test
```

`node --test` loads `lib/client.js` as-is into a fake world (fake window / localStorage / AudioContext / session services), advances a fake clock, and asserts how many times and when tones fire. It exercises the real artifact — no mocking of plugin internals.

## Known limitations

- Settings stay in the current browser; they do not follow an account or a session.
- No in-plugin volume slider; each tone has a built-in gain and overall level follows the system.
- “Stalled” is a time threshold; it does not understand task content.
- Under browser autoplay policy, a page gesture is usually needed before sound can play.
- Complete / error / stalled detection depends on DSH client internal service shapes. If an upgrade changes those shapes, the plugin `console.warn`s once naming the mismatch and fails soft (detection may go quiet until shapes match again).

## License

MIT. See [LICENSE](../LICENSE) at the repository root. © Song-812
