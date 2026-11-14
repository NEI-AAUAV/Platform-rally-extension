import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Playwright globalSetup: refuse to run against a stale `dist/`.
 *
 * Both e2e web servers are `vite preview`, which serves whatever is in `dist/`,
 * and locally an already-running preview is reused. Editing `src/` without
 * rebuilding therefore tests the *previous* build: new UI is simply missing and
 * the failure reads like a broken locator. Fail fast with the actual cause.
 *
 * CI always builds right before the e2e step, so the check is local-only.
 * Set `E2E_SKIP_BUILD_CHECK=1` to bypass it deliberately.
 */

const ROOT = process.cwd();
const BUILD_MARKER = join(ROOT, "dist", "index.html");
// Everything `pnpm build` reads to produce dist/. The generated client
// (src/client, gitignored) is rewritten by every `pnpm test` via `pretest`, so
// it is skipped and its real source, openapi.json, is watched instead.
const BUILD_INPUTS = ["src", "public", "index.html", "vite.config.ts", "openapi.json"];
const IGNORED = new Set([join(ROOT, "src", "client")]);

function newestMtime(path: string): number {
  if (IGNORED.has(path) || !existsSync(path)) return 0;
  const stats = statSync(path);
  if (!stats.isDirectory()) return stats.mtimeMs;
  return readdirSync(path).reduce(
    (newest, entry) => Math.max(newest, newestMtime(join(path, entry))),
    // Files only: a directory's mtime also moves when generated output
    // (src/client) is deleted and recreated inside it.
    0,
  );
}

export default function assertFreshBuild(): void {
  if (process.env.CI || process.env.E2E_SKIP_BUILD_CHECK) return;

  if (!existsSync(BUILD_MARKER)) {
    throw new Error("e2e: dist/ não existe. Corre `pnpm build` antes de `pnpm test:e2e`.");
  }

  const builtAt = statSync(BUILD_MARKER).mtimeMs;
  const changedAt = Math.max(...BUILD_INPUTS.map((input) => newestMtime(join(ROOT, input))));
  if (changedAt > builtAt) {
    throw new Error(
      "e2e: dist/ está desatualizado em relação a src/ — o vite preview serviria o build " +
        "anterior. Corre `pnpm build` (ou define E2E_SKIP_BUILD_CHECK=1 para ignorar).",
    );
  }
}
