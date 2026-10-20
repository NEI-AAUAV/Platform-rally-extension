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
    <div className="flex items-start gap-4">
      <div className="rally-bg-accent flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl">
        <MapPin className="h-7 w-7 text-white" />
      </div>
      <div className="min-w-0">
        <p className="rally-eyebrow">
          {feminino ? "Próxima" : "Próximo"} {capitalize(checkpointTerm)}
        </p>
        <h2 className="rally-display mt-1 text-4xl text-foreground sm:text-5xl">
          <span className="sr-only">
            {feminino ? "Próxima" : "Próximo"} {capitalize(checkpointTerm)} —
          </span>{" "}
          {name}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isRedacted ? "Descobre onde é" : "Dirija-se a este local"}
        </p>
      </div>
    </div>
  );
}
