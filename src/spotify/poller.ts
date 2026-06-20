import * as vscode from "vscode";
import { SpotifyClient } from "./client";
import { PlayerState } from "../types";

/** Polls Spotify for now-playing state and reports it via a callback. */
export class PlayerStatePoller {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly client: SpotifyClient,
    private readonly onState: (state: PlayerState) => void
  ) {}

  private get intervalMs(): number {
    return Math.max(1000, vscode.workspace.getConfiguration("vscodeVinyl").get<number>("pollIntervalMs", 4000));
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    void this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  /** Poll immediately (e.g. right after a user action) for snappy UI. */
  async pollNow(): Promise<void> {
    try {
      this.onState(await this.client.getPlaybackState());
    } catch {
      /* transient; next tick will retry */
    }
  }

  private async tick(): Promise<void> {
    if (!this.running) {
      return;
    }
    await this.pollNow();
    if (this.running) {
      this.timer = setTimeout(() => void this.tick(), this.intervalMs);
    }
  }

  dispose(): void {
    this.stop();
  }
}
