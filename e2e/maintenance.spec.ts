import { expect, type Page, test } from "@playwright/test";

/**
 * Maintenance guards.
 *
 * Clearing cannot be undone and ThingSpeak cannot delete selectively, so the
 * cost of an accidental click is the whole channel. The typed phrase and the
 * writers checkbox were removed as friction; what remains is the backup — the
 * only gate that makes a mistake recoverable — plus a dialog that states the
 * damage. Both are asserted here, and the server enforces the backup
 * independently of this UI.
 */

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Contraseña").fill(process.env.APP_PASSWORD ?? "");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

const clearButton = (page: Page) =>
  page.getByRole("button", { name: "Vaciar el canal", exact: true });

test.describe("mantenimiento", () => {
  test("the clear button is disabled until a backup exists", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/mantenimiento");
    await page.waitForLoadState("networkidle");

    await expect(clearButton(page)).toBeDisabled();
    await expect(page.getByText("Falta el respaldo")).toBeVisible();
  });

  test("nothing is destroyed without passing through the dialog", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/mantenimiento");
    await page.waitForLoadState("networkidle");

    // No DELETE may leave the page before the operator confirms.
    let deleteAttempted = false;
    page.on("request", (request) => {
      if (
        request.method() === "DELETE" &&
        request.url().includes("/api/thingspeak/channel")
      ) {
        deleteAttempted = true;
      }
    });

    await page.waitForTimeout(500);
    expect(deleteAttempted).toBe(false);
  });

  test("warns loudly before anything is touched", async ({ page }) => {
    await login(page);
    await page.goto("/mantenimiento");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText("Detén los escritores antes de empezar"),
    ).toBeVisible();
    await expect(
      page.getByText(/ThingSpeak no permite deshacerlo/),
    ).toBeVisible();
  });

  test("no longer asks the operator to type a phrase", async ({ page }) => {
    await login(page);
    await page.goto("/mantenimiento");
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel(/Escribe/)).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
  });
});
