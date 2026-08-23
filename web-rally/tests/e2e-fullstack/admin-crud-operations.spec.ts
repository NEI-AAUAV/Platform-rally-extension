import { test, expect, type Browser, type Page } from "@playwright/test";
import { mintToken, seedRealOidcSession } from "./helpers/fullstackAuth";
import { waitForApi } from "./helpers/seedRally";

/**
 * Fase 4 — Operações CRUD Completas de Admin (Fullstack UI)
 *
 * Cobre ciclo de vida completo de edição, atualização e eliminação:
 * - 4.1. Checkpoints: Criação, Edição, e Eliminação com confirmação.
 * - 4.2. Teams: Criação, Edição de nome/offset, e Eliminação.
 * - 4.3. Activities: Criação, Edição e Eliminação.
 */

test.describe.configure({ mode: "serial" });

async function newAuthedPage(
  browser: Browser,
  user: Parameters<typeof seedRealOidcSession>[1],
): Promise<Page> {
  const context = await browser.newContext();
  await seedRealOidcSession(context, user);
  return context.newPage();
}

test.describe("Fase 4: Operações CRUD Completas de Admin", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  // -------------------------------------------------------------------
  // 4.1 — Checkpoints CRUD
  // -------------------------------------------------------------------
  test("4.1 — Checkpoints CRUD: Criar, Editar e Eliminar", async ({ browser }) => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const admin = await mintToken({
      sub: `e2e-crud-adm-${runId}`,
      name: "E2E CRUD Admin",
      groups: ["admin"],
      email: `e2e-crud-adm-${runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);

    try {
      // 1. Criar Evento
      await adminPage.goto("/rally/admin?tab=events");
      await adminPage.getByRole("button", { name: "Novo" }).click();
      await adminPage.locator("#ev-name").fill(`E2E CRUD Event ${runId}`);
      await adminPage.getByRole("button", { name: /^Criar$/ }).click();
      await expect(adminPage.getByText(`E2E CRUD Event ${runId}`)).toBeVisible({ timeout: 15_000 });

      // 2. Criar Posto 1 e Posto 2
      await adminPage.goto("/rally/admin?tab=checkpoints");
      const cp1Name = `Posto Alpha ${runId}`;
      const cp2Name = `Posto Beta ${runId}`;

      await adminPage.getByPlaceholder("Ex: Checkpoint Central").fill(cp1Name);
      await adminPage.getByPlaceholder("Ex: 40.6405").fill("40.6443");
      await adminPage.getByPlaceholder("Ex: -8.6538").fill("-8.6455");
      await adminPage.getByPlaceholder("Ex: 50").fill("40");
      await adminPage.getByRole("button", { name: "Criar Checkpoint" }).click();
      await expect(adminPage.getByText(cp1Name).first()).toBeVisible({ timeout: 15_000 });

      await adminPage.getByPlaceholder("Ex: Checkpoint Central").fill(cp2Name);
      await adminPage.getByPlaceholder("Ex: 40.6405").fill("40.6450");
      await adminPage.getByPlaceholder("Ex: -8.6538").fill("-8.6460");
      await adminPage.getByPlaceholder("Ex: 50").fill("50");
      await adminPage.getByRole("button", { name: "Criar Checkpoint" }).click();
      await expect(adminPage.getByText(cp2Name).first()).toBeVisible({ timeout: 15_000 });

      // 3. Editar Posto 1
      const cp1Item = adminPage.locator("li", { hasText: cp1Name });
      // Clicar no botão de edição (segundo botão BloodyButton com ícone Edit)
      await cp1Item.locator("button:has(svg.lucide-square-pen, svg.lucide-edit, svg.lucide-pencil)").first().click();

      // Verificar formulário em modo edição
      await expect(adminPage.getByRole("heading", { name: "Editar Checkpoint" })).toBeVisible();
      const cp1NewName = `Posto Alpha Editado ${runId}`;
      await adminPage.getByPlaceholder("Ex: Checkpoint Central").fill(cp1NewName);
      await adminPage.getByPlaceholder("Ex: 50").fill("75");
      await adminPage.getByRole("button", { name: "Atualizar Checkpoint" }).click();

      // Verificar que nome e novo raio estão visíveis na lista
      await expect(adminPage.getByText(cp1NewName).first()).toBeVisible({ timeout: 15_000 });
      await expect(adminPage.locator("li", { hasText: cp1NewName }).getByText(/raio 75m/i)).toBeVisible({ timeout: 15_000 });

      // 4. Eliminar Posto 2
      const cp2Item = adminPage.locator("li", { hasText: cp2Name });
      await cp2Item.locator("button:has(svg.lucide-trash-2, svg.lucide-trash)").first().click();

      // Confirmar que Posto 2 foi removido
      await expect(adminPage.getByText(cp2Name)).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await adminPage.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 4.2 — Teams CRUD
  // -------------------------------------------------------------------
  test("4.2 — Teams CRUD: Criar, Editar nome/offset e Eliminar", async ({ browser }) => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const admin = await mintToken({
      sub: `e2e-crud-teams-${runId}`,
      name: "E2E CRUD Teams",
      groups: ["admin"],
      email: `e2e-crud-teams-${runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);

    try {
      // Setup de Evento
      await adminPage.goto("/rally/admin?tab=events");
      await adminPage.getByRole("button", { name: "Novo" }).click();
      await adminPage.locator("#ev-name").fill(`E2E Teams Event ${runId}`);
      await adminPage.getByRole("button", { name: /^Criar$/ }).click();

      // 1. Criar Equipa Alpha e Equipa Beta
      await adminPage.goto("/rally/admin?tab=teams");
      const team1Name = `Equipa Alpha ${runId}`;
      const team2Name = `Equipa Beta ${runId}`;

      await adminPage.getByPlaceholder("Ex: Equipa Alpha").fill(team1Name);
      await adminPage.getByRole("button", { name: /^Criar Equipa$/ }).click();
      await expect(adminPage.getByText("Equipa Criada!")).toBeVisible({ timeout: 15_000 });
      await adminPage.getByRole("button", { name: "Concluir" }).click();

      await adminPage.getByPlaceholder("Ex: Equipa Alpha").fill(team2Name);
      await adminPage.getByRole("button", { name: /^Criar Equipa$/ }).click();
      await expect(adminPage.getByText("Equipa Criada!")).toBeVisible({ timeout: 15_000 });
      await adminPage.getByRole("button", { name: "Concluir" }).click();

      // 2. Editar Equipa Alpha
      const team1Item = adminPage.locator("li", { hasText: team1Name });
      await team1Item.locator("button:has(svg.lucide-square-pen, svg.lucide-edit, svg.lucide-pencil)").first().click();

      await expect(adminPage.getByRole("heading", { name: "Editar Equipa" })).toBeVisible();
      const team1NewName = `Equipa Alpha Renomeada ${runId}`;
      await adminPage.getByPlaceholder("Ex: Equipa Alpha").fill(team1NewName);
      await adminPage.getByPlaceholder("Ex: 20").fill("15");
      await adminPage.getByRole("button", { name: "Atualizar Equipa" }).click();

      // Verificar persistência na lista
      await expect(adminPage.getByText(team1NewName)).toBeVisible({ timeout: 15_000 });

      // 3. Eliminar Equipa Beta (lida com o confirm modal do browser)
      adminPage.on("dialog", (dialog) => dialog.accept());
      const team2Item = adminPage.locator("li", { hasText: team2Name });
      await team2Item.locator("button:has(svg.lucide-trash-2, svg.lucide-trash)").first().click();

      // Verificar que Equipa Beta foi removida da lista
      await expect(adminPage.getByText(team2Name)).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await adminPage.context().close();
    }
  });

  // -------------------------------------------------------------------
  // 4.3 — Activities CRUD
  // -------------------------------------------------------------------
  test("4.3 — Activities CRUD: Criar, Editar e Eliminar", async ({ browser }) => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const admin = await mintToken({
      sub: `e2e-crud-acts-${runId}`,
      name: "E2E CRUD Acts",
      groups: ["admin"],
      email: `e2e-crud-acts-${runId}@ua.pt`,
    });

    const adminPage = await newAuthedPage(browser, admin);

    try {
      // 1. Setup de Evento e Checkpoint
      await adminPage.goto("/rally/admin?tab=events");
      await adminPage.getByRole("button", { name: "Novo" }).click();
      await adminPage.locator("#ev-name").fill(`E2E Acts Event ${runId}`);
      await adminPage.getByRole("button", { name: /^Criar$/ }).click();

      await adminPage.goto("/rally/admin?tab=checkpoints");
      const cpName = `Posto Atividade ${runId}`;
      await adminPage.getByPlaceholder("Ex: Checkpoint Central").fill(cpName);
      await adminPage.getByPlaceholder("Ex: 40.6405").fill("40.6443");
      await adminPage.getByPlaceholder("Ex: -8.6538").fill("-8.6455");
      await adminPage.getByPlaceholder("Ex: 50").fill("50");
      await adminPage.getByRole("button", { name: "Criar Checkpoint" }).click();
      await expect(adminPage.getByText(cpName).first()).toBeVisible({ timeout: 15_000 });

      // 2. Criar Atividade
      await adminPage.goto("/rally/admin?tab=activities");
      await adminPage.getByRole("button", { name: "Nova Atividade" }).click();

      const act1Name = `Atividade Quiz ${runId}`;
      await adminPage.getByPlaceholder("Ex: Cabo de Guerra").fill(act1Name);
      await adminPage.getByRole("button", { name: /^Criar$/ }).click();
      await expect(adminPage.getByText(act1Name)).toBeVisible({ timeout: 15_000 });

      // 3. Editar Atividade
      const act1Item = adminPage.locator(".rounded-lg.border", { hasText: act1Name });
      await act1Item.locator("button:has(svg.lucide-square-pen, svg.lucide-edit, svg.lucide-pencil)").first().click();

      const act1NewName = `Atividade Quiz Editada ${runId}`;
      await adminPage.getByPlaceholder("Ex: Cabo de Guerra").fill(act1NewName);
      await adminPage.getByRole("button", { name: /^Atualizar$/ }).click();
      await expect(adminPage.getByText(act1NewName)).toBeVisible({ timeout: 15_000 });

      // 4. Eliminar Atividade
      adminPage.on("dialog", (dialog) => dialog.accept());
      const actUpdatedItem = adminPage.locator(".rounded-lg.border", { hasText: act1NewName });
      await actUpdatedItem.locator("button:has(svg.lucide-trash-2, svg.lucide-trash)").first().click();

      // Verificar que a atividade foi removida
      await expect(adminPage.getByText(act1NewName)).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await adminPage.context().close();
    }
  });
});
