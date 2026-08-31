import { describe, expect, it } from "vitest";

import { describeSeries, percentile } from "@/lib/statistics/descriptive";

describe("percentile", () => {
  it("interpolates like a spreadsheet", () => {
    const sorted = [1, 2, 3, 4];

    expect(percentile(sorted, 0)).toBe(1);
    expect(percentile(sorted, 0.5)).toBe(2.5);
    expect(percentile(sorted, 1)).toBe(4);
    expect(percentile(sorted, 0.25)).toBeCloseTo(1.75, 10);
  });

  it("handles a single value", () => {
    expect(percentile([7], 0.5)).toBe(7);
  });
});

describe("describeSeries", () => {
  it("computes the descriptive set", () => {
    const stats = describeSeries([2, 4, 4, 4, 5, 5, 7, 9]);

    expect(stats.count).toBe(8);
    expect(stats.min).toBe(2);
    expect(stats.max).toBe(9);
    expect(stats.mean).toBe(5);
    expect(stats.median).toBe(4.5);
    // Population standard deviation of this classic sample is exactly 2.
    expect(stats.stdDev).toBeCloseTo(2, 10);
    expect(stats.range).toBe(7);
  });

  it("drops nulls instead of treating them as zero", () => {
    const withNulls = describeSeries([10, null, 20, undefined, 30]);
    const without = describeSeries([10, 20, 30]);

    expect(withNulls.count).toBe(3);
    expect(withNulls.mean).toBe(without.mean);
  });

  it("drops NaN and Infinity", () => {
    const stats = describeSeries([1, Number.NaN, 3, Number.POSITIVE_INFINITY]);

    expect(stats.count).toBe(2);
    expect(stats.mean).toBe(2);
  });

  it("returns NaN rather than throwing on an empty series", () => {
    const stats = describeSeries([]);

    expect(stats.count).toBe(0);
    expect(Number.isNaN(stats.mean)).toBe(true);
  });

  it("reports zero deviation for a constant series", () => {
    const stats = describeSeries([5, 5, 5, 5]);

    expect(stats.stdDev).toBe(0);
    expect(stats.range).toBe(0);
  });
});
