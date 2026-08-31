import { describe, expect, it } from "vitest";

import { formatDateTime, formatMeasurement } from "@/lib/format";

describe("formatDateTime", () => {
  it("renders a UTC instant in the operator timezone", () => {
    // 13:00 UTC is 08:00 in America/Bogota (UTC-5, no DST).
    expect(formatDateTime("2026-08-01T13:00:00Z")).toContain("8:00:00");
  });

  it("is stable regardless of the runtime timezone", () => {
    const first = formatDateTime("2026-08-01T13:00:00Z");
    const second = formatDateTime("2026-08-01T08:00:00-05:00");
    expect(first).toBe(second);
  });

  it("renders a placeholder for missing or invalid input", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime("nope")).toBe("—");
  });
});

describe("formatMeasurement", () => {
  it("formats a reading with its unit", () => {
    expect(formatMeasurement(26.44, "°C")).toBe("26.4 °C");
    expect(formatMeasurement(72, "%", 1)).toBe("72.0 %");
  });

  it("keeps zero as a real reading", () => {
    expect(formatMeasurement(0, "°C")).toBe("0.0 °C");
  });

  it("renders a placeholder for an absent reading", () => {
    expect(formatMeasurement(null, "°C")).toBe("—");
    expect(formatMeasurement(Number.NaN, "°C")).toBe("—");
  });
});
