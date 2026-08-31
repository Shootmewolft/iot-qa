import { expect, type Page, test } from "@playwright/test";

/**
 * Acceptance criteria (spec section 27).
 *
 * These were verified once by hand during development. Encoded here they
 * become a gate: privacy and authentication are the two properties that must
 * hold on every deploy, and neither is visible from a passing unit test.
 */

const PROTECTED_PAGES = [
  "/dashboard",
  "/datasets",
  "/datasets/generar",
  "/datasets/importar",
  "/trabajos",
  "/reportes",
  "/mantenimiento",
  "/configuracion",
];

const PROTECTED_APIS = [
  "/api/auth/session",
  "/api/thingspeak/status",
  "/api/thingspeak/data",
];

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Contraseña").fill(process.env.APP_PASSWORD ?? "");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("privacidad", () => {
  test("robots.txt blocks every crawler", async ({ request }) => {
    const response = await request.get("/robots.txt");

    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("User-Agent: *");
    expect(body).toContain("Disallow: /");
    expect(body).not.toContain("Allow: /");
  });

  test("no sitemap exposes the private routes", async ({ request }) => {
    /*
     * Asserted on CONTENT, not on a 404. The proxy redirects the path to the
     * login screen, so following redirects yields a perfectly innocent 200 —
     * and a test that accepted that status would also accept a real sitemap
     * served from behind the redirect.
     */
    const response = await request.get("/sitemap.xml");
    const body = await response.text();

    expect(body).not.toContain("<urlset");
    expect(body).not.toContain("<loc>");
    for (const route of PROTECTED_PAGES) {
      expect(body, `${route} aparece en /sitemap.xml`).not.toContain(
        `${route}<`,
      );
    }
  });

  test("every response carries X-Robots-Tag", async ({ request }) => {
    for (const path of ["/login", "/robots.txt", "/api/auth/session"]) {
      const header = (await request.get(path)).headers()["x-robots-tag"];
      expect(header, `falta en ${path}`).toContain("noindex");
      expect(header, `falta nofollow en ${path}`).toContain("nofollow");
    }
  });

  test("the login page declares noindex in its metadata", async ({ page }) => {
    await page.goto("/login");

    const robots = await page
      .locator('meta[name="robots"]')
      .first()
      .getAttribute("content");

    expect(robots).toContain("noindex");
  });

  test("hardening headers are present", async ({ request }) => {
    const headers = (await request.get("/login")).headers();

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["permissions-policy"]).toContain("camera=()");
  });
});

test.describe("autenticación", () => {
  for (const path of PROTECTED_PAGES) {
    test(`${path} redirects to the login screen when anonymous`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  for (const path of PROTECTED_APIS) {
    test(`${path} answers 401 when anonymous, not a redirect`, async ({
      request,
    }) => {
      // An API caller must get a status it can act on, never an HTML page.
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(401);
    });
  }

  test("the session cookie is HttpOnly, SameSite=Strict and path-scoped", async ({
    context,
    page,
  }) => {
    await login(page);

    const cookie = (await context.cookies()).find(
      (item) => item.name === "tsqa_session",
    );

    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly, "la cookie es legible desde JavaScript").toBe(
      true,
    );
    expect(cookie?.sameSite).toBe("Strict");
    expect(cookie?.path).toBe("/");
  });

  test("a wrong password is rejected without revealing why", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Contraseña").fill("definitivamente-incorrecta");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("logging out drops the session", async ({ page }) => {
    await login(page);

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.waitForURL("**/login");

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("no credential reaches the browser", async ({ page }) => {
    await login(page);
    await page.goto("/configuracion");
    await page.waitForLoadState("networkidle");

    const html = await page.content();
    const password = process.env.APP_PASSWORD ?? "";

    expect(password.length).toBeGreaterThan(0);
    expect(html).not.toContain(password);
    // Diagnostics may report presence, never the value.
    expect(html).toContain("Configurada");
  });
});
