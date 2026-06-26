import { Link } from "@tanstack/react-router";
import { Facebook, Github, Instagram, Linkedin, Youtube, Mail } from "lucide-react";
import type { Branding } from "@/lib/branding";

interface SiteFooterProps {
  readonly branding: Branding;
}

const SOCIALS = [
  { label: "Instagram", href: "https://www.instagram.com/nei.aauav/", Icon: Instagram },
  { label: "Facebook", href: "https://www.facebook.com/nei.aauav", Icon: Facebook },
  { label: "GitHub", href: "https://github.com/NEI-AAUAV", Icon: Github },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/nei-aauav", Icon: Linkedin },
  { label: "YouTube", href: "https://www.youtube.com/@neiaauav2598", Icon: Youtube },
] as const;

const QUICK_LINKS = [
  { name: "Pontuação", to: "/scoreboard" },
  { name: "Postos", to: "/postos" },
] as const;

/**
 * Site footer: NEI branding/social on the left, rally quick links on the right.
 * Theme-aware (light/dark) via design tokens; accent on the wordmark.
 */
export function SiteFooter({ branding }: SiteFooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border bg-card/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-3">
        {/* Brand + social */}
        <div className="space-y-4 lg:col-span-1">
          <p className="rally-display text-xl font-bold text-foreground">
            {branding.eventName}
          </p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Uma iniciativa do Núcleo de Estudantes de Informática da AAUAv.
          </p>
          <div className="flex flex-wrap gap-2">
            {SOCIALS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={label}
                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>

        {/* Quick links */}
        <nav aria-label="Ligações rápidas" className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Rally
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
                href="mailto:nei@aauav.pt"
                className="inline-flex items-center gap-2 text-foreground/80 transition-colors hover:text-foreground"
              >
                <Mail className="h-4 w-4" />
                nei@aauav.pt
              </a>
            </li>
            <li>
              <a
                href="https://nei.web.ua.pt"
                target="_blank"
                rel="noreferrer noopener"
                className="text-foreground/80 transition-colors hover:text-foreground"
              >
                nei.web.ua.pt
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted-foreground">
          © {year} NEI-AAUAv · {branding.eventName}
        </p>
      </div>
    </footer>
  );
}

export default SiteFooter;
