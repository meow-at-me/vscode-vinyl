import * as vscode from "vscode";
import * as crypto from "crypto";
import { SpotifyAuth } from "./spotify/auth";
import { SpotifyClient, SpotifyNotice } from "./spotify/client";
import { PlayerStatePoller } from "./spotify/poller";
import { InboundMessage, OutboundMessage, PlayerState } from "./types";

export class VinylViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "vscodeVinyl.player";

  private view?: vscode.WebviewView;
  private poller?: PlayerStatePoller;
  private lastState: PlayerState = { loggedIn: false, isPlaying: false, hasTrack: false };

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly auth: SpotifyAuth,
    private readonly client: SpotifyClient
  ) {
    auth.onDidChange(() => {
      void this.refreshNow();
      this.post({ type: "config", lpSkin: this.lpSkin() });
    });
  }

  private lpSkin(): string {
    return vscode.workspace.getConfiguration("vscodeVinyl").get<string>("lpSkin", "album");
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };
    webviewView.webview.html = this.html(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: InboundMessage) => this.onMessage(msg));

    this.poller = new PlayerStatePoller(this.client, (state) => {
      this.lastState = state;
      this.post({ type: "state", state });
    });
    this.context.subscriptions.push(this.poller);

    const syncPolling = () => {
      if (webviewView.visible) {
        this.poller?.start();
      } else {
        this.poller?.stop();
      }
    };
    webviewView.onDidChangeVisibility(syncPolling);
    webviewView.onDidDispose(() => this.poller?.stop());
    this.post({ type: "config", lpSkin: this.lpSkin() });
    syncPolling();
  }

  private async onMessage(msg: InboundMessage): Promise<void> {
    try {
      switch (msg.cmd) {
        case "ready":
          this.post({ type: "config", lpSkin: this.lpSkin() });
          await this.refreshNow();
          break;
        case "login":
          await this.connect();
          break;
        case "logout":
          await this.disconnect();
          break;
        case "playPause":
          await this.playPause();
          break;
        case "next":
          await this.next();
          break;
        case "prev":
          await this.prev();
          break;
        case "requestPlaylists":
          await this.sendPlaylists();
          break;
        case "requestQueue":
          await this.sendQueue(msg.uri);
          break;
        case "playTrack": {
          const prev = this.trackKey(this.lastState);
          await this.client.playTrackInContext(msg.contextUri, msg.trackUri);
          await this.refreshUntilChanged(prev);
          break;
        }
        case "seek":
          await this.client.seek(msg.positionMs);
          await this.refreshNow();
          break;
        case "playContext": {
          const prev = this.trackKey(this.lastState);
          await this.client.playContext(msg.uri);
          await this.refreshUntilChanged(prev);
          break;
        }
      }
    } catch (e) {
      this.handleError(e);
    }
  }

  // ----- public actions (also used by command palette) -----

  async connect(): Promise<void> {
    await this.auth.login();
    await this.refreshNow();
  }

  async disconnect(): Promise<void> {
    await this.auth.logout();
    await this.refreshNow();
  }

  async playPause(): Promise<void> {
    try {
      if (this.lastState.isPlaying) {
        await this.client.pause();
      } else {
        await this.client.play();
      }
      await this.refreshNow();
    } catch (e) {
      this.handleError(e);
    }
  }

  async next(): Promise<void> {
    try {
      const prev = this.trackKey(this.lastState);
      await this.client.next();
      await this.refreshUntilChanged(prev);
    } catch (e) {
      this.handleError(e);
    }
  }

  async prev(): Promise<void> {
    try {
      const prev = this.trackKey(this.lastState);
      await this.client.previous();
      await this.refreshUntilChanged(prev);
    } catch (e) {
      this.handleError(e);
    }
  }

  /** Quick-pick of the user's playlists (command palette entry). */
  async choosePlaylistViaQuickPick(): Promise<void> {
    try {
      const items = await this.client.getPlaylists();
      const pick = await vscode.window.showQuickPick(
        items.map((p) => ({ label: p.name, description: `${p.trackCount} tracks`, uri: p.uri })),
        { placeHolder: "Play which playlist?" }
      );
      if (pick) {
        const prev = this.trackKey(this.lastState);
        await this.client.playContext(pick.uri);
        await this.refreshUntilChanged(prev);
      }
    } catch (e) {
      this.handleError(e);
    }
  }

  // ----- helpers -----

  private async sendPlaylists(): Promise<void> {
    try {
      const items = await this.client.getPlaylists();
      this.post({ type: "playlists", items });
    } catch (e) {
      this.handleError(e);
    }
  }

  private async sendQueue(uri: string): Promise<void> {
    try {
      const { name, tracks } = await this.client.getPlaylistTracks(uri);
      this.post({ type: "queue", uri, name, tracks });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.post({ type: "queue", uri, name: `⚠ ${message}`, tracks: [] });
    }
  }

  private async refreshNow(): Promise<void> {
    const state = await this.client.getPlaybackState();
    this.lastState = state;
    this.post({ type: "state", state });
  }

  /** Identifies the current track so we can detect when it actually changes. */
  private trackKey(s: PlayerState): string {
    return `${s.track ?? ""} ${s.artist ?? ""}`;
  }

  /**
   * After a track-change action, re-poll with short backoff until the now-playing
   * track differs from `prevKey`. Spotify's player API is eventually consistent, so
   * an immediate read right after next/prev/play often still returns the old track.
   */
  private async refreshUntilChanged(prevKey: string): Promise<void> {
    const delaysMs = [0, 250, 500, 800, 1200];
    for (const delay of delaysMs) {
      if (delay) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const state = await this.client.getPlaybackState();
      this.lastState = state;
      this.post({ type: "state", state });
      if (this.trackKey(state) !== prevKey) {
        return;
      }
    }
  }

  private handleError(e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    this.post({ type: "error", message });
    // Transient network blips (request never reached Spotify) shouldn't pop a toast —
    // the poller recovers on its own. Only surface genuine errors intrusively.
    const transient = /fetch failed|network|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(
      message
    );
    if (!(e instanceof SpotifyNotice) && !transient) {
      vscode.window.showErrorMessage(`Vinyl: ${message}`);
    }
  }

  private post(msg: OutboundMessage): void {
    void this.view?.webview.postMessage(msg);
  }

  private html(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString("hex");
    const asset = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", file));
    const styleUri = asset("style.css");
    const scriptUri = asset("main.js");
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https://*.scdn.co https://*.spotifycdn.com data:`,
      `style-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Vinyl</title>
</head>
<body>
  <div id="app">
    <div id="turntable">
      <div id="art-bg"></div>
      <div id="record" class="paused">
        <div id="label"><div id="label-art"></div></div>
        <div id="hole"></div>
      </div>
      <div id="tonearm"></div>
    </div>

    <div id="trackbox">
      <div id="title" class="marquee"><span>Not connected</span></div>
      <div id="artist"></div>
    </div>

    <div id="progress-row">
      <span id="time-cur" class="time">00:00</span>
      <div id="progress"><div id="progress-fill"></div><div id="progress-knob"></div></div>
      <span id="time-tot" class="time">00:00</span>
    </div>

    <div id="controls">
      <button id="prev" class="ctrl" title="Previous">⏮</button>
      <button id="playpause" class="ctrl big" title="Play / Pause">▶</button>
      <button id="next" class="ctrl" title="Next">⏭</button>
    </div>

    <div id="notice"></div>

    <div id="connect-row">
      <button id="connect" class="link">Connect Spotify</button>
      <button id="playlists-btn" class="link hidden">Playlists</button>
      <button id="queue-btn" class="link hidden">Tracks</button>
    </div>

    <div id="playlists" class="hidden"></div>
    <div id="queue" class="hidden"></div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
