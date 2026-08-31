import { describe, expect, it } from "vitest";

import {
  buildFeedUrl,
  MAX_RESULTS_PER_READ,
  toThingSpeakDate,
} from "@/lib/thingspeak/query";

const BASE = "https://api.thingspeak.com";
const CHANNEL = "3474649";

function params(url: string) {
  return new URL(url).searchParams;
}

describe("toThingSpeakDate", () => {
  it("formats as YYYY-MM-DD HH:NN:SS in UTC", () => {
    expect(toThingSpeakDate("2026-08-01T13:00:00.000Z")).toBe(
      "2026-08-01 13:00:00",
    );
  });

  it("converts an offset timestamp to UTC before formatting", () => {
    expect(toThingSpeakDate("2026-08-01T08:00:00-05:00")).toBe(
      "2026-08-01 13:00:00",
    );
  });

  it("throws on an unparseable date instead of sending garbage", () => {
    expect(() => toThingSpeakDate("nope")).toThrow();
  });
});

describe("buildFeedUrl", () => {
  it("targets the channel feed endpoint and pins the timezone to UTC", () => {
    const url = buildFeedUrl(BASE, CHANNEL, {});

    expect(new URL(url).pathname).toBe("/channels/3474649/feeds.json");
    expect(params(url).get("timezone")).toBe("UTC");
  });

  it("omits the api key when the channel is public", () => {
    expect(params(buildFeedUrl(BASE, CHANNEL, {})).has("api_key")).toBe(false);
  });

  it("includes the read api key when configured", () => {
    const url = buildFeedUrl(BASE, CHANNEL, {}, "READKEY");
    expect(params(url).get("api_key")).toBe("READKEY");
  });

  it("clamps results to the 8,000 ceiling ThingSpeak enforces", () => {
    const url = buildFeedUrl(BASE, CHANNEL, { results: 10_000 });
    expect(params(url).get("results")).toBe(String(MAX_RESULTS_PER_READ));
  });

  it("keeps a request below the ceiling untouched", () => {
    const url = buildFeedUrl(BASE, CHANNEL, { results: 500 });
    expect(params(url).get("results")).toBe("500");
  });

  it("never emits a negative results count", () => {
    const url = buildFeedUrl(BASE, CHANNEL, { results: -5 });
    expect(params(url).get("results")).toBe("0");
  });

  it("formats the start and end bounds", () => {
    const url = buildFeedUrl(BASE, CHANNEL, {
      start: "2026-08-01T00:00:00Z",
      end: "2026-08-02T00:00:00Z",
    });

    expect(params(url).get("start")).toBe("2026-08-01 00:00:00");
    expect(params(url).get("end")).toBe("2026-08-02 00:00:00");
  });

  it("tolerates a base url with a trailing slash", () => {
    const url = buildFeedUrl("https://api.thingspeak.com/", CHANNEL, {});
    expect(new URL(url).pathname).toBe("/channels/3474649/feeds.json");
  });
});
