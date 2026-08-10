import { Input } from "@/components/ui/input";
import type { MediaDraft, MediaDraftPatch } from "./mediaDraft";

type Props = Readonly<{
  draft: MediaDraft;
  onChange: (patch: MediaDraftPatch) => void;
}>;

export default function FunFactMediaFields({ draft, onChange }: Props) {
  return (
    <Input
      value={draft.caption}
      onChange={(e) => onChange({ caption: e.target.value })}
      placeholder="Ex: Este edifício foi construído em 1890…"
      className="border-border bg-muted"
    />
  );
}
