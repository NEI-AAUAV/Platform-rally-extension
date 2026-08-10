import { QRCodeSVG } from "qrcode.react";
import { ExternalLink } from "lucide-react";
import type { CheckpointMediaResponse } from "@/client";
import { toSpotifyEmbedUrl } from "@/utils/spotifyEmbed";

type Props = Readonly<{
  item: CheckpointMediaResponse;
  compact?: boolean;
}>;

/**
 * Renders one `qr`/`spotify`/`link` checkpoint-media item for a team.
 * Photo and fun_fact stay inline in `CheckpointDiscovery.tsx` (their
 * rendering is entangled with the shared lightbox state); this dispatcher
 * only covers the three rich-media kinds so it stays a pure, stateless leaf.
 */
export default function CheckpointMediaAttachment({ item, compact = false }: Props) {
  if (item.kind === "qr" && item.content_text) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-3">
        <div className="shrink-0 rounded-lg bg-white p-2">
          <QRCodeSVG value={item.content_text} size={compact ? 96 : 140} level="M" />
        </div>
        {item.caption && <p className="text-sm text-foreground/90">{item.caption}</p>}
      </div>
    );
  }

  if (item.kind === "spotify" && item.content_url) {
    const embedUrl = toSpotifyEmbedUrl(item.content_url);
    if (!embedUrl) return null;
    return (
      <div className="space-y-1.5">
        {item.title && <p className="text-sm font-medium text-foreground/90">{item.title}</p>}
        <iframe
          title={item.title ?? "Spotify"}
          src={embedUrl}
          width="100%"
          height={compact ? 80 : 152}
          loading="lazy"
          allow="encrypted-media"
          // Admin-supplied URL, restricted to open.spotify.com server-side —
          // sandboxed anyway since this page also carries team auth state.
          sandbox="allow-scripts allow-same-origin allow-popups"
          className="rounded-xl border border-border"
        />
      </div>
    );
  }

  if (item.kind === "link" && item.content_url) {
    return (
      <a
        href={item.content_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2.5 text-sm text-foreground/90 transition hover:border-primary"
      >
        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{item.title || item.content_url}</span>
      </a>
    );
  }

  return null;
}
