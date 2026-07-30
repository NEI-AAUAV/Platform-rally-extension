import { useState } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { RallyButton } from "@/components/themes/rally";
import type { Branding } from "@/lib/branding";

interface LandingGateProps {
  readonly branding: Branding;
  /** Starts the staff (authentik) login flow. */
  readonly onStaffLogin: () => void;
  /** Path the "Login Equipa" button points to. */
  readonly teamLoginHref?: string;
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
 * Unauthenticated landing. A single centered entry card: banner cover, logo,
 * event name and the two login options. Deliberately compact and fully visible
 * at any viewport — all labels/images come from {@link Branding}.
 */
export default function LandingGate({
  branding,
  onStaffLogin,
  teamLoginHref = "/rally/team-login",
}: LandingGateProps) {
  const { eventName, eventSubtitle, bannerSrc, logoSrc } = branding;
  const [bannerError, setBannerError] = useState(false);
  const showBanner = !bannerError;

  return (
    <div className="flex min-h-screen w-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="mb-4 text-center font-display text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Núcleo de Estudantes de Informática
        </p>

        <div className="overflow-hidden rounded-3xl border border-border bg-muted shadow-[0_30px_70px_-30px_rgba(0,0,0,0.8)]">
          {/* banner cover */}
          {showBanner && (
            <div className="relative h-32 w-full overflow-hidden sm:h-36">
              <img
                src={bannerSrc}
                alt={`${eventName} banner`}
                onError={() => setBannerError(true)}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-[rgb(10,10,10)]/95" />
            </div>
          )}

          <div className="px-6 pb-7 pt-0">
            {/* logo overlapping the banner */}
            <div className={`flex justify-center ${showBanner ? "-mt-9" : "pt-8"}`}>
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt={`${eventName} logo`}
                  className="h-[72px] w-[72px] rounded-2xl bg-muted object-contain ring-4 ring-border"
                />
              ) : (
                <span className="rally-bg-accent rally-shadow-accent grid h-[72px] w-[72px] place-items-center rounded-2xl font-display text-2xl font-bold text-white ring-4 ring-border">
                  {initialsOf(eventName)}
                </span>
              )}
            </div>

            <h1 className="rally-display mt-4 break-words text-center text-3xl font-bold leading-tight text-foreground sm:text-4xl">
              {eventName}
            </h1>
            {eventSubtitle && (
              <p className="mt-2 text-center text-sm text-muted-foreground">{eventSubtitle}</p>
            )}

            <div className="rally-bg-accent mx-auto my-6 h-px w-16 opacity-70" />

            <div className="grid gap-3">
              <RallyButton
                type="button"
                variant="primary"
                size="lg"
                onClick={onStaffLogin}
                className="rally-shadow-accent hover:-translate-y-0.5"
              >
                <ShieldCheck className="h-4 w-4" />
                Login Staff
              </RallyButton>
              <RallyButton asChild variant="outline" size="lg" className="hover:-translate-y-0.5">
                <a href={teamLoginHref}>
                  <Users className="h-4 w-4" />
                  Login Equipa
                </a>
              </RallyButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
