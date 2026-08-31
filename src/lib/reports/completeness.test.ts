import { describe, expect, it } from "vitest";

import { getReportCompletenessNotice } from "@/lib/reports/completeness";

describe("getReportCompletenessNotice", () => {
  it("returns the blocking report alert for a truncated feed", () => {
    expect(getReportCompletenessNotice(true)).toEqual({
      title: "Informe incompleto",
      description: expect.stringContaining("8.000 entradas"),
    });
  });

  it("does not show an incomplete alert for a complete feed", () => {
    expect(getReportCompletenessNotice(false)).toBeNull();
  });
});
