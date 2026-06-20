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
          await this.client.next();
          await this.refreshNow();
          break;
        case "prev":
          await this.client.previous();
          await this.refreshNow();
          break;
        case "requestPlaylists":
          await this.sendPlaylists();
          break;
        case "playContext":
          await this.client.playContext(msg.uri);
          await this.refreshNow();
          break;
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
      await this.client.next();
      await this.refreshNow();
    } catch (e) {
      this.handleError(e);
    }
  }

  async prev(): Promise<void> {
    try {
      await this.client.previous();
      await this.refreshNow();
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
        await this.client.playContext(pick.uri);
        await this.refreshNow();
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

  private async refreshNow(): Promise<void> {
    const state = await this.client.getPlaybackState();
    this.lastState = state;
    this.post({ type: "state", state });
  }

  private handleError(e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    this.post({ type: "error", message });
    if (!(e instanceof SpotifyNotice)) {
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

    <div id="progress"><div id="progress-fill"></div></div>

    <div id="controls">
      <button id="prev" class="ctrl" title="Previous">⏮</button>
      <button id="playpause" class="ctrl big" title="Play / Pause">▶</button>
      <button id="next" class="ctrl" title="Next">⏭</button>
    </div>

    <div id="notice"></div>

    <div id="connect-row">
      <button id="connect" class="link">Connect Spotify</button>
      <button id="playlists-btn" class="link hidden">Playlists ▾</button>
    </div>

    <div id="playlists" class="hidden"></div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
