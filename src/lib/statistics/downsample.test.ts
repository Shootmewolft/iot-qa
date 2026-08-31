import { describe, expect, it } from "vitest";

import { downsampleExtremes } from "@/lib/statistics/downsample";

const value = (item: { v: number }) => item.v;

function series(length: number) {
  return Array.from({ length }, (_, i) => ({ v: Math.sin(i / 10) * 10 }));
}

describe("downsampleExtremes", () => {
  it("returns the series untouched when it already fits", () => {
    const items = series(50);
    expect(downsampleExtremes(items, 100, value)).toBe(items);
  });

  it("reduces a long series", () => {
    const result = downsampleExtremes(series(10_000), 1000, value);

    expect(result.length).toBeLessThanOrEqual(1002);
    expect(result.length).toBeGreaterThan(100);
  });

  it("keeps the first and last points", () => {
    const items = series(10_000);
    const result = downsampleExtremes(items, 500, value);

    expect(result[0]).toBe(items[0]);
    expect(result[result.length - 1]).toBe(items[items.length - 1]);
  });

  it("preserves chronological order", () => {
    const items = series(5000);
    const result = downsampleExtremes(items, 200, value);
    const indices = result.map((item) => items.indexOf(item));

    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  it("never loses a spike, which stride sampling would", () => {
    const items = series(10_000);
    items[4_321] = { v: 999 };
    items[7_654] = { v: -999 };

    const result = downsampleExtremes(items, 500, value);
    const values = result.map(value);

    expect(values).toContain(999);
    expect(values).toContain(-999);
  });

  it("skips null values without breaking the bucket", () => {
    const items: { v: number | null }[] = series(2000);
    for (let i = 0; i < 500; i++) items[i] = { v: null };

    const result = downsampleExtremes(items, 200, (item) => item.v);
    expect(result.length).toBeGreaterThan(10);
  });
});
