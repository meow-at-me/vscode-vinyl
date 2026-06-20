import { SpotifyAuth } from "./auth";
import { PlayerState, PlaylistItem } from "../types";

const API = "https://api.spotify.com/v1";

/** Thrown for API-level conditions the UI should surface as a friendly notice. */
export class SpotifyNotice extends Error {}

interface RawPlayback {
  is_playing: boolean;
  progress_ms: number | null;
  device: { name: string } | null;
  item: {
    name: string;
    duration_ms: number;
    artists: { name: string }[];
    album: { images: { url: string; width: number }[] };
  } | null;
}

export class SpotifyClient {
  constructor(private readonly auth: SpotifyAuth) {}

  /** Low-level request with one automatic refresh+retry on 401. */
  private async request(
    path: string,
    init: RequestInit = {},
    retry = true
  ): Promise<Response> {
    const token = await this.auth.getAccessToken();
    if (!token) {
      throw new SpotifyNotice("Not connected to Spotify.");
    }
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (res.status === 401 && retry) {
      // Token may have just expired; force a refresh by retrying once.
      return this.request(path, init, false);
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
      throw new SpotifyNotice(`Rate limited by Spotify. Retry in ${retryAfter}s.`);
    }
    if (res.status === 403) {
      throw new SpotifyNotice("Playback control requires Spotify Premium.");
    }
    return res;
  }

  /** Fetch the current playback state. Never throws for the empty/no-device cases. */
  async getPlaybackState(): Promise<PlayerState> {
    const loggedIn = await this.auth.isLoggedIn();
    if (!loggedIn) {
      return { loggedIn: false, isPlaying: false, hasTrack: false };
    }
    let res: Response;
    try {
      res = await this.request("/me/player");
    } catch (e) {
      if (e instanceof SpotifyNotice) {
        return { loggedIn: true, isPlaying: false, hasTrack: false, notice: e.message };
      }
      throw e;
    }

    // 204 = nothing playing / no active device.
    if (res.status === 204) {
      return {
        loggedIn: true,
        isPlaying: false,
        hasTrack: false,
        notice: "No active device. Open Spotify and play something.",
      };
    }
    if (!res.ok) {
      return { loggedIn: true, isPlaying: false, hasTrack: false, notice: `Spotify error ${res.status}` };
    }

    const data = (await res.json()) as RawPlayback;
    if (!data || !data.item) {
      return { loggedIn: true, isPlaying: false, hasTrack: false, notice: "Nothing playing." };
    }
    const images = data.item.album.images ?? [];
    // Prefer a mid-size image for a crisp label.
    const art = images.find((i) => i.width && i.width <= 300)?.url ?? images[0]?.url;
    return {
      loggedIn: true,
      isPlaying: data.is_playing,
      hasTrack: true,
      track: data.item.name,
      artist: data.item.artists.map((a) => a.name).join(", "),
      albumArt: art,
      progressMs: data.progress_ms ?? 0,
      durationMs: data.item.duration_ms,
      deviceName: data.device?.name,
    };
  }

  private async control(method: string, path: string, body?: unknown): Promise<void> {
    const res = await this.request(path, {
      method,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) {
      throw new SpotifyNotice("No active device. Open Spotify and play something first.");
    }
    if (!res.ok && res.status !== 204) {
      throw new SpotifyNotice(`Spotify command failed (${res.status}).`);
    }
  }

  play(): Promise<void> {
    return this.control("PUT", "/me/player/play");
  }
  pause(): Promise<void> {
    return this.control("PUT", "/me/player/pause");
  }
  next(): Promise<void> {
    return this.control("POST", "/me/player/next");
  }
  previous(): Promise<void> {
    return this.control("POST", "/me/player/previous");
  }
  playContext(contextUri: string): Promise<void> {
    return this.control("PUT", "/me/player/play", { context_uri: contextUri });
  }

  async getPlaylists(): Promise<PlaylistItem[]> {
    const res = await this.request("/me/playlists?limit=50");
    if (!res.ok) {
      throw new SpotifyNotice(`Could not load playlists (${res.status}).`);
    }
    const data = (await res.json()) as {
      items: {
        name: string;
        uri: string;
        images: { url: string }[];
        tracks: { total: number };
      }[];
    };
    return (data.items ?? [])
      .filter((p) => p && p.uri)
      .map((p) => ({
        name: p.name,
        uri: p.uri,
        imageUrl: p.images?.[0]?.url,
        trackCount: p.tracks?.total ?? 0,
      }));
  }
}
