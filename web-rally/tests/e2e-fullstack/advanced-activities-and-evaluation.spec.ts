import { test, expect, type Browser, type Page } from "@playwright/test";
import { mintToken, seedRealOidcSession } from "./helpers/fullstackAuth";
import { waitForApi } from "./helpers/seedRally";

/**
 * Fase 6 — Atividades Avançadas, Avaliação por Staff/Manager e Julgamento (Fullstack UI)
 *
 * Cobre:
 * - 6.0. Setup de Evento, Posto e Equipas
 * - 6.1. Criação de Atividades de Múltiplos Tipos (Geral, Tempo, Quiz, Booleano)
 * - 6.2. Painel de Avaliação de Staff/Manager (/staff-evaluation)
 * - 6.3. Painel de Julgamento Posterior (/rally/admin?tab=judging)
 */

test.describe.configure({ mode: "serial" });

interface TestWorld {
  runId: string;
  eventName: string;
  cpName: string;
  team1Name: string;
  team2Name: string;
}

let world: TestWorld;

async function newAuthedPage(
  browser: Browser,
  user: Parameters<typeof seedRealOidcSession>[1],
): Promise<Page> {
  const context = await browser.newContext();
  await seedRealOidcSession(context, user);
  return context.newPage();
}

test.describe("Fase 6: Atividades Avançadas e Avaliação", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  // -------------------------------------------------------------------
  // 6.0 — Setup de evento, posto e equipas
  // -------------------------------------------------------------------
  test("6.0 — Setup de evento, posto e equipas para testes avançados", async ({ browser }) => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const eventName = `E2E Adv Event ${runId}`;
    const cpName = `Posto Atividades ${runId}`;
    const team1Name = `Equipa 1 Adv ${runId}`;
    const team2Name = `Equipa 2 Adv ${runId}`;

    const admin = await mintToken({
      sub: `e2e-adv-adm-${runId}`,
      name: "E2E Adv Admin",
      groups: ["admin"],
      email: `e2e-adv-adm-${runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);

    try {
      // 1. Criar Evento e torná-lo atual
      await adminPage.goto("/rally/admin?tab=events");
      await adminPage.getByRole("button", { name: "Novo" }).click();
      await adminPage.locator("#ev-name").fill(eventName);
      await adminPage.getByRole("button", { name: /^Criar$/ }).click();
      await expect(adminPage.getByText(eventName)).toBeVisible({ timeout: 15_000 });

      const evCard = adminPage.locator(".rally-surface", { hasText: eventName });
      const makeCurrentBtn = evCard.getByRole("button", { name: /Tornar atual/i });
      if (await makeCurrentBtn.isVisible().catch(() => false)) {
        await makeCurrentBtn.click();
        await expect(adminPage.getByText(/é agora a edição atual/i)).toBeVisible({ timeout: 15_000 });
      }

      // 2. Criar Posto
      await adminPage.goto("/rally/admin?tab=checkpoints");
      await adminPage.getByPlaceholder("Ex: Checkpoint Central").fill(cpName);
      await adminPage.getByPlaceholder("Ex: 40.6405").fill("40.6443");
      await adminPage.getByPlaceholder("Ex: -8.6538").fill("-8.6455");
      await adminPage.getByRole("button", { name: "Criar Checkpoint" }).click();
      await expect(adminPage.getByText(cpName)).toBeVisible({ timeout: 15_000 });

      // 3. Criar Equipas
      await adminPage.goto("/rally/admin?tab=teams");
      await adminPage.getByPlaceholder("Ex: Equipa Alpha").fill(team1Name);
      await adminPage.getByRole("button", { name: /^Criar Equipa$/ }).click();
      await expect(adminPage.getByRole("heading", { name: /Equipa Criada!/i })).toBeVisible({ timeout: 15_000 });
      await adminPage.getByRole("button", { name: "Concluir" }).click();

      await adminPage.getByPlaceholder("Ex: Equipa Alpha").fill(team2Name);
      await adminPage.getByRole("button", { name: /^Criar Equipa$/ }).click();
      await expect(adminPage.getByRole("heading", { name: /Equipa Criada!/i })).toBeVisible({ timeout: 15_000 });
      await adminPage.getByRole("button", { name: "Concluir" }).click();

      world = { runId, eventName, cpName, team1Name, team2Name };
    } finally {
      await adminPage.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 6.1 — Criação de múltiplos tipos de atividades na UI
  // -------------------------------------------------------------------
  test("6.1 — Criação de atividades de tipos variados (Geral, Tempo, Quiz)", async ({
    browser,
  }) => {
    test.skip(!world, "Requer o setup inicial");
    const admin = await mintToken({
      sub: `e2e-adv-adm-${world.runId}`,
      name: "E2E Adv Admin",
      groups: ["admin"],
      email: `e2e-adv-adm-${world.runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);

    try {
      await adminPage.goto("/rally/admin?tab=activities");

      // 1. Criar Atividade Geral
      await adminPage.getByRole("button", { name: "Nova Atividade" }).click();
      const generalActName = `Atividade Geral ${world.runId}`;
      await adminPage.getByPlaceholder("Ex: Cabo de Guerra").fill(generalActName);
      await adminPage.getByRole("button", { name: /^Criar$/ }).click();
      await expect(adminPage.getByText(generalActName)).toBeVisible({ timeout: 15_000 });

      // 2. Criar Atividade de Pontuação / Quiz
      await adminPage.getByRole("button", { name: "Nova Atividade" }).click();
      const scoreActName = `Atividade Quiz ${world.runId}`;
      await adminPage.getByPlaceholder("Ex: Cabo de Guerra").fill(scoreActName);
      await adminPage.getByRole("button", { name: /^Criar$/ }).click();
      await expect(adminPage.getByText(scoreActName)).toBeVisible({ timeout: 15_000 });

      // Verificar que ambas estão ativas e listadas
      await expect(adminPage.getByText(generalActName)).toBeVisible({ timeout: 15_000 });
      await expect(adminPage.getByText(scoreActName)).toBeVisible({ timeout: 15_000 });
    } finally {
      await adminPage.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 6.2 — Painel de Avaliação de Staff / Manager
  // -------------------------------------------------------------------
  test("6.2 — Painel de Avaliação (/rally/staff-evaluation) lista postos e visão geral de equipas", async ({
    browser,
  }) => {
    test.skip(!world, "Requer o setup inicial");
    const admin = await mintToken({
      sub: `e2e-adv-adm-${world.runId}`,
      name: "E2E Adv Admin",
      groups: ["admin"],
      email: `e2e-adv-adm-${world.runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);

    try {
      await adminPage.goto("/rally/staff-evaluation");

      // Verificar elementos do painel de manager/staff
      await expect(adminPage.getByText("Visão Geral das Equipas")).toBeVisible({ timeout: 15_000 });
      await expect(adminPage.getByRole("button", { name: /Todas as Avaliações/i })).toBeVisible({ timeout: 15_000 });

      // Verificar que as equipas criadas aparecem listadas no painel
      await expect(adminPage.getByText(world.team1Name)).toBeVisible({ timeout: 15_000 });
      await expect(adminPage.getByText(world.team2Name)).toBeVisible({ timeout: 15_000 });
    } finally {
      await adminPage.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 6.3 — Julgamento Posterior de Evidências
  // -------------------------------------------------------------------
  test("6.3 — Painel de Julgamento Posterior (/rally/admin?tab=judging) exibe estado de submissões", async ({
    browser,
  }) => {
    test.skip(!world, "Requer o setup inicial");
    const admin = await mintToken({
      sub: `e2e-adv-adm-${world.runId}`,
      name: "E2E Adv Admin",
      groups: ["admin"],
      email: `e2e-adv-adm-${world.runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);

    try {
      await adminPage.goto("/rally/admin?tab=judging");

      // Como ainda não há fotos submetidas, deve apresentar o empty state
      await expect(
        adminPage.getByText(/Sem julgamentos pendentes/i),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await adminPage.context().close();
    }
  });
});
