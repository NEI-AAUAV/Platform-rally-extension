import { test, expect, type Browser, type Page } from "@playwright/test";
import { mintToken, seedRealOidcSession } from "./helpers/fullstackAuth";
import { waitForApi } from "./helpers/seedRally";

/**
 * Fase 5 — Separadores de Administração em Falta e Identidade Visual (Fullstack UI)
 *
 * Cobre os restantes separadores de gestão da aplicação:
 * - 5.0. Setup de Evento e Equipa
 * - 5.1. Dashboard em tempo real (/rally/admin?tab=dashboard)
 * - 5.2. Identidade Visual e Branding (/rally/admin?tab=branding)
 * - 5.3. Catálogo de Crachás e Conquistas (/rally/admin?tab=badges)
 * - 5.4. Anúncios Globais / Broadcast (/rally/admin?tab=notifications)
 * - 5.5. Auditoria e Métricas (/rally/admin?tab=audit & tab=metrics)
 */

test.describe.configure({ mode: "serial" });

interface TestWorld {
  runId: string;
  eventName: string;
  teamName: string;
  accessCode: string;
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

test.describe("Fase 5: Separadores de Administração e Identidade Visual", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  // -------------------------------------------------------------------
  // 5.0 — Setup de evento e equipa
  // -------------------------------------------------------------------
  test("5.0 — Setup de evento e equipa para testes de separadores", async ({ browser }) => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const eventName = `E2E Tabs Event ${runId}`;
    const teamName = `E2E Tabs Team ${runId}`;

    const admin = await mintToken({
      sub: `e2e-tabs-adm-${runId}`,
      name: "E2E Tabs Admin",
      groups: ["admin"],
      email: `e2e-tabs-adm-${runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);

    try {
      // 1. Criar Evento
      await adminPage.goto("/rally/admin?tab=events");
      await adminPage.getByRole("button", { name: "Novo" }).click();
      await adminPage.locator("#ev-name").fill(eventName);
      await adminPage.getByRole("button", { name: /^Criar$/ }).click();
      await expect(adminPage.getByText(eventName)).toBeVisible({ timeout: 15_000 });

      // 2. Criar Checkpoint
      await adminPage.goto("/rally/admin?tab=checkpoints");
      await adminPage.getByPlaceholder("Ex: Checkpoint Central").fill(`Posto Tabs ${runId}`);
      await adminPage.getByPlaceholder("Ex: 40.6405").fill("40.6443");
      await adminPage.getByPlaceholder("Ex: -8.6538").fill("-8.6455");
      await adminPage.getByRole("button", { name: "Criar Checkpoint" }).click();
      await expect(adminPage.getByText(`Posto Tabs ${runId}`)).toBeVisible({ timeout: 15_000 });

      // 3. Criar Equipa
      await adminPage.goto("/rally/admin?tab=teams");
      await adminPage.getByPlaceholder("Ex: Equipa Alpha").fill(teamName);
      await adminPage.getByRole("button", { name: /^Criar Equipa$/ }).click();

      const modalHeading = adminPage.getByRole("heading", { name: /Equipa Criada!/i });
      await expect(modalHeading).toBeVisible({ timeout: 15_000 });

      const codeLocator = adminPage.locator("p.font-mono.text-2xl");
      await expect(codeLocator).toBeVisible({ timeout: 15_000 });
      const rawCode = await codeLocator.textContent();
      const accessCode = (rawCode ?? "").trim();
      expect(accessCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

      await adminPage.getByRole("button", { name: "Concluir" }).click();

      world = { runId, eventName, teamName, accessCode };
    } finally {
      await adminPage.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 5.1 — Dashboard em tempo real
  // -------------------------------------------------------------------
  test("5.1 — Dashboard exibe estado do evento e métricas globais", async ({ browser }) => {
    test.skip(!world, "Requer o setup inicial");
    const admin = await mintToken({
      sub: `e2e-tabs-adm-${world.runId}`,
      name: "E2E Tabs Admin",
      groups: ["admin"],
      email: `e2e-tabs-adm-${world.runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);

    try {
      await adminPage.goto("/rally/admin?tab=dashboard");

      // Verificar cabeçalho do Dashboard
      await expect(adminPage.getByRole("heading", { name: "Estado do evento" })).toBeVisible({
        timeout: 15_000,
      });

      // Verificar cartões de métricas
      await expect(adminPage.getByRole("paragraph").filter({ hasText: /^Equipas$/ })).toBeVisible({ timeout: 15_000 });
      await expect(adminPage.getByRole("paragraph").filter({ hasText: /^Postos$/ })).toBeVisible({ timeout: 15_000 });
      await expect(adminPage.getByRole("paragraph").filter({ hasText: /^Iniciaram$/ })).toBeVisible({ timeout: 15_000 });
      await expect(adminPage.getByRole("paragraph").filter({ hasText: /^Avaliações$/ })).toBeVisible({ timeout: 15_000 });
    } finally {
      await adminPage.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 5.2 — Identidade Visual e Branding
  // -------------------------------------------------------------------
  test("5.2 — Branding permite personalizar nome, subtítulo e cores do evento", async ({
    browser,
  }) => {
    test.skip(!world, "Requer o setup inicial");
    const admin = await mintToken({
      sub: `e2e-tabs-adm-${world.runId}`,
      name: "E2E Tabs Admin",
      groups: ["admin"],
      email: `e2e-tabs-adm-${world.runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);

    try {
      await adminPage.goto("/rally/admin?tab=branding");

      // Verificar carregamento da página de Branding
      await expect(adminPage.getByRole("heading", { name: "Identidade Visual" })).toBeVisible({
        timeout: 15_000,
      });

      // Alterar nome e subtítulo
      const customEventName = `Rally Especial E2E ${world.runId}`;
      const customSubtitle = "Edição Comemorativa de Testes";
      await adminPage.locator("#event_name").fill(customEventName);
      await adminPage.locator("#event_subtitle").fill(customSubtitle);

      // Guardar identidade
      await adminPage.getByRole("button", { name: "Guardar identidade" }).click();
      await expect(adminPage.getByText("Identidade visual atualizada!")).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await adminPage.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 5.3 — Catálogo de Crachás
  // -------------------------------------------------------------------
  test("5.3 — Catálogo de Crachás permite criar novo crachá", async ({ browser }) => {
    test.skip(!world, "Requer o setup inicial");
    const admin = await mintToken({
      sub: `e2e-tabs-adm-${world.runId}`,
      name: "E2E Tabs Admin",
      groups: ["admin"],
      email: `e2e-tabs-adm-${world.runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);

    try {
      await adminPage.goto("/rally/admin?tab=badges");

      // Abrir formulário de novo crachá
      await adminPage.getByRole("button", { name: "Novo crachá" }).click();

      const badgeName = `Crachá Mestre ${world.runId}`;
      const badgeCode = `mestre_${world.runId.replace(/-/g, "_")}`;
      const badgeDesc = "Atribuído aos mestres do percurso de teste.";

      await adminPage.getByPlaceholder("Nome do crachá").fill(badgeName);
      await adminPage.getByPlaceholder("ex: first_arrival").fill(badgeCode);
      await adminPage.getByPlaceholder(/Descrição opcional/i).fill(badgeDesc);

      // Criar crachá
      await adminPage.getByRole("button", { name: "Criar", exact: true }).click();

      // Verificar que o crachá aparece listado no catálogo
      await expect(adminPage.getByText(badgeName)).toBeVisible({ timeout: 15_000 });
      await expect(adminPage.getByText(badgeCode)).toBeVisible({ timeout: 15_000 });
    } finally {
      await adminPage.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 5.4 — Notificações e Anúncios Globais (Broadcast)
  // -------------------------------------------------------------------
  test("5.4 — Aba de Anúncios lida com estado do serviço de notificações push", async ({
    browser,
  }) => {
    test.skip(!world, "Requer o setup inicial");
    const admin = await mintToken({
      sub: `e2e-tabs-adm-${world.runId}`,
      name: "E2E Tabs Admin",
      groups: ["admin"],
      email: `e2e-tabs-adm-${world.runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);

    try {
      await adminPage.goto("/rally/admin?tab=notifications");

      // Pode renderizar o banner de falta de VAPID ou o formulário de broadcast
      const banner = adminPage.getByText(/Sem chave VAPID configurada/i);
      const titleInput = adminPage.getByPlaceholder("Ex: Atenção equipas!");

      await expect(banner.or(titleInput)).toBeVisible({ timeout: 15_000 });
    } finally {
      await adminPage.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 5.5 — Auditoria e Métricas
  // -------------------------------------------------------------------
  test("5.5 — Auditoria e Métricas exibem histórico de eventos e saúde do sistema", async ({
    browser,
  }) => {
    test.skip(!world, "Requer o setup inicial");
    const admin = await mintToken({
      sub: `e2e-tabs-adm-${world.runId}`,
      name: "E2E Tabs Admin",
      groups: ["admin"],
      email: `e2e-tabs-adm-${world.runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);

    try {
      // 1. Verificar aba de Auditoria
      await adminPage.goto("/rally/admin?tab=audit");
      await expect(adminPage.getByText(/Todas as ações/i)).toBeVisible({ timeout: 15_000 });

      // 2. Verificar aba de Métricas
      await adminPage.goto("/rally/admin?tab=metrics");
      await expect(adminPage.getByRole("heading", { name: "Métricas" })).toBeVisible({ timeout: 15_000 });
      await expect(adminPage.getByText("Base de dados")).toBeVisible({ timeout: 15_000 });
      await expect(adminPage.getByText("Redis")).toBeVisible({ timeout: 15_000 });
    } finally {
      await adminPage.context().close();
    }
  });
});
