import { test, expect, type Browser, type Page } from "@playwright/test";
import { mintToken, seedRealOidcSession } from "./helpers/fullstackAuth";
import { waitForApi } from "./helpers/seedRally";

/**
 * Fase 1 — Casos de Falha, Validações e Testes Negativos de UI (Fullstack)
 *
 * Garante que todos os caminhos de erro, tentativas de fraude geográfica,
 * submissões inválidas de formulários e acessos não autorizados são bloqueados
 * e reportados com clareza na interface real, interagindo com o backend real.
 */

test.describe.configure({ mode: "serial" });

const BASE_LAT = 40.6443;
const BASE_LNG = -8.6455;
const RADIUS_M = 60;

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

test.describe("Fase 1: Casos de Falha, Validações e Testes Negativos de UI", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  // -------------------------------------------------------------------
  // 1.1. Login com Código Inválido e Validação de Form
  // -------------------------------------------------------------------
  test("1.1 — Login de equipa rejeita código inexistente e valida campo", async ({ page }) => {
    await page.goto("/rally/team-login");
    await expect(
      page.getByRole("heading", { name: /Login de Equipa|Trocar Equipa/i }),
    ).toBeVisible({
      timeout: 15_000,
    });

    const codeInput = page.getByPlaceholder("XXXX-XXXX");
    const submitBtn = page.getByRole("button", { name: "Entrar", exact: true });

    // Campo vazio -> botão deve estar desativado
    await expect(submitBtn).toBeDisabled();

    // Código inexistente
    await codeInput.fill("ERRR-9999");
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(page.getByText(/inválido|invalid|not found/i).first()).toBeVisible({
      timeout: 10_000,
    });
    expect(page.url()).toContain("/team-login");
  });

  // -------------------------------------------------------------------
  // 1.2. Rejeição de Check-in GPS Fora do Raio Geográfico
  // -------------------------------------------------------------------
  test("1.2 — Check-in GPS fora do raio geográfico é rejeitado e só avança ao aproximar", async ({
    browser,
  }) => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const admin = await mintToken({
      sub: `e2e-neg-admin-${runId}`,
      name: "E2E Neg Admin",
      groups: ["admin"],
      email: `e2e-neg-admin-${runId}@ua.pt`,
    });

    // 1. Setup do evento e posto via Admin UI
    const adminPage = await newAuthedPage(browser, admin);
    const eventName = `E2E Neg Event ${runId}`;
    const cpName = `E2E Neg Posto ${runId}`;
    const teamName = `E2E Neg Team ${runId}`;
    let accessCode = "";

    try {
      await adminPage.goto("/rally/admin?tab=events");
      await adminPage.getByRole("button", { name: "Novo" }).click();
      await adminPage.locator("#ev-name").fill(eventName);
      await adminPage.locator("#ev-type").click();
      await adminPage.getByRole("option", { name: "Peddy-paper" }).click();
      await adminPage.getByRole("button", { name: /^Criar$/ }).click();
      await expect(adminPage.getByText(eventName)).toBeVisible({ timeout: 15_000 });

      // Tornar atual se necessário
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

      // Criar Checkpoint 1 com coordenadas exatas
      await adminPage.goto("/rally/admin?tab=checkpoints");
      await adminPage.getByPlaceholder("Ex: Checkpoint Central").fill(cpName);
      await adminPage.getByPlaceholder("Ex: 40.6405").fill(String(BASE_LAT));
      await adminPage.getByPlaceholder("Ex: -8.6538").fill(String(BASE_LNG));
      await adminPage.getByPlaceholder("Ex: 50").fill(String(RADIUS_M));
      await adminPage
        .getByPlaceholder("Ex: Onde o rio encontra a ponte de ferro...")
        .fill("Enigma de teste negativo 1");
      await adminPage.getByRole("button", { name: "Criar Checkpoint" }).click();
      await expect(adminPage.getByText(cpName)).toBeVisible({ timeout: 15_000 });

      // Criar Checkpoint 2
      const cp2Name = `E2E Neg Posto Dois ${runId}`;
      await adminPage.getByPlaceholder("Ex: Checkpoint Central").fill(cp2Name);
      await adminPage.getByPlaceholder("Ex: 40.6405").fill(String(BASE_LAT + 0.01));
      await adminPage.getByPlaceholder("Ex: -8.6538").fill(String(BASE_LNG));
      await adminPage.getByPlaceholder("Ex: 50").fill(String(RADIUS_M));
      await adminPage
        .getByPlaceholder("Ex: Onde o rio encontra a ponte de ferro...")
        .fill("Enigma de teste negativo 2");
      await adminPage.getByRole("button", { name: "Criar Checkpoint" }).click();
      await expect(adminPage.getByText(cp2Name)).toBeVisible({ timeout: 15_000 });

      // Criar Equipa e capturar o código de acesso
      await adminPage.goto("/rally/admin?tab=teams");
      await adminPage.getByPlaceholder("Ex: Equipa Alpha").fill(teamName);
      await adminPage.getByRole("button", { name: /^Criar Equipa$/ }).click();
      await expect(adminPage.getByText("Equipa Criada!")).toBeVisible({ timeout: 15_000 });

      const codeMatch = await adminPage.getByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/).innerText();
      accessCode = codeMatch.trim();
      expect(accessCode).toBeTruthy();
      await adminPage.getByRole("button", { name: "Concluir" }).click();
    } finally {
      await adminPage.context().close();
    }

    // 2. Equipa tenta check-in a 1.5 km de distância
    const teamContext = await browser.newContext();
    const teamPage = await teamContext.newPage();

    try {
      await teamPage.goto("/rally/team-login");
      await teamPage.getByPlaceholder("XXXX-XXXX").fill(accessCode);
      await teamPage.getByRole("button", { name: "Entrar", exact: true }).click();
      await teamPage.waitForURL("**/team-progress", { timeout: 30_000 });

      // Geolocation a 1.5 km de distância
      await teamContext.grantPermissions(["geolocation"]);
      await teamContext.setGeolocation({
        latitude: BASE_LAT + 0.015,
        longitude: BASE_LNG,
      });

      await expect(teamPage.getByRole("button", { name: "Check-in GPS" })).toBeVisible({
        timeout: 15_000,
      });
      await teamPage.getByRole("button", { name: "Check-in GPS" }).click();

      // Verifica mensagem de rejeição por distância
      await expect(
        teamPage.getByText(/Ainda não estás perto o suficiente|Too far from checkpoint/i),
      ).toBeVisible({ timeout: 15_000 });

      // O botão passa a "Tentar novamente" e existe botão para "Limpar erro"
      await expect(teamPage.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
      const clearErrorBtn = teamPage.getByRole("button", { name: "Limpar erro" });
      await expect(clearErrorBtn).toBeVisible();
      await clearErrorBtn.click();
      await expect(clearErrorBtn).toBeHidden();

      // Posto continua incompleto / em enigma
      await expect(teamPage.getByText("Enigma", { exact: true }).first()).toBeVisible();
      await expect(teamPage.getByText(cpName)).toHaveCount(0);

      // 3. Agora a equipa aproxima-se das coordenadas reais e tenta novamente
      await teamContext.setGeolocation({
        latitude: BASE_LAT,
        longitude: BASE_LNG,
      });

      await teamPage.reload();
      await expect(async () => {
        const registered = teamPage.getByText("Enigma de teste negativo 2").first();
        if (await registered.isVisible().catch(() => false)) return;
        const btn = teamPage.getByRole("button", { name: /^(Check-in GPS|Tentar novamente)$/ });
        await btn.click({ timeout: 5000 });
        await expect(registered).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 30_000 });

      // Posto 1 foi revelado pelo nome e Posto 2 é o novo enigma
      await expect(teamPage.getByText(cpName).first()).toBeVisible({ timeout: 15_000 });
      await expect(teamPage.getByText("Enigma de teste negativo 2").first()).toBeVisible({ timeout: 15_000 });
    } finally {
      await teamContext.close();
    }
  });

  // -------------------------------------------------------------------
  // 1.3. Validação de Formulários no Admin
  // -------------------------------------------------------------------
  test("1.3 — Formulários de Admin impedem submissões vazias ou inválidas", async ({ browser }) => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const admin = await mintToken({
      sub: `e2e-form-admin-${runId}`,
      name: "E2E Form Admin",
      groups: ["admin"],
      email: `e2e-form-admin-${runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);

    try {
      // 1. Formulário de Postos: tentar criar sem nome
      await adminPage.goto("/rally/admin?tab=checkpoints");
      await expect(adminPage.getByRole("button", { name: "Criar Checkpoint" })).toBeVisible({
        timeout: 15_000,
      });

      // Tentar submeter form vazio
      await adminPage.getByRole("button", { name: "Criar Checkpoint" }).click();
      await expect(
        adminPage.getByText(/Nome do checkpoint é obrigatório|Nome é obrigatório/i).first(),
      ).toBeVisible({ timeout: 10_000 });

      // 2. Formulário de Atividades: tentar criar sem nome
      await adminPage.goto("/rally/admin?tab=activities");
      await adminPage.getByRole("button", { name: "Nova Atividade" }).click();
      await adminPage.getByRole("button", { name: /^Criar$/ }).click();
      await expect(
        adminPage.getByText(/Nome da atividade é obrigatório/i).first(),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await adminPage.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 1.4. Barreiras de Segurança e Redirecionamentos ABAC no Navegador
  // -------------------------------------------------------------------
  test("1.4 — Barreiras ABAC no frontend redirecionam equipas, staff e anónimos fora de rotas não autorizadas", async ({
    browser,
  }) => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const admin = await mintToken({
      sub: `e2e-abac-adm-${runId}`,
      name: "E2E ABAC Admin",
      groups: ["admin"],
      email: `e2e-abac-adm-${runId}@ua.pt`,
    });
    const staff = await mintToken({
      sub: `e2e-abac-stf-${runId}`,
      name: "E2E ABAC Staff",
      groups: ["rally-staff"],
      email: `e2e-abac-stf-${runId}@ua.pt`,
    });

    // 1. Setup de evento e equipa
    const adminPage = await newAuthedPage(browser, admin);
    let accessCode = "";
    try {
      await adminPage.goto("/rally/admin?tab=events");
      await adminPage.getByRole("button", { name: "Novo" }).click();
      await adminPage.locator("#ev-name").fill(`E2E ABAC Event ${runId}`);
      await adminPage.getByRole("button", { name: /^Criar$/ }).click();

      await adminPage.goto("/rally/admin?tab=teams");
      await adminPage.getByPlaceholder("Ex: Equipa Alpha").fill(`E2E ABAC Team ${runId}`);
      await adminPage.getByRole("button", { name: /^Criar Equipa$/ }).click();
      const codeMatch = await adminPage.getByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/).innerText();
      accessCode = codeMatch.trim();
      await adminPage.getByRole("button", { name: "Concluir" }).click();
    } finally {
      await adminPage.context().close();
    }

    // 2. Equipa tenta aceder a rotas de gestão
    const teamPage = await newPage(browser);
    try {
      await teamPage.goto("/rally/team-login");
      await teamPage.getByPlaceholder("XXXX-XXXX").fill(accessCode);
      await teamPage.getByRole("button", { name: "Entrar", exact: true }).click();
      await teamPage.waitForURL("**/team-progress", { timeout: 20_000 });

      // Equipa tenta navegar para /rally/admin
      await teamPage.goto("/rally/admin");
      await teamPage.waitForURL((url) => !url.pathname.endsWith("/admin"), { timeout: 15_000 });
      expect(teamPage.url()).not.toContain("/admin");

      // Equipa tenta navegar para /rally/settings
      await teamPage.goto("/rally/settings");
      await teamPage.waitForURL((url) => !url.pathname.endsWith("/settings"), { timeout: 15_000 });
      expect(teamPage.url()).not.toContain("/settings");

      // Equipa tenta navegar para /rally/guide
      await teamPage.goto("/rally/guide");
      await teamPage.waitForURL((url) => !url.pathname.endsWith("/guide"), { timeout: 15_000 });
      expect(teamPage.url()).not.toContain("/guide");
    } finally {
      await teamPage.context().close();
    }

    // 3. Staff tenta aceder a /rally/admin
    const staffPage = await newAuthedPage(browser, staff);
    try {
      await staffPage.goto("/rally/admin");
      await staffPage.waitForURL((url) => !url.pathname.endsWith("/admin"), { timeout: 15_000 });
      expect(staffPage.url()).not.toContain("/admin");
    } finally {
      await staffPage.context().close();
    }

    // 4. Utilizador anónimo tenta aceder a /rally/admin e /rally/staff-evaluation
    const anonPage = await newPage(browser);
    try {
      await anonPage.goto("/rally/admin");
      await anonPage.waitForURL((url) => !url.pathname.endsWith("/admin"), { timeout: 15_000 });
      expect(anonPage.url()).not.toContain("/admin");

      await anonPage.goto("/rally/staff-evaluation");
      await expect(
        anonPage.getByText(/Sem posto atribuído|Login Staff/i).first(),
      ).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await anonPage.context().close();
    }
  });
});
