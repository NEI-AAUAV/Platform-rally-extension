#!/usr/bin/env node
/**
 * Fails the build when the PWA surface regresses.
 *
 * Everything checked here is silent when wrong: the app still loads and the
 * tests still pass, it just installs as a browser shortcut, opens its own links
 * in a tab, or stops matching the system theme. The failure only shows up on a
 * phone, which is exactly where nobody is looking during a deploy.
 *
 * This is a static check against dist/ rather than a Lighthouse run: Lighthouse
 * dropped its PWA category in v12, so there is no score left to gate on, and a
 * headless-Chrome audit in CI buys flakiness we do not need for what is
 * ultimately a set of assertions about a JSON file.
 *
 * Usage: node scripts/verify-pwa-build.mjs [distDir]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, sep } from "node:path";

const projectRoot = resolve(process.cwd());
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

/**
 * Resolve `segments` under `base` and refuse anything that escapes it.
 *
 * Both the CLI argument and the manifest-supplied icon/screenshot paths are
 * untrusted here: `../../etc/passwd` in either one would otherwise turn this
 * verifier into an arbitrary-file reader.
 */
function safeResolve(base, ...segments) {
  const target = resolve(base, ...segments);
  if (target !== base && !target.startsWith(base + sep)) {
    console.error(`✗ refusing path outside ${base}: ${segments.join("/")}`);
    process.exit(1);
  }
  return target;
}

/**
 * Accept only a relative, dot-free path made of plain path characters.
 *
 * `safeResolve` below already rejects anything that escapes the root, but that
 * check happens after the join, so a taint analyser cannot see it. Screening
 * the raw CLI argument against an allow-list first makes the guarantee local
 * and obvious: nothing absolute and no `..` segment ever reaches `resolve`.
 */
const DIST_ARG_PATTERN = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/?$/;

const distArg = process.argv[2] ?? "dist";
if (!DIST_ARG_PATTERN.test(distArg)) {
  console.error(`✗ invalid dist directory argument: ${distArg}`);
  process.exit(1);
}

const dist = safeResolve(projectRoot, distArg);

// --- manifest -------------------------------------------------------------
const manifestPath = safeResolve(dist, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error(`✗ ${manifestPath} is missing — the app is not installable at all`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

check(manifest.name, "manifest.name is empty");
check(manifest.short_name, "manifest.short_name is empty — the launcher label");
check(
  manifest.display === "standalone",
  `manifest.display is "${manifest.display}", expected "standalone"`,
);
check(
  manifest.id === "/rally/",
  `manifest.id is "${manifest.id}", expected "/rally/" (changing it orphans existing installs)`,
);
check(manifest.scope === "/rally/", `manifest.scope is "${manifest.scope}", expected "/rally/"`);
check(
  manifest.start_url === "/rally/",
  `manifest.start_url is "${manifest.start_url}", expected "/rally/"`,
);
check(
  manifest.handle_links === "preferred",
  'manifest.handle_links is not "preferred" — Android will open in-app links in a browser tab',
);

const icons = manifest.icons ?? [];
const purposes = new Set(icons.flatMap((icon) => (icon.purpose ?? "any").split(/\s+/)));
check(purposes.has("any"), "no icon with purpose 'any'");
check(
  purposes.has("maskable"),
  "no maskable icon — Android will letterbox the icon in a white circle",
);
check(purposes.has("monochrome"), "no monochrome icon — the launcher cannot theme the icon");
check(
  icons.some((icon) => icon.sizes === "512x512"),
  "no 512x512 icon — required for the install dialog",
);

// Every referenced file must actually ship; a 404 here is invisible until an
// install dialog renders a blank square.
for (const icon of icons) {
  const rel = icon.src.replace(/^\/rally\//, "");
  check(
    existsSync(safeResolve(dist, rel)),
    `icon ${icon.src} is referenced but not present in ${dist}`,
  );
}
for (const shot of manifest.screenshots ?? []) {
  const rel = shot.src.replace(/^\/rally\//, "");
  check(
    existsSync(safeResolve(dist, rel)),
    `screenshot ${shot.src} is referenced but not present in ${dist}`,
  );
}

// --- service worker -------------------------------------------------------
check(
  existsSync(safeResolve(dist, "sw.js")),
  "dist/sw.js is missing — no offline support, no push",
);

// --- document head --------------------------------------------------------
const html = readFileSync(safeResolve(dist, "index.html"), "utf8");

check(
  /<meta[^>]+name="theme-color"[^>]+media="\(prefers-color-scheme:\s*light\)"/.test(html),
  "no light-scheme theme-color meta — the Android status bar tint will not follow the colour mode",
);
check(
  /<meta[^>]+name="theme-color"[^>]+media="\(prefers-color-scheme:\s*dark\)"/.test(html),
  "no dark-scheme theme-color meta",
);
check(
  /viewport-fit=cover/.test(html),
  "viewport is missing viewport-fit=cover — env(safe-area-inset-*) stays 0 and the layout ignores the notch",
);
check(
  /interactive-widget=resizes-content/.test(html),
  "viewport is missing interactive-widget=resizes-content — the Android keyboard will cover the bottom nav",
);
check(/rel="manifest"/.test(html), "index.html does not link the manifest");

// --- report ---------------------------------------------------------------
if (failures.length > 0) {
  console.error(`✗ PWA build verification failed (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`✓ PWA build verified (${icons.length} icons, manifest + service worker present)`);
