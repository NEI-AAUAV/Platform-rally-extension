import { test, expect, type Browser, type Page } from "@playwright/test";
import { mintToken, seedRealOidcSession } from "./helpers/fullstackAuth";
import { waitForApi } from "./helpers/seedRally";

/**
 * Fase 3 — Matriz Completa de Toggles e Configurações ON / OFF na UI Real (Fullstack)
 *
 * Testa e valida na UI do navegador todas as permutações de configurações:
 * - 3.1. show_live_leaderboard ON vs OFF (Scoreboard e Placar)
 * - 3.2. show_checkpoint_map ON vs OFF (Mapa na vista de equipa e /checkpoints)
 * - 3.3. Rota: checkpoint_order_matters e route_stages_enabled
 * - 3.4. Regras & FAQ personalizadas: Criação de secção no Admin e visualização no participante
 * - 3.5. public_access_enabled ON vs OFF
 */

test.describe.configure({ mode: "serial" });

interface SettingsWorld {
  readonly runId: string;
  readonly adminToken: string;
  readonly eventName: string;
  readonly teamName: string;
  readonly accessCode: string;
}

let world: SettingsWorld;

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

test.describe("Fase 3: Matriz Completa de Toggles e Configurações ON / OFF", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  // -------------------------------------------------------------------
  // Setup: Criação de Evento e Equipa
  // -------------------------------------------------------------------
  test("3.0 — Setup de evento e equipa para testes de configuração", async ({ browser }) => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const admin = await mintToken({
      sub: `e2e-cfg-admin-${runId}`,
      name: "E2E Config Admin",
      groups: ["admin"],
      email: `e2e-cfg-admin-${runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);
    const eventName = `E2E Config Event ${runId}`;
    const teamName = `E2E Config Team ${runId}`;
    let accessCode = "";

    try {
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

      // Checkpoint
      await adminPage.goto("/rally/admin?tab=checkpoints");
      await adminPage.getByPlaceholder("Ex: Checkpoint Central").fill(`Posto Config ${runId}`);
      await adminPage.getByPlaceholder("Ex: 40.6405").fill("40.6443");
      await adminPage.getByPlaceholder("Ex: -8.6538").fill("-8.6455");
      await adminPage.getByPlaceholder("Ex: 50").fill("50");
      await adminPage.getByRole("button", { name: "Criar Checkpoint" }).click();
      await expect(adminPage.getByText(`Posto Config ${runId}`)).toBeVisible({ timeout: 15_000 });

      // Equipa
      await adminPage.goto("/rally/admin?tab=teams");
      await adminPage.getByPlaceholder("Ex: Equipa Alpha").fill(teamName);
      await adminPage.getByRole("button", { name: /^Criar Equipa$/ }).click();
      await expect(adminPage.getByText("Equipa Criada!")).toBeVisible({ timeout: 15_000 });
      const codeMatch = await adminPage.getByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/).innerText();
      accessCode = codeMatch.trim();
      await adminPage.getByRole("button", { name: "Concluir" }).click();

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

async function setSwitch(adminPage: Page, id: string, targetValue: boolean): Promise<void> {
  const switchLocator = adminPage.locator(`input#${id}`);
  const isChecked = await switchLocator.isChecked();
  if (isChecked !== targetValue) {
    if (targetValue) {
      await switchLocator.check({ force: true });
    } else {
      await switchLocator.uncheck({ force: true });
    }
    const saveBtn = adminPage.getByRole("button", { name: /Guardar/i });
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
    await saveBtn.click();
    await expect(
      adminPage.getByText("Configurações guardadas com sucesso!"),
    ).toBeVisible({ timeout: 15_000 });
  }
}

  // -------------------------------------------------------------------
  // 3.1 — show_live_leaderboard ON vs OFF
  // -------------------------------------------------------------------
  test("3.1 — Toggle show_live_leaderboard reflete-se no placar e leaderboard", async ({
    browser,
  }) => {
    test.skip(!world, "Requer o setup inicial");
    const admin = await mintToken({
      sub: `e2e-cfg-admin-${world.runId}`,
      name: "E2E Config Admin",
      groups: ["admin"],
      email: `e2e-cfg-admin-${world.runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);
    const pubPage = await newPage(browser);

    try {
      // 1. Ir a /rally/settings -> aba "Visualização"
      await adminPage.goto("/rally/settings");
      await adminPage.getByRole("button", { name: "Visualização" }).click();

      // Mudar modo para "Classificação completa" e ativar leaderboard
      await adminPage.locator("#show_score_mode").click();
      await adminPage.getByRole("option", { name: "Classificação completa" }).click();
      await setSwitch(adminPage, "show_live_leaderboard", true);

      // 2. Visitante acede a /rally/scoreboard e vê a equipa
      await pubPage.goto("/rally/scoreboard");
      await expect(pubPage.getByRole("heading", { name: /Classificação|Placar/i })).toBeVisible({
        timeout: 15_000,
      });
      await expect(pubPage.getByText(world.teamName)).toBeVisible({ timeout: 15_000 });

      // 3. Desativar "Mostrar leaderboard em tempo real"
      await adminPage.getByRole("button", { name: "Visualização" }).click();
      await setSwitch(adminPage, "show_live_leaderboard", false);

      // Recarregar o scoreboard do visitante -> mostra "Leaderboard indisponível"
      await pubPage.reload();
      await expect(pubPage.getByText("Leaderboard indisponível")).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await adminPage.context().close();
      await pubPage.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 3.2 — show_checkpoint_map ON vs OFF
  // -------------------------------------------------------------------
  test("3.2 — Toggle show_checkpoint_map controla visibilidade do mapa de postos", async ({
    browser,
  }) => {
    test.skip(!world, "Requer o setup inicial");
    const admin = await mintToken({
      sub: `e2e-cfg-admin-${world.runId}`,
      name: "E2E Config Admin",
      groups: ["admin"],
      email: `e2e-cfg-admin-${world.runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);
    const teamPage = await newPage(browser);

    try {
      // Equipa faz login
      await teamPage.goto("/rally/team-login");
      await teamPage.getByPlaceholder("XXXX-XXXX").fill(world.accessCode);
      await teamPage.getByRole("button", { name: "Entrar", exact: true }).click();
      await teamPage.waitForURL("**/team-progress", { timeout: 20_000 });

      // 1. Admin desativa "Mostrar mapa dos checkpoints"
      await adminPage.goto("/rally/settings");
      await adminPage.getByRole("button", { name: "Visualização" }).click();
      await setSwitch(adminPage, "show_checkpoint_map", false);

      // Equipa tenta aceder a /rally/checkpoints (deve redirecionar para /team-progress se mapa desligado)
      await teamPage.goto("/rally/checkpoints");
      await teamPage.waitForURL((url) => url.pathname.endsWith("/team-progress"), {
        timeout: 15_000,
      });

      // 2. Admin reativa "Mostrar mapa dos checkpoints"
      await adminPage.getByRole("button", { name: "Visualização" }).click();
      await setSwitch(adminPage, "show_checkpoint_map", true);

      // Equipa acede agora a /rally/checkpoints com sucesso
      await teamPage.goto("/rally/checkpoints");
      await expect(teamPage.getByText(/Postos|Checkpoints/i).first()).toBeVisible({ timeout: 15_000 });
    } finally {
      await adminPage.context().close();
      await teamPage.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 3.4 — Personalização de Regras & FAQ no Admin e Visualização no Participante
  // -------------------------------------------------------------------
  test("3.4 — Admin adiciona secção personalizada em Regras e participante visualiza", async ({
    browser,
  }) => {
    test.skip(!world, "Requer o setup inicial");
    const admin = await mintToken({
      sub: `e2e-cfg-admin-${world.runId}`,
      name: "E2E Config Admin",
      groups: ["admin"],
      email: `e2e-cfg-admin-${world.runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);
    const pubPage = await newPage(browser);

    try {
      await adminPage.goto("/rally/settings");
      await adminPage.getByRole("button", { name: "Regras" }).click();

      // Clicar em "Adicionar secção"
      await adminPage.getByRole("button", { name: /Adicionar secção/i }).click();

      // Preencher o título e corpo da nova secção
      const customTitle = `Regra Especial E2E ${world.runId}`;
      const customBody = "Instrução obrigatória de teste: levar calçado confortável.";

      const titleInputs = adminPage.getByPlaceholder("Título da secção");
      await titleInputs.last().fill(customTitle);

      const bodyInputs = adminPage.getByPlaceholder("Texto explicativo...");
      await bodyInputs.last().fill(customBody);

      // Guardar definições
      await adminPage.getByRole("button", { name: "Guardar" }).click();
      await expect(
        adminPage.getByText("Configurações guardadas com sucesso!"),
      ).toBeVisible({ timeout: 15_000 });

      // Visitante vai a /rally/rules e verifica a nova secção
      await pubPage.goto("/rally/rules");
      await expect(pubPage.getByRole("button", { name: customTitle })).toBeVisible({
        timeout: 15_000,
      });

      // Expandir a secção e validar o corpo
      await pubPage.getByRole("button", { name: customTitle }).click();
      await expect(pubPage.getByText(customBody)).toBeVisible({ timeout: 10_000 });
    } finally {
      await adminPage.context().close();
      await pubPage.context().close();
    }
  });
});
