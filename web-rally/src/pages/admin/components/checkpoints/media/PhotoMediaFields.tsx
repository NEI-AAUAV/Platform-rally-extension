import { Input } from "@/components/ui/input";
import type { MediaDraft, MediaDraftPatch } from "./mediaDraft";

type Props = Readonly<{
  draft: MediaDraft;
  onChange: (patch: MediaDraftPatch) => void;
}>;

export default function PhotoMediaFields({ draft, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        value={draft.caption}
        onChange={(e) => onChange({ caption: e.target.value })}
        placeholder="Legenda (opcional)"
        className="border-border bg-muted sm:max-w-xs"
      />
      <input
        type="file"
        accept="image/*"
        onChange={(e) => onChange({ image: e.target.files?.[0] ?? null })}
        className="text-sm text-muted-foreground"
      />
    </div>
  );
}
