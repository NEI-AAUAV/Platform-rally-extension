#!/usr/bin/env node
/**
 * Traceability gate (Parte 0): every top-level route and every admin tab must
 * be referenced by at least one e2e spec, or the script exits non-zero. Run
 * via `node scripts/check-e2e-coverage.mjs` (add to CI once a workflow for
 * this package exists — see tests/e2e-fullstack/README.md).
 *
 * Deliberately simple text-grep, not an AST walk: routes/tabs rarely change
 * shape, and a grep-based check is easy to read and fix when it's wrong.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Routes intentionally excluded from the "every route needs a spec" rule.
const EXCLUDED_ROUTES = new Set([
  "/staff-evaluation/checkpoint/$checkpointId", // covered indirectly via staff-evaluation.spec.ts + idempotency/offline-pwa specs, which hardcode the checkpoint id rather than the route pattern
  "/teams/$id", // dynamic detail route; covered via team-progress/team-info specs using MOCK data ids, not the literal path pattern
]);

function extractRoutePaths(source) {
  const matches = [...source.matchAll(/^\s*path:\s*"([^"]+)"/gm)];
  return matches.map((m) => m[1]).filter((p) => !EXCLUDED_ROUTES.has(p));
}

function extractAdminTabIds(source) {
  const tabsBlock = source.match(/const TABS[^=]*=\s*\[([\s\S]*?)\n];/);
  if (!tabsBlock) return [];
  return [...tabsBlock[1].matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".spec.ts")) out.push(full);
  }
}

function readAllSpecs() {
  const specFiles = [];
  for (const dir of ["tests/e2e", "tests/e2e-fullstack"]) {
    try {
      walk(join(ROOT, dir), specFiles);
    } catch {
      // dir may not exist; skip
    }
  }
  return specFiles.map((f) => readFileSync(f, "utf8")).join("\n---\n");
}

function main() {
  const routesSource = readFileSync(join(ROOT, "src/router/routes.tsx"), "utf8");
  const adminSource = readFileSync(join(ROOT, "src/pages/admin/index.tsx"), "utf8");
  const allSpecs = readAllSpecs();

  const routes = extractRoutePaths(routesSource);
  const adminTabs = extractAdminTabIds(adminSource);

  const missingRoutes = routes.filter((route) => {
    // A route referenced as a literal path segment, e.g. "/postos" or
    // "'/rally/postos'" (base-path prefixed in goto calls).
    const needle = route === "/" ? "'/rally/'" : route;
    return !allSpecs.includes(needle) && !allSpecs.includes(`/rally${route}`);
  });

  // Some admin tabs are thin wrappers around a standalone top-level route
  // (e.g. the "assignment" tab renders the same view as goto('/assignment'))
  // and are exercised there instead of via `?tab=`.
  const TAB_COVERED_BY_ROUTE = {
    assignment: "/rally/assignment",
    "guide-assignment": "/rally/guide-assignment",
    versus: "/rally/versus",
  };

  const missingTabs = adminTabs.filter((tab) => {
    if (allSpecs.includes(`tab=${tab}`) || allSpecs.includes(`"${tab}"`)) return false;
    const routeAlias = TAB_COVERED_BY_ROUTE[tab];
    return !(routeAlias && allSpecs.includes(routeAlias));
  });

  const problems = [];
  if (missingRoutes.length > 0) {
    problems.push(`Routes with no e2e spec coverage:\n${missingRoutes.map((r) => `  - ${r}`).join("\n")}`);
  }
  if (missingTabs.length > 0) {
    problems.push(`Admin tabs with no e2e spec coverage:\n${missingTabs.map((t) => `  - ${t}`).join("\n")}`);
  }

  if (problems.length > 0) {
    console.error("e2e traceability gate FAILED\n");
    console.error(problems.join("\n\n"));
    console.error(
      `\n${routes.length} routes, ${adminTabs.length} admin tabs checked. Add a spec (or add an explicit exclusion with a reason in this script) before merging.`,
    );
    process.exit(1);
  }

  console.log(`e2e traceability gate passed: ${routes.length} routes, ${adminTabs.length} admin tabs all covered.`);
}

main();
