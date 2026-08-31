import { describe, expect, it } from "vitest";

import {
  mapChannel,
  mapFeed,
  mapReading,
  parseFieldValue,
  parseTimestamp,
} from "@/lib/thingspeak/mapper";

describe("parseFieldValue", () => {
  it("parses the strings ThingSpeak actually sends", () => {
    expect(parseFieldValue("26.4")).toBe(26.4);
    expect(parseFieldValue("-40")).toBe(-40);
    expect(parseFieldValue("0")).toBe(0);
    expect(parseFieldValue(" 72.1 ")).toBe(72.1);
  });

  it("accepts a raw number", () => {
    expect(parseFieldValue(26.4)).toBe(26.4);
  });

  it("treats an absent value as null, not zero", () => {
    // Zero is a valid temperature. Collapsing "no reading" into 0 would
    // silently poison every average.
    expect(parseFieldValue(null)).toBeNull();
    expect(parseFieldValue(undefined)).toBeNull();
    expect(parseFieldValue("")).toBeNull();
    expect(parseFieldValue("   ")).toBeNull();
  });

  it("never lets NaN or Infinity through", () => {
    expect(parseFieldValue("abc")).toBeNull();
    expect(parseFieldValue("NaN")).toBeNull();
    expect(parseFieldValue(Number.NaN)).toBeNull();
    expect(parseFieldValue(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseFieldValue("Infinity")).toBeNull();
  });

  it("rejects values that are not numbers or strings", () => {
    expect(parseFieldValue({})).toBeNull();
    expect(parseFieldValue([])).toBeNull();
    expect(parseFieldValue(true)).toBeNull();
  });
});

describe("parseTimestamp", () => {
  it("normalizes to ISO 8601 in UTC", () => {
    expect(parseTimestamp("2026-08-01T13:00:00Z")).toBe(
      "2026-08-01T13:00:00.000Z",
    );
  });

  it("converts an offset timestamp to UTC", () => {
    expect(parseTimestamp("2026-08-01T08:00:00-05:00")).toBe(
      "2026-08-01T13:00:00.000Z",
    );
  });

  it("returns null for an unparseable date", () => {
    expect(parseTimestamp("not-a-date")).toBeNull();
  });
});

describe("mapReading", () => {
  it("maps a complete entry", () => {
    expect(
      mapReading({
        entry_id: 42,
        created_at: "2026-08-01T13:00:00Z",
        field1: "26.4",
        field2: "72.1",
      }),
    ).toEqual({
      entryId: 42,
      createdAt: "2026-08-01T13:00:00.000Z",
      temperature: 26.4,
      humidity: 72.1,
    });
  });

  it("keeps an entry that carries only one field", () => {
    // This is the state the "clear a single field" maintenance path leaves
    // behind (spec section 20.5). Dropping it would hide real data.
    const reading = mapReading({
      entry_id: 7,
      created_at: "2026-08-01T13:00:00Z",
      field1: null,
      field2: "72.1",
    });

    expect(reading).toEqual({
      entryId: 7,
      createdAt: "2026-08-01T13:00:00.000Z",
      temperature: null,
      humidity: 72.1,
    });
  });

  it("drops an entry whose timestamp cannot be placed in time", () => {
    expect(
      mapReading({ entry_id: 1, created_at: "garbage", field1: "26.4" }),
    ).toBeNull();
  });
});

describe("mapChannel", () => {
  it("maps channel metadata and its field labels", () => {
    expect(
      mapChannel({
        id: 3474649,
        name: "Grupo 4",
        description: "Aula",
        field1: "Temperatura",
        field2: "Humedad",
        created_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-08-01T13:00:00Z",
        last_entry_id: 1200,
      }),
    ).toEqual({
      id: 3474649,
      name: "Grupo 4",
      description: "Aula",
      temperatureLabel: "Temperatura",
      humidityLabel: "Humedad",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-08-01T13:00:00.000Z",
      lastEntryId: 1200,
    });
  });

  it("falls back to a readable name when the channel has none", () => {
    const channel = mapChannel({ id: 3474649 });

    expect(channel.name).toBe("Canal 3474649");
    expect(channel.lastEntryId).toBeNull();
  });
});

describe("mapFeed", () => {
  it("maps a whole response and skips unusable entries", () => {
    const feed = mapFeed({
      channel: { id: 1, name: "Canal" },
      feeds: [
        { entry_id: 1, created_at: "2026-08-01T13:00:00Z", field1: "26.4" },
        { entry_id: 2, created_at: "invalid", field1: "26.5" },
        { entry_id: 3, created_at: "2026-08-01T13:00:20Z", field2: "70" },
      ],
    });

    expect(feed.readings).toHaveLength(2);
    expect(feed.readings.map((r) => r.entryId)).toEqual([1, 3]);
  });
});
