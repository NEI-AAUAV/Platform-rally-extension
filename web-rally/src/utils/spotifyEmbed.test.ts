import { describe, it, expect } from "vitest";
import { toSpotifyEmbedUrl } from "./spotifyEmbed";

describe("toSpotifyEmbedUrl", () => {
  it("rewrites a track URL to the embed path", () => {
    expect(toSpotifyEmbedUrl("https://open.spotify.com/track/abc123")).toBe(
      "https://open.spotify.com/embed/track/abc123",
    );
  });

  it("rewrites a playlist URL to the embed path", () => {
    expect(toSpotifyEmbedUrl("https://open.spotify.com/playlist/xyz789")).toBe(
      "https://open.spotify.com/embed/playlist/xyz789",
    );
  });

  it("strips query params and trailing segments", () => {
    expect(toSpotifyEmbedUrl("https://open.spotify.com/track/abc123?si=xyz")).toBe(
      "https://open.spotify.com/embed/track/abc123",
    );
  });

  it("returns null for a non-spotify URL", () => {
    expect(toSpotifyEmbedUrl("https://evil.com/track/abc123")).toBeNull();
  });

  it("returns null for an unrecognised content type", () => {
    expect(toSpotifyEmbedUrl("https://open.spotify.com/artist/abc123")).toBeNull();
  });
});
