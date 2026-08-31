import { describe, expect, it } from "vitest";

import { generateMeasurements } from "@/lib/generator/generate";
import { generatorConfigSchema } from "@/lib/generator/schema";
import type { GeneratorConfig } from "@/lib/generator/types";

const baseConfig: GeneratorConfig = {
  count: 500,
  startAt: "2026-08-01T00:00:00.000Z",
  intervalSeconds: 20,
  seed: "grupo-4",
  temperature: {
    min: 22,
    max: 32,
    base: 26.5,
    dailyAmplitude: 2.5,
    noise: 0.35,
  },
  humidity: { min: 45, max: 85, base: 68, dailyAmplitude: 6, noise: 1.2 },
  correlation: 0.55,
  anomalyRate: 0.004,
  anomalyMagnitude: 6,
  decimals: 1,
};

describe("reproducibility", () => {
  it("produces an identical dataset for the same seed and config", () => {
    const first = generateMeasurements(baseConfig);
    const second = generateMeasurements(baseConfig);

    expect(second).toEqual(first);
  });

  it("produces a different dataset for a different seed", () => {
    const first = generateMeasurements(baseConfig);
    const second = generateMeasurements({
      ...baseConfig,
      seed: "otra-semilla",
    });

    expect(second).not.toEqual(first);
  });

  it("gives unrelated streams to adjacent seeds", () => {
    // A weak seed hash would make "aula-1" and "aula-2" near-identical.
    const a = generateMeasurements({
      ...baseConfig,
      seed: "aula-1",
      count: 50,
    });
    const b = generateMeasurements({
      ...baseConfig,
      seed: "aula-2",
      count: 50,
    });

    const identical = a.filter(
      (row, i) => row.temperature === b[i].temperature,
    ).length;

    expect(identical).toBeLessThan(25);
  });
});

describe("physical limits", () => {
  it("never leaves the configured range", () => {
    const rows = generateMeasurements(baseConfig);

    for (const row of rows) {
      expect(row.temperature).toBeGreaterThanOrEqual(22);
      expect(row.temperature).toBeLessThanOrEqual(32);
      expect(row.humidity).toBeGreaterThanOrEqual(45);
      expect(row.humidity).toBeLessThanOrEqual(85);
    }
  });

  it("clamps to the DHT22 envelope even under extreme noise", () => {
    const rows = generateMeasurements({
      ...baseConfig,
      count: 2000,
      temperature: {
        min: -40,
        max: 80,
        base: 30,
        dailyAmplitude: 25,
        noise: 20,
      },
      humidity: { min: 0, max: 100, base: 50, dailyAmplitude: 40, noise: 30 },
      anomalyRate: 0.2,
      anomalyMagnitude: 10,
    });

    for (const row of rows) {
      expect(row.temperature).toBeGreaterThanOrEqual(-40);
      expect(row.temperature).toBeLessThanOrEqual(80);
      expect(row.humidity).toBeGreaterThanOrEqual(0);
      expect(row.humidity).toBeLessThanOrEqual(100);
    }
  });

  it("never emits NaN or Infinity", () => {
    const rows = generateMeasurements(baseConfig);

    for (const row of rows) {
      expect(Number.isFinite(row.temperature)).toBe(true);
      expect(Number.isFinite(row.humidity)).toBe(true);
    }
  });

  it("respects the decimal precision", () => {
    const rows = generateMeasurements({
      ...baseConfig,
      decimals: 0,
      count: 50,
    });

    for (const row of rows) {
      expect(Number.isInteger(row.temperature)).toBe(true);
      expect(Number.isInteger(row.humidity)).toBe(true);
    }
  });
});

describe("timestamps", () => {
  it("emits strictly increasing timestamps", () => {
    const rows = generateMeasurements(baseConfig);

    for (let i = 1; i < rows.length; i++) {
      const previous = new Date(rows[i - 1].createdAt).getTime();
      const current = new Date(rows[i].createdAt).getTime();
      expect(current).toBeGreaterThan(previous);
    }
  });

  it("emits no duplicates, which would make ThingSpeak reject the whole batch", () => {
    const rows = generateMeasurements({ ...baseConfig, count: 10_000 });
    const unique = new Set(rows.map((row) => row.createdAt));

    expect(unique.size).toBe(rows.length);
  });

  it("spaces measurements by exactly the configured interval", () => {
    const rows = generateMeasurements({
      ...baseConfig,
      count: 5,
      intervalSeconds: 20,
    });

    expect(rows.map((row) => row.createdAt)).toEqual([
      "2026-08-01T00:00:00.000Z",
      "2026-08-01T00:00:20.000Z",
      "2026-08-01T00:00:40.000Z",
      "2026-08-01T00:01:00.000Z",
      "2026-08-01T00:01:20.000Z",
    ]);
  });

  it("stores UTC even when the start is given with an offset", () => {
    const rows = generateMeasurements({
      ...baseConfig,
      count: 1,
      startAt: "2026-08-01T08:00:00-05:00",
    });

    expect(rows[0].createdAt).toBe("2026-08-01T13:00:00.000Z");
  });

  it("throws rather than emitting Invalid Date rows", () => {
    expect(() =>
      generateMeasurements({ ...baseConfig, startAt: "no-es-fecha" }),
    ).toThrow();
  });
});

