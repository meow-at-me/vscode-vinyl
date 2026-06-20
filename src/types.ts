/** Now-playing state pushed from the extension host to the webview. */
export interface PlayerState {
  loggedIn: boolean;
  isPlaying: boolean;
  hasTrack: boolean;
  track?: string;
  artist?: string;
  albumArt?: string;
  progressMs?: number;
  durationMs?: number;
  deviceName?: string;
  /** A human-readable hint shown when control is unavailable (no device, not premium, etc.). */
  notice?: string;
}

export interface PlaylistItem {
  name: string;
  uri: string;
  imageUrl?: string;
  trackCount: number;
}

/** Messages: webview -> host. */
export type InboundMessage =
  | { cmd: "ready" }
  | { cmd: "login" }
  | { cmd: "logout" }
  | { cmd: "playPause" }
  | { cmd: "next" }
  | { cmd: "prev" }
  | { cmd: "requestPlaylists" }
  | { cmd: "playContext"; uri: string };

/** Messages: host -> webview. */
export type OutboundMessage =
  | { type: "state"; state: PlayerState }
  | { type: "playlists"; items: PlaylistItem[] }
  | { type: "config"; lpSkin: string }
  | { type: "error"; message: string };
