import { describe, expect, it } from "vitest";

import { MAX_RESULTS_PER_READ } from "@/lib/thingspeak/query";
import { buildPreflightReport, chunk } from "@/lib/upload/preflight";

function stamps(count: number, startMs = Date.UTC(2026, 7, 1)): string[] {
  return Array.from({ length: count }, (_, i) =>
    new Date(startMs + i * 20_000).toISOString(),
  );
}

describe("buildPreflightReport", () => {
  it("reports no collisions against an empty channel", () => {
    const report = buildPreflightReport(stamps(100), []);

    expect(report.collisions).toHaveLength(0);
    expect(report.datasetRows).toBe(100);
    expect(report.truncated).toBe(false);
  });

  it("finds the exact timestamps that already exist", () => {
    const dataset = stamps(10);
    const channel = [dataset[3], dataset[7]];

    const report = buildPreflightReport(dataset, channel);

    expect(report.collisions).toEqual([dataset[3], dataset[7]]);
  });

  it("catches a dataset that overlaps what the ESP32 already wrote", () => {
    // The realistic failure: a historical dataset landing on top of live data.
    const dataset = stamps(100);
    const channel = stamps(50, Date.UTC(2026, 7, 1) + 20_000 * 50);

    const report = buildPreflightReport(dataset, channel);

    expect(report.collisions.length).toBeGreaterThan(0);
  });

  it("reports the dataset time range", () => {
    const dataset = stamps(5);
    const report = buildPreflightReport(dataset, []);

    expect(report.range).toEqual({ start: dataset[0], end: dataset[4] });
  });

  it("flags a truncated channel read as non-exhaustive", () => {
    const report = buildPreflightReport(
      stamps(10),
      stamps(MAX_RESULTS_PER_READ, Date.UTC(2020, 0, 1)),
    );

    // The channel read hit the ceiling, so absence of collisions proves nothing.
    expect(report.truncated).toBe(true);
  });

  it("handles an empty dataset without throwing", () => {
    const report = buildPreflightReport([], stamps(10));

    expect(report.range).toBeNull();
    expect(report.collisions).toHaveLength(0);
  });
});

describe("chunk", () => {
  it("splits 10,000 rows into 11 batches of at most 960", () => {
    const batches = chunk(stamps(10_000), 960);

    expect(batches).toHaveLength(11);
    expect(batches[0]).toHaveLength(960);
    expect(batches[10]).toHaveLength(10_000 - 960 * 10);
  });

  it("preserves order across the split", () => {
    const items = stamps(2500);
    expect(chunk(items, 960).flat()).toEqual(items);
  });

  it("returns nothing for an empty input", () => {
    expect(chunk([], 960)).toEqual([]);
  });
});
