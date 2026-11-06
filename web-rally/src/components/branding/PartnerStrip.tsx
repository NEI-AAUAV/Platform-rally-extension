import type { Branding } from "@/lib/branding";
import { cn } from "@/lib/utils";

interface PartnerStripProps {
  readonly branding: Pick<
    Branding,
    "showPartners" | "aauavLogoSrc" | "aauavLogoDarkSrc" | "partners"
  >;
  readonly className?: string;
}

const LOGO_SIZE = "h-9 w-auto max-w-[96px] object-contain sm:h-10";

// Without a white version, dark mode falls back to the coloured logo on a light
// tile: filters can't make arbitrary artwork legible (filled logos flatten into
// blobs, dark artwork vanishes).
const FALLBACK_DARK_TILE = "dark:box-content dark:rounded-lg dark:bg-white/90 dark:p-1.5";

interface ThemedLogoProps {
  readonly src: string;
  readonly darkSrc: string;
  readonly alt: string;
  readonly lazy?: boolean;
}

/** Coloured logo in light mode; the white version (when uploaded) in dark mode. */
function ThemedLogo({ src, darkSrc, alt, lazy = false }: ThemedLogoProps) {
  const loading = lazy ? "lazy" : undefined;
  if (!darkSrc) {
    return (
      <img
        src={src}
        alt={alt}
        title={alt}
        width={96}
        height={40}
        loading={loading}
        className={cn(LOGO_SIZE, FALLBACK_DARK_TILE)}
      />
    );
  }
  return (
    <>
      <img
        src={src}
        alt={alt}
        title={alt}
        width={96}
        height={40}
        loading={loading}
        className={cn(LOGO_SIZE, "dark:hidden")}
      />
      <img
        src={darkSrc}
        alt={alt}
        title={alt}
        width={96}
        height={40}
        loading={loading}
        className={cn(LOGO_SIZE, "hidden dark:block")}
      />
    </>
  );
}

/**
 * Logos of the núcleos that organise/take part in the rally with the NEI,
 * shown under the home subtitle. AAUAv symbol first, on the left.
 * Admin-controlled (Identidade Visual → Núcleos organizadores).
 */
export default function PartnerStrip({ branding, className }: PartnerStripProps) {
  const { showPartners, aauavLogoSrc, aauavLogoDarkSrc, partners } = branding;
  if (!showPartners || (!aauavLogoSrc && partners.length === 0)) return null;

  return (
    <ul
      aria-label="Núcleos organizadores"
      className={cn("flex max-w-full flex-wrap items-center gap-x-3 gap-y-2", className)}
    >
      {aauavLogoSrc && (
        <li>
          <ThemedLogo src={aauavLogoSrc} darkSrc={aauavLogoDarkSrc} alt="AAUAv" />
        </li>
      )}
      {partners.map((partner) => (
        <li key={partner.id}>
          <ThemedLogo src={partner.src} darkSrc={partner.darkSrc} alt={partner.name} lazy />
        </li>
      ))}
    </ul>
  );
}