describe("realism", () => {
  it("moves gradually instead of jumping", () => {
    const rows = generateMeasurements({ ...baseConfig, count: 1000 });

    const jumps = rows
      .slice(1)
      .map((row, i) => Math.abs(row.temperature - rows[i].temperature));
    const meanJump = jumps.reduce((a, b) => a + b, 0) / jumps.length;

    // Independent noise at sigma 0.35 would average around 0.4 degrees per
    // step; the autoregressive term must keep it well below that.
    expect(meanJump).toBeLessThan(0.25);
  });

  it("correlates humidity inversely with temperature", () => {
    const rows = generateMeasurements({
      ...baseConfig,
      count: 3000,
      correlation: 0.9,
    });

    const temps = rows.map((r) => r.temperature);
    const hums = rows.map((r) => r.humidity);
    const meanT = temps.reduce((a, b) => a + b, 0) / temps.length;
    const meanH = hums.reduce((a, b) => a + b, 0) / hums.length;

    let covariance = 0;
    let varT = 0;
    let varH = 0;
    for (let i = 0; i < temps.length; i++) {
      const dt = temps[i] - meanT;
      const dh = hums[i] - meanH;
      covariance += dt * dh;
      varT += dt * dt;
      varH += dh * dh;
    }

    const pearson = covariance / Math.sqrt(varT * varH);
    expect(pearson).toBeLessThan(-0.5);
  });

  it("produces no anomalies when the rate is zero", () => {
    const rows = generateMeasurements({ ...baseConfig, anomalyRate: 0 });
    expect(rows.some((row) => row.anomaly)).toBe(false);
  });

  it("produces anomalies at roughly the configured rate", () => {
    const rows = generateMeasurements({
      ...baseConfig,
      count: 10_000,
      anomalyRate: 0.05,
    });
    const rate = rows.filter((row) => row.anomaly).length / rows.length;

    expect(rate).toBeGreaterThan(0.03);
    expect(rate).toBeLessThan(0.07);
  });

  it("follows a daily cycle warmer in the afternoon than before dawn", () => {
    const rows = generateMeasurements({
      ...baseConfig,
      count: 4320,
      intervalSeconds: 20,
      startAt: "2026-08-01T00:00:00.000Z",
      anomalyRate: 0,
      temperature: { min: 22, max: 32, base: 27, dailyAmplitude: 3, noise: 0 },
    });

    const at = (hour: number) =>
      rows.find((row) => new Date(row.createdAt).getUTCHours() === hour);

    const afternoon = at(15);
    const preDawn = at(3);

    if (!afternoon || !preDawn) throw new Error("expected both samples");
    expect(afternoon.temperature).toBeGreaterThan(preDawn.temperature);
  });
});

describe("config validation", () => {
  it("accepts the base configuration", () => {
    expect(generatorConfigSchema.safeParse(baseConfig).success).toBe(true);
  });

  it("rejects more than 10,000 rows", () => {
    const result = generatorConfigSchema.safeParse({
      ...baseConfig,
      count: 10_001,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an interval below one second", () => {
    expect(
      generatorConfigSchema.safeParse({ ...baseConfig, intervalSeconds: 0 })
        .success,
    ).toBe(false);
  });

  it("rejects a temperature outside the DHT22 envelope", () => {
    expect(
      generatorConfigSchema.safeParse({
        ...baseConfig,
        temperature: { ...baseConfig.temperature, max: 120 },
      }).success,
    ).toBe(false);
  });

  it("rejects humidity above 100 percent", () => {
    expect(
      generatorConfigSchema.safeParse({
        ...baseConfig,
        humidity: { ...baseConfig.humidity, max: 130 },
      }).success,
    ).toBe(false);
  });

  it("rejects a minimum above its maximum", () => {
    expect(
      generatorConfigSchema.safeParse({
        ...baseConfig,
        temperature: { ...baseConfig.temperature, min: 40, max: 30 },
      }).success,
    ).toBe(false);
  });

  it("rejects a base outside its own range", () => {
    expect(
      generatorConfigSchema.safeParse({
        ...baseConfig,
        temperature: { ...baseConfig.temperature, base: 50 },
      }).success,
    ).toBe(false);
  });

  it("rejects more than two decimals", () => {
    expect(
      generatorConfigSchema.safeParse({ ...baseConfig, decimals: 3 }).success,
    ).toBe(false);
  });
});
