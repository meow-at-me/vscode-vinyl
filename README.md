# 🎵 Vinyl Player

A **pixel-art spinning LP record** that lives in your VS Code sidebar and controls your Spotify playback — play / pause / next / previous, browse your playlists, and watch the album art spin on the vinyl while you code.

> The record spins while music is playing and stops when paused. Audio plays through your normal Spotify app/device; this panel is the remote control + now-playing display.

## Requirements

- **Spotify Premium** (Spotify's playback-control API is Premium-only).
- An active Spotify session somewhere (desktop app, web player, or phone). The panel controls whatever device is currently active.

## Setup (one time, ~2 minutes)

This extension uses **your own** free Spotify app credentials (no shared server, your tokens stay on your machine via VS Code Secret Storage).

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → **Create app**.
2. Give it any name. For **Redirect URI** add exactly:
   ```
   http://127.0.0.1:9876/callback
   ```
   (If port `9876` is taken, change `Vinyl: Redirect Port` in settings and use the matching `http://127.0.0.1:<port>/callback` here.)
3. Under **APIs used**, check **Web API**. Save.
4. Copy the **Client ID**.
5. In VS Code: **Settings → Vinyl → Spotify Client ID**, paste it.
6. Open the **Vinyl** icon in the Activity Bar → click **Connect Spotify** and approve in the browser.

## Usage

- Click the **Vinyl** icon in the Activity Bar (you can drag the view to the panel/secondary sidebar).
- `⏮ ⏸/▶ ⏭` to control playback.
- **Playlists ▾** to pick one of your playlists to start.
- Command Palette also has: *Vinyl: Play / Pause*, *Next*, *Previous*, *Choose Playlist*, *Connect / Disconnect Spotify*.

## Settings

| Setting | Default | Description |
|---|---|---|
| `vscodeVinyl.spotifyClientId` | `""` | Your Spotify app Client ID. |
| `vscodeVinyl.redirectPort` | `9876` | Loopback port for the OAuth redirect. Must match your app's Redirect URI. |
| `vscodeVinyl.pollIntervalMs` | `4000` | How often to refresh now-playing while the view is visible. |
| `vscodeVinyl.lpSkin` | `album` | Record label look: `album` / `classic` / `pixel`. |

## Troubleshooting

- **"No active device"** — open Spotify and start playing once; the panel then controls it.
- **"Playback control requires Spotify Premium"** — the control API needs Premium.
- **Browser didn't return** — make sure the Redirect URI in your Spotify app exactly matches the port setting.

## Privacy

Tokens are stored only in VS Code's encrypted Secret Storage on your machine. All Spotify calls go directly from the extension host to Spotify; there is no third-party server.

## License

MIT
