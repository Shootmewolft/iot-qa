import { describe, expect, it } from "vitest";

import { buildScatterData } from "@/components/dashboard/scatter-chart";
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

describe("buildScatterData", () => {
  it("passes paired temperature and humidity values to Recharts", () => {
    expect(
      buildScatterData([
        reading(1, 24, 60),
        reading(2, null, 61),
        reading(3, 26, 58),
      ]),
    ).toEqual([
      { temperature: 24, humidity: 60 },
      { temperature: 26, humidity: 58 },
    ]);
  });

  it("bounds a dense scatter plot without returning an empty series", () => {
    const readings = Array.from({ length: 100 }, (_, index) =>
      reading(index + 1, 20 + index / 10, 70 - index / 10),
    );

    const data = buildScatterData(readings, 10);

    expect(data).toHaveLength(10);
    expect(data[0]).toEqual({ temperature: 20, humidity: 70 });
  });
});
