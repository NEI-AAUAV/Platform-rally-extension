import { Link } from "@tanstack/react-router";
import { Mail, MapPin } from "lucide-react";
import { SiFacebook, SiGithub, SiInstagram, SiYoutube } from "@icons-pack/react-simple-icons";
import { LinkedinIcon } from "@/components/shared/icons/LinkedinIcon";
import type { Branding } from "@/lib/branding";
import neiLogoBlack from "@/assets/nei/logo/horizontal/black.png";
import neiLogoWhite from "@/assets/nei/logo/horizontal/white.png";
import mapBlack from "@/assets/footer/map-black.png";
import mapWhite from "@/assets/footer/map-white.png";

interface SiteFooterProps {
  readonly branding: Branding;
}

const SOCIALS = [
  { label: "Instagram", href: "https://www.instagram.com/nei.aauav/", Icon: SiInstagram },
  { label: "Facebook", href: "https://www.facebook.com/nei.aauav", Icon: SiFacebook },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/nei-aauav", Icon: LinkedinIcon },
  { label: "GitHub", href: "https://github.com/NEI-AAUAV", Icon: SiGithub },
  { label: "YouTube", href: "https://www.youtube.com/@neiaauav2598", Icon: SiYoutube },
] as const;

const QUICK_LINKS = [
  { name: "Pontuação", to: "/scoreboard" },
  { name: "Postos", to: "/checkpoints" },
  { name: "Regras", to: "/rules" },
] as const;

/**
 * Site footer mirroring the NEI ecosystem structure (brand + contact + social +
 * quick links over a faint Aveiro map), rendered in rally's own soft-depth
 * language — soft surfaces and accent hovers, not the gamification brutalism.
 * Theme-aware: the map and wordmark swap between light/dark.
 */
export function SiteFooter({ branding }: SiteFooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer
      className="relative mt-16 overflow-hidden border-t border-border bg-card/40"
      style={{
        // Keeps the last row clear of the iOS home-indicator gesture zone,
        // which stays reserved even after the indicator itself fades.
        paddingBottom: "var(--safe-bottom)",
      }}
    >
      {/* Faint Aveiro map — swaps with color mode */}
      <img
        src={mapWhite}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.45] dark:hidden"
      />
      <img
        src={mapBlack}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover opacity-[0.45] dark:block"
      />

      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-3">
        {/* Brand + social */}
        <div className="space-y-4 lg:col-span-1">
          <img src={neiLogoBlack} alt="NEI" className="h-20 object-contain dark:hidden" />
          <img src={neiLogoWhite} alt="NEI" className="hidden h-20 object-contain dark:block" />
          <p className="max-w-xs text-sm text-muted-foreground">
            Núcleo de Estudantes de Informática da AAUAv. A apoiar os estudantes desde 2013.
          </p>
          <div className="flex flex-wrap gap-2">
            {SOCIALS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={label}
                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-all hover:-translate-y-0.5 hover:bg-[var(--rally-accent,#008542)] hover:text-white"
              >
                <Icon className="h-4 w-4" color="currentColor" />
              </a>
            ))}
          </div>
        </div>

        {/* Quick links */}
        <nav aria-label="Ligações rápidas" className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {branding.eventName}
          </h2>
          <ul className="space-y-2 text-sm">
            {QUICK_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="text-foreground/80 transition-colors hover:text-foreground"
                >
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Contact */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Contacto
          </h2>
          <ul className="space-y-2 text-sm">
            <li>
              <a
                href="https://goo.gl/maps/JZY6mi3T9T6UxE3z6"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 text-foreground/80 transition-colors hover:text-foreground"
              >
                <MapPin className="h-4 w-4 shrink-0" />
                3810-193 Aveiro, Portugal
              </a>
            </li>
            <li>
              <a
                href="mailto:nei@aauav.pt"
                className="inline-flex items-center gap-2 text-foreground/80 transition-colors hover:text-foreground"
              >
                <Mail className="h-4 w-4 shrink-0" />
                nei@aauav.pt
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="relative border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted-foreground">
          © {year} NEI-AAUAv · Todos os direitos reservados
        </p>
      </div>
    </footer>
  );
}

export default SiteFooter;
