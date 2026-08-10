// Rewrites an open.spotify.com content link into Spotify's documented embed
// URL (open.spotify.com/embed/<type>/<id>) — no oEmbed network round-trip
// needed, Spotify serves the iframe player directly at that path.
const SPOTIFY_CONTENT_PATTERN =
  /^https:\/\/open\.spotify\.com\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)/;

export function toSpotifyEmbedUrl(url: string): string | null {
  const match = SPOTIFY_CONTENT_PATTERN.exec(url);
  if (!match) return null;
  const [, type, id] = match;
  return `https://open.spotify.com/embed/${type}/${id}`;
}
