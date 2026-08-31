import { expect, type Page, test } from "@playwright/test";

/**
 * The report only exists to become a PDF. A chart that renders on screen and
 * collapses under `@media print` produces a document that looks finished and
 * is missing its evidence, so print rendering is asserted directly rather
 * than assumed from the on-screen result.
 */

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Contraseña").fill(process.env.APP_PASSWORD ?? "");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

async function chartBoxes(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".qa-report svg.recharts-surface")].map(
      (svg) => {
        const box = svg.getBoundingClientRect();
        return { width: Math.round(box.width), height: Math.round(box.height) };
      },
    ),
  );
}

/**
 * The report has nothing to draw when the channel is empty, which is a
 * legitimate state (right after a maintenance clear). Skipping explicitly is
 * honest; passing would claim a verification that never ran.
 */
async function skipIfChannelEmpty(page: Page) {
  const empty = await page
    .getByText("No hay mediciones en este rango.")
    .first()
    .isVisible()
    .catch(() => false);

  test.skip(empty, "el canal no tiene mediciones en este rango");
}

test.describe("informe imprimible", () => {
  test("renders every chart both on screen and in print", async ({ page }) => {
    await login(page);
    await page.goto("/reportes?rango=all");
    await page.waitForLoadState("networkidle");
    await skipIfChannelEmpty(page);
    await page.waitForSelector(".qa-report svg.recharts-surface");

    const onScreen = await chartBoxes(page);
    expect(onScreen.length).toBeGreaterThanOrEqual(4);
    for (const box of onScreen) {
      expect(box.height).toBeGreaterThan(50);
      expect(box.width).toBeGreaterThan(50);
    }

    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(600);

    const printed = await chartBoxes(page);

    expect(printed.length, "las gráficas desaparecen al imprimir").toBe(
      onScreen.length,
    );
    for (const [index, box] of printed.entries()) {
      expect(
        box.height,
        `gráfica ${index} colapsa al imprimir`,
      ).toBeGreaterThan(50);
      expect(box.width, `gráfica ${index} colapsa al imprimir`).toBeGreaterThan(
        50,
      );
    }
  });

  test("hides the navigation chrome when printing", async ({ page }) => {
    await login(page);
    await page.goto("/reportes?rango=all");
    await page.waitForLoadState("networkidle");

    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(300);

    await expect(page.locator('[data-slot="sidebar-container"]')).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Imprimir o guardar como PDF" }),
    ).toBeHidden();
  });

  test("produces a PDF with more than one page of content", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/reportes?rango=all");
    await page.waitForLoadState("networkidle");
    await skipIfChannelEmpty(page);
    await page.waitForSelector(".qa-report svg.recharts-surface");

    const pdf = await page.pdf({ format: "A4", printBackground: true });

    // A blank or collapsed report compresses to almost nothing.
    expect(pdf.byteLength).toBeGreaterThan(30_000);
  });
});
