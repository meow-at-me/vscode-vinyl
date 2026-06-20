import * as vscode from "vscode";
import { SpotifyAuth } from "./spotify/auth";
import { SpotifyClient } from "./spotify/client";
import { VinylViewProvider } from "./VinylViewProvider";

export function activate(context: vscode.ExtensionContext): void {
  const auth = new SpotifyAuth(context);
  const client = new SpotifyClient(auth);
  const provider = new VinylViewProvider(context, auth, client);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VinylViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("vscodeVinyl.login", () => provider.connect()),
    vscode.commands.registerCommand("vscodeVinyl.logout", () => provider.disconnect()),
    vscode.commands.registerCommand("vscodeVinyl.playPause", () => provider.playPause()),
    vscode.commands.registerCommand("vscodeVinyl.next", () => provider.next()),
    vscode.commands.registerCommand("vscodeVinyl.prev", () => provider.prev()),
    vscode.commands.registerCommand("vscodeVinyl.selectPlaylist", () => provider.choosePlaylistViaQuickPick())
  );
}

export function deactivate(): void {
  /* nothing to clean up beyond disposables */
}
