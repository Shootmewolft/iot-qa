import { describe, expect, it } from "vitest";

import { summarizeReadings } from "@/lib/statistics/summary";
import type { ChannelReading } from "@/lib/thingspeak/types";

function reading(
  entryId: number,
  temperature: number | null,
  humidity: number | null,
): ChannelReading {
  return {
    entryId,
    createdAt: new Date(entryId * 60_000).toISOString(),
    temperature,
    humidity,
  };
}

describe("summarizeReadings", () => {
  it("keeps nullable fields out of statistics and paired correlation", () => {
    const summary = summarizeReadings([
      reading(1, 20, 70),
      reading(2, null, 60),
      reading(3, 24, 50),
      reading(4, 26, 40),
    ]);

    expect(summary.temperature.count).toBe(3);
    expect(summary.humidity.count).toBe(4);
    expect(summary.correlation.pairs).toBe(3);
    expect(summary.correlation.r).toBeCloseTo(-1, 10);
  });

  it("unifies anomalies from both fields by entry id", () => {
    const readings = Array.from({ length: 20 }, (_, index) =>
      reading(index + 1, 24, 60),
    );
    readings[5] = reading(6, 50, 60);
    readings[11] = reading(12, 24, 99);

    const summary = summarizeReadings(readings);

    expect(summary.anomalousEntryIds).toEqual(new Set([6, 12]));
    expect(summary.temperatureAnomalies).toHaveLength(1);
    expect(summary.humidityAnomalies).toHaveLength(1);
  });
});
