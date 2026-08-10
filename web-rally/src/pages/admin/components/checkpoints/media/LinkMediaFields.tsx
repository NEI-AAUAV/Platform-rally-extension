import { Input } from "@/components/ui/input";
import type { MediaDraft, MediaDraftPatch } from "./mediaDraft";

type Props = Readonly<{
  draft: MediaDraft;
  onChange: (patch: MediaDraftPatch) => void;
}>;

export default function LinkMediaFields({ draft, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        value={draft.contentUrl}
        onChange={(e) => onChange({ contentUrl: e.target.value })}
        placeholder="https://…"
        className="border-border bg-muted sm:max-w-sm"
      />
      <Input
        value={draft.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="Título (opcional)"
        className="border-border bg-muted sm:max-w-xs"
      />
    </div>
  );
}
