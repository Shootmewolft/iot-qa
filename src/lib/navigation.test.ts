import { describe, expect, it } from "vitest";

import { navigation } from "@/config/navigation";
import { isActiveRoute } from "@/lib/navigation";

describe("isActiveRoute", () => {
  it("matches the exact route", () => {
    expect(isActiveRoute("/trabajos", "/trabajos")).toBe(true);
  });

  it("matches a nested route", () => {
    expect(isActiveRoute("/trabajos/job_01", "/trabajos")).toBe(true);
  });

  it("does not match an unrelated route", () => {
    expect(isActiveRoute("/reportes", "/trabajos")).toBe(false);
  });

  it("does not match a route that merely shares a prefix", () => {
    expect(isActiveRoute("/trabajosviejos", "/trabajos")).toBe(false);
  });

  it("keeps /datasets inactive while a child route is open", () => {
    expect(isActiveRoute("/datasets/generar", "/datasets")).toBe(false);
    expect(isActiveRoute("/datasets/importar", "/datasets")).toBe(false);
    expect(isActiveRoute("/datasets", "/datasets")).toBe(true);
  });
});

describe("navigation config", () => {
  it("exposes every route declared in the spec", () => {
    const hrefs = navigation.flatMap((group) =>
      group.items.map((item) => item.href),
    );

    expect(hrefs).toEqual([
      "/dashboard",
      "/datasets",
      "/datasets/generar",
      "/datasets/importar",
      "/trabajos",
      "/reportes",
      "/mantenimiento",
      "/configuracion",
    ]);
  });

  it("has no duplicate routes", () => {
    const hrefs = navigation.flatMap((group) =>
      group.items.map((item) => item.href),
    );

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("marks exactly one entry active for any nav route", () => {
    const hrefs = navigation.flatMap((group) =>
      group.items.map((item) => item.href),
    );

    for (const pathname of hrefs) {
      const active = hrefs.filter((href) => isActiveRoute(pathname, href));
      expect(active, `ruta ${pathname}`).toEqual([pathname]);
    }
  });
});
