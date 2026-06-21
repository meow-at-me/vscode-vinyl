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
  /** URI of the currently playing track (for highlighting it in the queue). */
  trackUri?: string;
  /** Playback context the track is playing from, if any (e.g. a playlist). */
  contextUri?: string;
  /** Context kind: "playlist" | "album" | "artist" | "collection" | undefined. */
  contextType?: string;
  /** A human-readable hint shown when control is unavailable (no device, not premium, etc.). */
  notice?: string;
}

export interface PlaylistItem {
  name: string;
  uri: string;
  imageUrl?: string;
  trackCount: number;
}

export interface QueueTrack {
  uri: string;
  name: string;
  artist: string;
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
  | { cmd: "playContext"; uri: string }
  | { cmd: "seek"; positionMs: number }
  | { cmd: "requestQueue"; uri: string }
  | { cmd: "playTrack"; contextUri: string; trackUri: string };

/** Messages: host -> webview. */
export type OutboundMessage =
  | { type: "state"; state: PlayerState }
  | { type: "playlists"; items: PlaylistItem[] }
  | { type: "queue"; uri: string; name: string; tracks: QueueTrack[] }
  | { type: "config"; lpSkin: string }
  | { type: "error"; message: string };
