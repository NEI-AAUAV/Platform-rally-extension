import { MapPin } from "lucide-react";
import { capitalize } from "@/lib/eventTerms";

interface CheckpointHeaderProps {
  name: string;
  isRedacted: boolean;
  feminino: boolean;
  checkpointTerm: string;
}

/** Icon + title + subtitle for the next-checkpoint card. */
export default function CheckpointHeader({
  name,
  isRedacted,
  feminino,
  checkpointTerm,
}: Readonly<CheckpointHeaderProps>) {
  return (
    <div className="flex items-center gap-3">
      <div className="rally-bg-accent flex h-12 w-12 items-center justify-center rounded-xl shadow-[var(--rally-shadow-sm)]">
        <MapPin className="h-6 w-6 text-white" />
      </div>
      <div>
        <h2 className="rally-display text-xl font-bold text-foreground">
          {feminino ? "Próxima" : "Próximo"} {capitalize(checkpointTerm)} — {name}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isRedacted ? "Descobre onde é" : "Dirija-se a este local"}
        </p>
      </div>
    </div>
  );
}
