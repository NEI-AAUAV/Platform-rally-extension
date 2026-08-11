import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import type { CheckpointMediaResponse } from "@/client";
import { MEDIA_KIND_CONFIG } from "./mediaKindConfig";

type Props = Readonly<{
  item: CheckpointMediaResponse;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
}>;

function summaryFor(item: CheckpointMediaResponse): string {
  switch (item.kind) {
    case "photo":
      return item.caption || "Foto";
    case "fun_fact":
      return item.caption ?? "";
    case "qr":
      return item.content_text ?? "";
    case "spotify":
      return item.title || item.content_url || "Spotify";
    case "link":
      return item.title || item.content_url || "Link";
    default:
      return "";
  }
}

/** One row in the checkpoint media list — kind icon, a kind-specific
 * one-line summary, and up/down reorder buttons instead of drag-and-drop
 * (no such library exists in this codebase yet, and the list is always
 * short enough that arrows are simpler than adding one). */
export default function CheckpointMediaRow({
  item,
  isFirst,
  isLast,
  onMove,
  onDelete,
  deleteDisabled,
}: Props) {
  const { label, icon: Icon } = MEDIA_KIND_CONFIG[item.kind];

  return (
    <li className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      {item.kind === "photo" && item.image_url && (
        <img
          src={item.image_url}
          alt={item.caption ?? "Foto"}
          className="h-8 w-8 shrink-0 rounded object-cover ring-1 ring-border"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="truncate">{summaryFor(item)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          disabled={isFirst}
          onClick={() => onMove(-1)}
          aria-label="Mover para cima"
          className="rounded p-1 text-muted-foreground transition hover:bg-accent disabled:opacity-30"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={isLast}
          onClick={() => onMove(1)}
          aria-label="Mover para baixo"
          className="rounded p-1 text-muted-foreground transition hover:bg-accent disabled:opacity-30"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleteDisabled}
          aria-label={`Remover ${label.toLowerCase()}`}
          className="rounded p-1 text-muted-foreground transition hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
