import { useState } from "react";
import type { Branding } from "@/lib/branding";
import { FALLBACK_BANNER_SRC } from "@/lib/branding";

interface BrandHeaderProps {
  readonly branding: Branding;
  readonly className?: string;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Branded header for the authenticated shell: the event banner as a slim
 * cinematic strip with the logo and event name overlaid. All data-driven.
 */
export default function BrandHeader({ branding, className = "" }: BrandHeaderProps) {
  const { eventName, eventSubtitle, bannerSrc, logoSrc } = branding;
  const [bannerError, setBannerError] = useState(false);
  const banner = bannerError ? FALLBACK_BANNER_SRC : bannerSrc;

  return (
    <header
      className={`relative mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-border shadow-[0_24px_50px_-28px_rgba(0,0,0,0.7)] ${className}`}
    >
      <img
        src={banner}
        alt={`${eventName} banner`}
        onError={() => setBannerError(true)}
        className="h-28 w-full object-cover sm:h-36"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
      <div className="absolute inset-0 flex items-center gap-3 px-5 sm:gap-4 sm:px-7">
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={`${eventName} logo`}
            className="h-12 w-12 rounded-xl object-contain ring-1 ring-white/20 sm:h-14 sm:w-14"
          />
        ) : (
          <span className="rally-bg-accent rally-shadow-accent grid h-12 w-12 place-items-center rounded-xl font-display text-lg font-bold text-white sm:h-14 sm:w-14">
            {initialsOf(eventName)}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="rally-display truncate text-2xl font-bold text-foreground sm:text-3xl">{eventName}</h1>
          {eventSubtitle && (
            <p className="truncate text-sm text-muted-foreground">{eventSubtitle}</p>
          )}
        </div>
      </div>
    </header>
  );
}
