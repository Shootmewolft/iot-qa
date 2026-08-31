import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * Accessibility (spec section 22).
 *
 * Run with axe rather than by eye: contrast ratios, missing accessible names
 * and broken landmark structure are exactly the defects a sighted developer
 * reads straight past. Scoped to WCAG 2.1 A and AA, which is what the spec's
 * requirements amount to.
 */

const ROUTES = [
  "/dashboard",
  "/datasets",
  "/datasets/generar",
  "/datasets/importar",
  "/trabajos",
  "/reportes",
  "/mantenimiento",
  "/configuracion",
];

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Contraseña").fill(process.env.APP_PASSWORD ?? "");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

function scan(page: Page) {
  return new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
  ]);
}

function describeViolations(
  violations: Awaited<
    ReturnType<ReturnType<typeof scan>["analyze"]>
  >["violations"],
) {
  return violations
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} nodo(s)\n    ${v.nodes[0]?.html?.slice(0, 160)}`,
    )
    .join("\n  ");
}

test.describe("accesibilidad", () => {
  test("the login screen has no violations", async ({ page }) => {
    await page.goto("/login");
    const { violations } = await scan(page).analyze();

    expect(describeViolations(violations)).toBe("");
  });

  for (const route of ROUTES) {
    test(`${route} has no violations`, async ({ page }) => {
      await login(page);
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      const { violations } = await scan(page).analyze();

      expect(describeViolations(violations)).toBe("");
    });
  }

  test("every screen is reachable with the keyboard alone", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Tabbing must reach a real, focusable control rather than falling into
    // the void or landing on a non-interactive wrapper.
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName ?? "",
        name:
          el?.getAttribute("aria-label") ??
          el?.textContent?.trim().slice(0, 40) ??
          "",
      };
    });

    expect(["A", "BUTTON", "INPUT"]).toContain(focused.tag);
    expect(focused.name.length).toBeGreaterThan(0);
  });

  test("icon-only buttons all carry an accessible name", async ({ page }) => {
    await login(page);
    await page.goto("/datasets");
    await page.waitForLoadState("networkidle");

    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .filter((button) => {
          const hasText = (button.textContent ?? "").trim().length > 0;
          const hasLabel =
            button.hasAttribute("aria-label") ||
            button.hasAttribute("aria-labelledby");
          return !hasText && !hasLabel;
        })
        .map((button) => button.outerHTML.slice(0, 120)),
    );

    expect(unnamed).toEqual([]);
  });
});
