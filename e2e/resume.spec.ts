import { expect, type Page, test } from "@playwright/test";

/**
 * Follow-up to a failure reported from real use: a job left mid-flight and
 * resumed re-sent every batch from zero.
 *
 * The logic itself is covered by unit tests in `src/db/upload-jobs.test.ts`,
 * which assert that a "queued" batch counts as sent and that the queued total
 * is derived rather than accumulated. What those cannot check is whether the
 * screen tells the operator the truth about what leaving the page does — and
 * the wrong wording is what made the failure surprising rather than expected.
 */

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Contraseña").fill(process.env.APP_PASSWORD ?? "");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("trabajos: expectativas del operador", () => {
  test("says that leaving the screen pauses the upload, not just closing the tab", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/trabajos");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/salir de esta\s+pantalla/)).toBeVisible();
  });

  test("promises that resuming does not repeat a batch", async ({ page }) => {
    await login(page);
    await page.goto("/trabajos");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/sin repetir ninguno/)).toBeVisible();
  });

  test("distinguishes queued from confirmed", async ({ page }) => {
    await login(page);
    await page.goto("/trabajos");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText("Enviado no es lo mismo que guardado"),
    ).toBeVisible();
  });
});
