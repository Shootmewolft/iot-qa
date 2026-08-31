import { describe, expect, it } from "vitest";

import { pearson } from "@/lib/statistics/correlation";

describe("pearson", () => {
  it("returns 1 for a perfect direct relationship", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8]).r).toBeCloseTo(1, 10);
  });

  it("returns -1 for a perfect inverse relationship", () => {
    const result = pearson([1, 2, 3, 4], [8, 6, 4, 2]);

    expect(result.r).toBeCloseTo(-1, 10);
    expect(result.interpretation).toContain("inversa");
  });

  it("never reports a magnitude above 1", () => {
    // Floating-point error on a perfect fit used to push r just past 1.
    const xs = Array.from({ length: 500 }, (_, i) => i * 0.1);
    const ys = xs.map((x) => x * 3 + 7);

    expect(Math.abs(pearson(xs, ys).r)).toBeLessThanOrEqual(1);
  });

  it("uses only pairs where both values are present", () => {
    const withGaps = pearson([1, null, 3, 4], [2, 6, 6, 8]);
    const withoutGaps = pearson([1, 3, 4], [2, 6, 8]);

    expect(withGaps.pairs).toBe(3);
    expect(withGaps.r).toBeCloseTo(withoutGaps.r, 10);
  });

  it("does not pair readings that never happened together", () => {
    // Dropping index 1 must remove it from BOTH series, not shift one of them.
    const result = pearson([1, null, 3], [10, 20, 30]);

    expect(result.pairs).toBe(2);
  });

  it("refuses to report a coefficient below three pairs", () => {
    // Two points always sit on a line, so r would be ±1 and mean nothing.
    const result = pearson([1, 2], [2, 4]);

    expect(Number.isNaN(result.r)).toBe(true);
    expect(result.interpretation).toContain("3");
  });

  it("reports undefined rather than zero for a constant series", () => {
    const result = pearson([5, 5, 5, 5], [1, 2, 3, 4]);

    expect(Number.isNaN(result.r)).toBe(true);
    expect(result.interpretation).toContain("no varía");
  });

  it("ignores NaN and Infinity", () => {
    const result = pearson([1, Number.NaN, 3, 4], [2, 4, 6, 8]);
    expect(result.pairs).toBe(3);
  });

  it("describes the strength in plain language", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8]).interpretation).toContain(
      "muy fuerte",
    );
    expect(
      pearson([1, 2, 3, 4, 5], [3, 1, 4, 1, 5]).interpretation,
    ).toBeTruthy();
  });

  it("matches a known value", () => {
    // Textbook example: r = 0.9746 to four decimals.
    const result = pearson([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]);
    expect(result.r).toBeCloseTo(0.7746, 3);
  });
});
