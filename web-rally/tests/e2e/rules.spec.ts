import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { MOCK_RALLY_SETTINGS } from "../mocks/data";
import type { RallySettingsResponse } from "@/client";

async function mockSettings(page: Page, overrides: Partial<RallySettingsResponse> = {}) {
  const settings = { ...MOCK_RALLY_SETTINGS, ...overrides };
  await page.route("**/api/rally/v1/rally/settings/public**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(settings) }),
  );
}

test.describe("Rules", () => {
  test("renders heading and the starter sections when no admin sections exist", async ({
    page,
  }) => {
    await mockSettings(page);

    await page.goto("/rally/rules");

    await expect(page.getByText("Regras & FAQ")).toBeVisible();
    await expect(page.getByRole("button", { name: "Como funciona" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pontuação" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check-in nos postos" })).toBeVisible();
  });

  test("expands and collapses an accordion section on click and shows its body", async ({
    page,
  }) => {
    await mockSettings(page);

    await page.goto("/rally/rules");

    const scoreButton = page.getByRole("button", { name: "Pontuação" });
    await expect(scoreButton).toHaveAttribute("aria-expanded", "false");
    await scoreButton.click();
    await expect(scoreButton).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText(/A pontuação de cada equipa resulta das atividades/)).toBeVisible();
    await scoreButton.click();
    await expect(scoreButton).toHaveAttribute("aria-expanded", "false");
  });

  test("renders admin-authored sections instead of the starter list when present", async ({
    page,
  }) => {
    await mockSettings(page, {
      rules_sections: [
        { id: "a", title: "Secção Personalizada", icon: "Trophy", body: "Texto totalmente livre." },
      ],
    });

    await page.goto("/rally/rules");

    await expect(page.getByRole("button", { name: "Secção Personalizada" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Como funciona" })).toHaveCount(0);

    await page.getByRole("button", { name: "Secção Personalizada" }).click();
    await expect(page.getByText("Texto totalmente livre.")).toBeVisible();
  });

  test("embeds the regulation PDF when rules_pdf_url is set", async ({ page }) => {
    await mockSettings(page, { rules_pdf_url: "https://example.com/regulamento.pdf" });

    await page.goto("/rally/rules");

    await expect(page.getByText("Regulamento oficial")).toBeVisible();
    const link = page.getByRole("link", { name: "Abrir numa nova aba" });
    await expect(link).toHaveAttribute("href", "https://example.com/regulamento.pdf");
  });

  test("renders correctly on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockSettings(page);

    await page.goto("/rally/rules");

    await expect(page.getByText("Regras & FAQ")).toBeVisible();
  });
});
