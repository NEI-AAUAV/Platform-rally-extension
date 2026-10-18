import type { ReactNode } from "react";

interface SectionHeaderProps {
  readonly id: string;
  /** Short uppercase label above the title, e.g. "Ao vivo". */
  readonly eyebrow: string;
  readonly title: string;
  /** Optional trailing slot (links, freshness indicator). */
  readonly action?: ReactNode;
}

/** Shared homepage section heading: accent eyebrow, display title, optional action. */
export function SectionHeader({ id, eyebrow, title, action }: SectionHeaderProps) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <p className="rally-accent mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em]">
          <span aria-hidden className="rally-bg-accent h-[3px] w-6 rounded-full" />
          {eyebrow}
        </p>
        <h2
          id={id}
          className="rally-display text-[28px] font-bold text-foreground sm:text-[36px]"
        >
          {title}
        </h2>
      </div>
      {action && <div className="flex shrink-0 items-center gap-3">{action}</div>}
    </div>
  );
}

export default SectionHeader;
