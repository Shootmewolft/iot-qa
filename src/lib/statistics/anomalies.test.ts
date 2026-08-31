import { describe, expect, it } from "vitest";

import { detectAnomalies } from "@/lib/statistics/anomalies";

const value = (n: number | null) => n;

function flat(count: number, base = 26): (number | null)[] {
  return Array.from({ length: count }, (_, i) => base + (i % 3) * 0.1);
}

describe("detectAnomalies", () => {
  it("finds nothing in a well-behaved series", () => {
    expect(detectAnomalies(flat(100), value)).toHaveLength(0);
  });

  it("finds an obvious spike", () => {
    const series = flat(100);
    series[42] = 95;

    const found = detectAnomalies(series, value);

    expect(found).toHaveLength(1);
    expect(found[0].value).toBe(95);
  });

  it("finds a spike in both directions", () => {
    const series = flat(100);
    series[10] = 95;
    series[80] = -35;

    expect(
      detectAnomalies(series, value)
        .map((a) => a.value)
        .sort(),
    ).toEqual([-35, 95]);
  });

  it("still finds spikes when several are present", () => {
    // The point of the median-based score: a plain Z-score lets a cluster of
    // outliers inflate the standard deviation until they hide themselves.
    const series = flat(200);
    for (const index of [10, 20, 30, 40, 50]) series[index] = 90;

    expect(detectAnomalies(series, value).length).toBe(5);
  });

  it("survives a perfectly constant series without flagging everything", () => {
    // MAD is zero here; a naive implementation would divide by it.
    expect(detectAnomalies(Array(50).fill(26), value)).toHaveLength(0);
  });

  it("finds a spike inside an otherwise constant series", () => {
    const series: (number | null)[] = Array(50).fill(26);
    series[25] = 60;

    expect(detectAnomalies(series, value)).toHaveLength(1);
  });

  it("says nothing when there are too few readings to judge", () => {
    expect(detectAnomalies([1, 99, 2, 3], value)).toHaveLength(0);
  });

  it("ignores nulls without breaking the score", () => {
    const series = flat(100);
    for (let i = 0; i < 20; i++) series[i] = null;
    series[50] = 95;

    const found = detectAnomalies(series, value);
    expect(found).toHaveLength(1);
  });

  it("honours a stricter threshold", () => {
    // The series spans 26.0 to 26.2, so 26.4 sits about two deviations out:
    // unremarkable at the conventional 3.5 cutoff, reportable at 1.
    const series = flat(100);
    series[42] = 26.4;

    expect(detectAnomalies(series, value, 3.5)).toHaveLength(0);
    expect(detectAnomalies(series, value, 1).length).toBeGreaterThan(0);
  });

  it("reports a score that grows with the deviation", () => {
    const series = flat(100);
    series[10] = 40;
    series[20] = 95;

    const found = detectAnomalies(series, value).sort(
      (a, b) => a.score - b.score,
    );
    expect(found[1].score).toBeGreaterThan(found[0].score);
  });
});
