import { Image as ImageIcon, Lightbulb, QrCode, Music, Link as LinkIcon } from "lucide-react";
import type { MediaKind } from "@/client";
import type { MediaDraft, MediaDraftPatch } from "./mediaDraft";
import PhotoMediaFields from "./PhotoMediaFields";
import FunFactMediaFields from "./FunFactMediaFields";
import QrMediaFields from "./QrMediaFields";
import SpotifyMediaFields from "./SpotifyMediaFields";
import LinkMediaFields from "./LinkMediaFields";

type FieldsComponent = (props: {
  draft: MediaDraft;
  onChange: (patch: MediaDraftPatch) => void;
}) => React.JSX.Element;

/** Single place to register a new media kind's admin label, icon, and
 * add-form fields — the kind selector, the row summary, and the add form
 * all read from this instead of switching on `kind` at every call site. */
export const MEDIA_KIND_CONFIG: Record<
  MediaKind,
  { label: string; icon: typeof ImageIcon; FieldsComponent: FieldsComponent }
> = {
  photo: { label: "Foto", icon: ImageIcon, FieldsComponent: PhotoMediaFields },
  fun_fact: { label: "Curiosidade", icon: Lightbulb, FieldsComponent: FunFactMediaFields },
  qr: { label: "QR code", icon: QrCode, FieldsComponent: QrMediaFields },
  spotify: { label: "Spotify", icon: Music, FieldsComponent: SpotifyMediaFields },
  link: { label: "Link", icon: LinkIcon, FieldsComponent: LinkMediaFields },
};

export const MEDIA_KIND_ORDER: MediaKind[] = ["photo", "fun_fact", "qr", "spotify", "link"];
