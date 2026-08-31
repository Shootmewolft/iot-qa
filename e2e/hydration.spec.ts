import { expect, type Page, test } from "@playwright/test";

/**
 * Hydration regression suite.
 *
 * Two hydration mismatches shipped in this project before a browser ever ran
 * against it: a tooltip label derived from `resolvedTheme`, and a form default
 * derived from `Date.now()`. Neither is visible to a server-side check, and
 * both silently discard the server-rendered tree. This suite fails the build
 * on any recurrence.
 */

const PROTECTED_ROUTES = [
  "/dashboard",
  "/datasets",
  "/datasets/generar",
  "/datasets/importar",
  "/trabajos",
  "/configuracion",
];

function collectHydrationErrors(page: Page): string[] {
  const errors: string[] = [];

  const record = (text: string) => {
    if (/hydrat|didn't match|did not match/i.test(text)) errors.push(text);
  };

  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      record(message.text());
    }
  });
  page.on("pageerror", (error) => record(error.message));

  return errors;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Contraseña").fill(process.env.APP_PASSWORD ?? "");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("hydration", () => {
  test("the login screen hydrates cleanly", async ({ page }) => {
    const errors = collectHydrationErrors(page);

    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    await page.waitForTimeout(500);

    expect(errors).toEqual([]);
  });

  test("every protected screen hydrates cleanly", async ({ page }) => {
    const errors = collectHydrationErrors(page);

    await login(page);

    for (const route of PROTECTED_ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(300);
    }

    expect(errors, `rutas: ${PROTECTED_ROUTES.join(", ")}`).toEqual([]);
  });

  test("the theme toggle does not break hydration after a reload", async ({
    page,
  }) => {
    await login(page);

    // Switching the theme writes to localStorage; the reload is what used to
    // make the server and the client disagree about the toggle's label.
    await page.getByRole("button", { name: "Cambiar tema" }).click();
    await page.waitForTimeout(200);

    const errors = collectHydrationErrors(page);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    expect(errors).toEqual([]);
  });
});
