import { test, expect, type Browser, type Page } from "@playwright/test";
import { mintToken, seedRealOidcSession } from "./helpers/fullstackAuth";
import { waitForApi } from "./helpers/seedRally";

/**
 * Fase 2 — Páginas e Funcionalidades da Equipa (Fullstack UI)
 *
 * Cobre as rotas e interações do participante:
 * - /team-info (membros, capitão, acesso)
 * - /team-settings (definições de equipa, logout)
 * - /team-members (gestão de membros pelo admin)
 * - /rules (secções expansíveis de FAQ e regras)
 * - /achievements (vitrine de crachás/conquistas)
 * - /preferences e /profile (aparência, tema claro/escuro)
 * - /checkpoints (mapa e lista de postos)
 */

test.describe.configure({ mode: "serial" });

interface TeamWorld {
  readonly runId: string;
  readonly adminToken: string;
  readonly eventName: string;
  readonly teamName: string;
  readonly accessCode: string;
}

let world: TeamWorld;

async function newPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

async function newAuthedPage(
  browser: Browser,
  user: Parameters<typeof seedRealOidcSession>[1],
): Promise<Page> {
  const context = await browser.newContext();
  await seedRealOidcSession(context, user);
  return context.newPage();
}

test.describe("Fase 2: Páginas e Funcionalidades da Equipa", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  // -------------------------------------------------------------------
  // Setup: Criação de Evento, Postos, Equipa e Membros via Admin UI
  // -------------------------------------------------------------------
  test("2.0 — Setup do evento e equipa através do Admin UI", async ({ browser }) => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const admin = await mintToken({
      sub: `e2e-team-admin-${runId}`,
      name: "E2E Team Admin",
      groups: ["admin"],
      email: `e2e-team-admin-${runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);
    const eventName = `E2E Team Exp ${runId}`;
    const teamName = `E2E Equipa Exp ${runId}`;
    let accessCode = "";

    try {
      // 1. Criar Evento
      await adminPage.goto("/rally/admin?tab=events");
      await adminPage.getByRole("button", { name: "Novo" }).click();
      await adminPage.locator("#ev-name").fill(eventName);
      await adminPage.locator("#ev-type").click();
      await adminPage.getByRole("option", { name: "Peddy-paper" }).click();
      await adminPage.getByRole("button", { name: /^Criar$/ }).click();
      await expect(adminPage.getByText(eventName)).toBeVisible({ timeout: 15_000 });

      // Tornar atual
      const eventCard = adminPage.locator(".rally-surface", { hasText: eventName });
      if (
        await eventCard
          .getByRole("button", { name: "Tornar atual" })
          .isVisible()
          .catch(() => false)
      ) {
        await eventCard.getByRole("button", { name: "Tornar atual" }).click();
        await expect(eventCard.getByText("Atual", { exact: true })).toBeVisible({
          timeout: 15_000,
        });
      }

      // 2. Criar Checkpoint
      await adminPage.goto("/rally/admin?tab=checkpoints");
      await adminPage.getByPlaceholder("Ex: Checkpoint Central").fill(`Posto Central ${runId}`);
      await adminPage.getByPlaceholder("Ex: 40.6405").fill("40.6443");
      await adminPage.getByPlaceholder("Ex: -8.6538").fill("-8.6455");
      await adminPage.getByPlaceholder("Ex: 50").fill("60");
      await adminPage
        .getByPlaceholder("Ex: Onde o rio encontra a ponte de ferro...")
        .fill("Enigma da equipa");
      await adminPage.getByRole("button", { name: "Criar Checkpoint" }).click();
      await expect(adminPage.getByText(`Posto Central ${runId}`)).toBeVisible({ timeout: 15_000 });

      // 3. Criar Equipa
      await adminPage.goto("/rally/admin?tab=teams");
      await adminPage.getByPlaceholder("Ex: Equipa Alpha").fill(teamName);
      await adminPage.getByRole("button", { name: /^Criar Equipa$/ }).click();
      await expect(adminPage.getByText("Equipa Criada!")).toBeVisible({ timeout: 15_000 });

      const codeMatch = await adminPage.getByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/).innerText();
      accessCode = codeMatch.trim();
      expect(accessCode).toBeTruthy();
      await adminPage.getByRole("button", { name: "Concluir" }).click();

      // 4. Adicionar Membros à Equipa através do separador Membros (/admin?tab=members)
      await adminPage.goto("/rally/admin?tab=members");
      await expect(
        adminPage.getByRole("heading", { name: "Selecionar Equipa" }),
      ).toBeVisible({ timeout: 15_000 });

      // Selecionar a equipa no dropdown
      await adminPage.locator("#team-select").click();
      await adminPage.getByRole("option", { name: new RegExp(teamName) }).click();

      await expect(adminPage.getByRole("heading", { name: "Adicionar Membro" })).toBeVisible({
        timeout: 15_000,
      });

      // Adicionar Membro 1 (Capitão)
      await adminPage.locator("#name").fill("Capitão Pedro");
      await adminPage.locator("#email").fill(`pedro-${runId}@ua.pt`);
      await adminPage.locator("label:has(input[role='switch'])").click();
      await adminPage.getByRole("button", { name: "Adicionar Membro" }).click();
      await expect(adminPage.getByText("Capitão Pedro")).toBeVisible({ timeout: 15_000 });

      // Adicionar Membro 2 (Maria)
      await adminPage.locator("#name").fill("Maria Silva");
      await adminPage.locator("#email").fill(`maria-${runId}@ua.pt`);
      await adminPage.getByRole("button", { name: "Adicionar Membro" }).click();
      await expect(adminPage.getByText("Maria Silva")).toBeVisible({ timeout: 15_000 });

      world = {
        runId,
        adminToken: admin.accessToken,
        eventName,
        teamName,
        accessCode,
      };
    } finally {
      await adminPage.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 2.1 & 2.3 — Equipa /team-info e Membros
  // -------------------------------------------------------------------
  test("2.1 & 2.3 — Equipa consulta os seus membros, capitão e dados no /team-info", async ({
    browser,
  }) => {
    test.skip(!world, "Requer o setup inicial");
    const page = await newPage(browser);

    try {
      await page.goto("/rally/team-login");
      await page.getByPlaceholder("XXXX-XXXX").fill(world.accessCode);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await page.waitForURL("**/team-progress", { timeout: 20_000 });

      // Navegar para /team-info
      await page.goto("/rally/team-info");
      await expect(page.getByText("A minha equipa")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("heading", { name: world.teamName })).toBeVisible();

      // Membros adicionados pelo admin no setup devem estar visíveis
      await expect(page.getByText("Capitão Pedro")).toBeVisible();
      await expect(page.getByText("Maria Silva")).toBeVisible();
      await expect(page.getByText("Capitão", { exact: true })).toBeVisible();
    } finally {
      await page.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 2.2 — Configurações da Equipa e Logout (/team-settings)
  // -------------------------------------------------------------------
  test("2.2 — Equipa acede a /team-settings e termina a sessão", async ({ browser }) => {
    test.skip(!world, "Requer o setup inicial");
    const page = await newPage(browser);

    try {
      await page.goto("/rally/team-login");
      await page.getByPlaceholder("XXXX-XXXX").fill(world.accessCode);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await page.waitForURL("**/team-progress", { timeout: 20_000 });

      // Navegar para /team-settings
      await page.goto("/rally/team-settings");
      await expect(page.getByRole("heading", { name: "Definições" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(`Equipa atual: ${world.teamName}`)).toBeVisible();

      // Botão "Trocar Equipa" leva ao login
      await page.getByRole("button", { name: "Trocar Equipa" }).click();
      await page.waitForURL("**/team-login", { timeout: 15_000 });
      await expect(page.getByRole("heading", { name: "Trocar Equipa" })).toBeVisible();

      // Voltar a /team-settings e fazer Logout completo
      await page.goto("/rally/team-settings");
      await page.getByRole("button", { name: "Terminar Sessão" }).click();

      // Confirmação no modal
      await expect(page.getByText("Terminar sessão?")).toBeVisible();
      await page
        .locator('[role="alertdialog"]')
        .getByRole("button", { name: "Terminar Sessão" })
        .click();

      // Deve redirecionar para a home e sessão limpa
      await page.waitForURL("**/", { timeout: 15_000 });
    } finally {
      await page.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 2.4 — Regras & FAQ (/rules)
  // -------------------------------------------------------------------
  test("2.4 — Página de regras /rules exibe secções expansíveis", async ({ browser }) => {
    const page = await newPage(browser);

    try {
      await page.goto("/rally/rules");
      await expect(page.getByRole("heading", { name: "Regras & FAQ" })).toBeVisible({
        timeout: 15_000,
      });

      // Secções padrão de arranque
      await expect(page.getByText("Como funciona")).toBeVisible();
      await expect(page.getByText("Pontuação")).toBeVisible();
      await expect(page.getByText("Check-in nos postos")).toBeVisible();

      // Clicar numa secção para expandir / fechar
      await page.getByRole("button", { name: /Como funciona/i }).click();
      await expect(
        page.getByText("Cada equipa percorre os postos do rally", { exact: false }),
      ).toBeVisible();
    } finally {
      await page.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 2.5 — Conquistas e Crachás (/achievements)
  // -------------------------------------------------------------------
  test("2.5 — Equipa autenticada consulta o quadro de conquistas em /achievements", async ({
    browser,
  }) => {
    test.skip(!world, "Requer o setup inicial");
    const page = await newPage(browser);

    try {
      await page.goto("/rally/team-login");
      await page.getByPlaceholder("XXXX-XXXX").fill(world.accessCode);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await page.waitForURL("**/team-progress", { timeout: 20_000 });

      // Navegar para /achievements
      await page.goto("/rally/achievements");
      await expect(page.getByText(/Conquistas|Crachás/i).first()).toBeVisible({ timeout: 15_000 });
    } finally {
      await page.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 2.6 — Preferências e Perfil (/preferences e /profile)
  // -------------------------------------------------------------------
  test("2.6 — Preferências de dispositivo permitem alternar tema e ver perfil", async ({
    browser,
  }) => {
    const page = await newPage(browser);

    try {
      await page.goto("/rally/preferences");
      await expect(page.getByRole("heading", { name: "Preferências" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText("Aparência")).toBeVisible();

      // Alternar tema
      const darkOption = page.getByRole("button", { name: /Escuro|Dark/i });
      if (await darkOption.isVisible().catch(() => false)) {
        await darkOption.click();
      }

      // Visitar /profile
      await page.goto("/rally/profile");
      await expect(page.getByText(/Perfil|Conta NEI|Sessão/i).first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await page.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 2.7 — Rota e Postos (/checkpoints)
  // -------------------------------------------------------------------
  test("2.7 — Lista geral e mapa de postos em /checkpoints", async ({ browser }) => {
    test.skip(!world, "Requer o setup inicial");
    const page = await newPage(browser);

    try {
      await page.goto("/rally/checkpoints");
      // Visitante anónimo ou com mapa ativado vê a lista de postos
      await expect(page.getByText(/Postos|Checkpoints/i).first()).toBeVisible({ timeout: 15_000 });
    } finally {
      await page.context().close();
    }
  });
});
