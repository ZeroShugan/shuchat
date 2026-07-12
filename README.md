# ShuChat

A self-hostable [Matrix](https://matrix.org) client — a fork of the excellent
[Cinny](https://github.com/cinnyapp/cinny) with a focus on **Discord-style comfort**: built-in voice/video
calls, a full Voice & Video settings panel, and a desktop app with true global push-to-talk.

A hosted instance runs at [shuchat.shugan.dev](https://shuchat.shugan.dev) — you can log in there with a
Matrix account from **any** homeserver, or host everything yourself (see below).

## What ShuChat adds over Cinny

- **Voice/video calls built in** — Element Call is bundled and embedded (no external widget domain), with
  DM ringing (`m.call.notify`), an incoming-call popup, and call controls in the app bar.
- **Settings → Voice & Video** (Discord-like): microphone/speaker selection (incl. Firefox's output-device
  picker), input/output volume, mic test with live level meter + loopback, input sensitivity (auto or
  manual dB gate), noise suppression / echo cancellation / auto gain toggles, **push-to-talk** with a
  custom keybind.
- **Desktop app** (`desktop/`): Electron shell with tray, native notifications and **global push-to-talk**
  that works while the window is unfocused (something the browser can't do).
- Emoji/GIF/sticker **favourites** and recently-used custom emoji, per-type auto-spoilers, friend-add menu,
  live settings search, media playback fixes, and more — see the changelog in commit history.

## Self-hosting the client

```sh
npm ci
npm run build   # output in dist/
```

Serve `dist/` with any web server (nginx, Caddy…) as an SPA (redirect unknown paths to `index.html`;
Cinny's example configs in `contrib/` work unchanged). Set your homeserver(s) in [`config.json`](config.json)
(`allowCustomHomeservers: true` lets anyone log in with any account).

The bundled Element Call is copied to `dist/public/element-call/` at build time (see `vite.config.js`) and
**must be served from the same origin** — no extra setup needed if you serve `dist/` as-is.

## Calls: what your homeserver needs

Calls use **MatrixRTC (Element Call + LiveKit)**. The *account's homeserver* decides which LiveKit SFU is
used — so to give your own users calls, your homeserver needs:

1. A [LiveKit](https://github.com/livekit/livekit) server (media SFU),
2. [lk-jwt-service](https://github.com/element-hq/lk-jwt-service) (issues LiveKit tokens for Matrix users),
3. Your homeserver's client well-known advertising the focus:

```json
{
  "org.matrix.msc4143.rtc_foci": [
    { "type": "livekit", "livekit_service_url": "https://livekit.example.com/livekit/jwt" }
  ]
}
```

Synapse should also have MSC4140 delayed events enabled (`max_event_delay_duration: 24h`) for reliable
call-membership cleanup. Users on homeservers **without** a LiveKit focus can still join calls hosted by
users who have one (restricted token), but two such users can't call each other — media is never relayed
by the client or by unrelated servers.

## Desktop app

```sh
cd desktop
npm ci
npm start        # run against https://shuchat.shugan.dev
npm run dist     # build the Windows installer (electron-builder NSIS)
```

Point it at your own instance by editing `config.json` in the app's user-data folder
(`%AppData%/shuchat-desktop/config.json` on Windows) — created on first run.

Prebuilt Windows installers are attached to [GitHub Releases](../../releases).

## Credits & license

ShuChat is a fork of [Cinny](https://github.com/cinnyapp/cinny) by the Cinny authors, bundling
[Element Call](https://github.com/element-hq/element-call). Licensed
[AGPL-3.0](https://github.com/cinnyapp/cinny/blob/dev/LICENSE), same as upstream.
