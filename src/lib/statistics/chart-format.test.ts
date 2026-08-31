import { describe, expect, it } from "vitest";

import { formatMeasurementTick } from "@/lib/statistics/chart-format";

describe("formatMeasurementTick", () => {
  it("removes floating-point noise", () => {
    expect(formatMeasurementTick(0.1 + 0.2)).toBe("0.3");
    expect(formatMeasurementTick(23.999999999999996)).toBe("24.0");
  });

  it("keeps one stable decimal for measurement axes", () => {
    expect(formatMeasurementTick(24)).toBe("24.0");
    expect(formatMeasurementTick(-1.25)).toBe("-1.3");
  });

  it("does not print non-finite values", () => {
    expect(formatMeasurementTick(Number.NaN)).toBe("—");
    expect(formatMeasurementTick(Number.POSITIVE_INFINITY)).toBe("—");
  });
});
