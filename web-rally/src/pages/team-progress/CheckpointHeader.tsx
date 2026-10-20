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
  const label = `${feminino ? "Próxima" : "Próximo"} ${capitalize(checkpointTerm)}`;
  return (
    <div className="flex items-start gap-3">
      <div className="rally-bg-accent flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
        <MapPin className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="rally-eyebrow">{label}</p>
        <h2 className="rally-display mt-1 text-3xl [overflow-wrap:anywhere] text-foreground sm:text-4xl">
          <span className="sr-only">{label} —</span> {name}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isRedacted ? "Descobre onde é" : "Dirige-te a este local"}
        </p>
      </div>
    </div>
  );
}
