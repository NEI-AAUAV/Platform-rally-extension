import { Input } from "@/components/ui/input";
import type { MediaDraft, MediaDraftPatch } from "./mediaDraft";

// Mirrors the backend's SPOTIFY_URL_PATTERN — fails fast client-side before
// the round-trip to the API for an obviously wrong domain.
const SPOTIFY_URL_PATTERN = /^https:\/\/open\.spotify\.com\//;

type Props = Readonly<{
  draft: MediaDraft;
  onChange: (patch: MediaDraftPatch) => void;
}>;

export default function SpotifyMediaFields({ draft, onChange }: Props) {
  const urlLooksInvalid =
    draft.contentUrl.trim().length > 0 && !SPOTIFY_URL_PATTERN.test(draft.contentUrl);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="sm:max-w-sm">
        <Input
          value={draft.contentUrl}
          onChange={(e) => onChange({ contentUrl: e.target.value })}
          placeholder="https://open.spotify.com/track/…"
          className="border-border bg-muted"
        />
        {urlLooksInvalid && (
          <p className="mt-1 text-xs text-destructive">Tem de ser um link open.spotify.com</p>
        )}
      </div>
      <Input
        value={draft.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="Título (opcional)"
        className="border-border bg-muted sm:max-w-xs"
      />
    </div>
  );
}
