import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { classifyStatus, fetchFeed } from "@/lib/thingspeak/client";

/**
 * Integration coverage for the HTTP responses ThingSpeak actually produces
 * (spec section 25).
 *
 * `fetch` is stubbed rather than hit for real: these assert how the client
 * CLASSIFIES an answer, and the retry policy that hangs off that
 * classification is what decides whether the operator retries, waits, stops,
 * or verifies. Getting it wrong duplicates data or loses it.
 */

const CHANNEL_BODY = {
  channel: { id: 3474649, name: "Canal", last_entry_id: 10 },
  feeds: [
    {
      entry_id: 10,
      created_at: "2026-09-01T12:00:00Z",
      field1: "26.4",
      field2: "72.1",
    },
  ],
};

function respondWith(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("THINGSPEAK_CHANNEL_ID", "3474649");
  vi.stubEnv("THINGSPEAK_BASE_URL", "https://api.thingspeak.example");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("classifyStatus", () => {
  it("maps every status the retry policy branches on", () => {
    expect(classifyStatus(401)).toBe("THINGSPEAK_UNAUTHORIZED");
    expect(classifyStatus(403)).toBe("THINGSPEAK_UNAUTHORIZED");
    expect(classifyStatus(404)).toBe("CHANNEL_NOT_FOUND");
    expect(classifyStatus(429)).toBe("THINGSPEAK_RATE_LIMITED");
    expect(classifyStatus(500)).toBe("THINGSPEAK_UNAVAILABLE");
    expect(classifyStatus(502)).toBe("THINGSPEAK_UNAVAILABLE");
    expect(classifyStatus(503)).toBe("THINGSPEAK_UNAVAILABLE");
    expect(classifyStatus(504)).toBe("THINGSPEAK_UNAVAILABLE");
    expect(classifyStatus(400)).toBe("REQUEST_INVALID");
  });

  it("does not treat a 4xx as a server problem", () => {
    // A 4xx means the request is wrong; retrying identical bytes cannot help.
    expect(classifyStatus(422)).toBe("REQUEST_INVALID");
  });
});

describe("fetchFeed", () => {
  it("maps a 200 into domain readings", async () => {
    vi.stubGlobal("fetch", respondWith(200, CHANNEL_BODY));

    const result = await fetchFeed({ results: 10 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.readings).toHaveLength(1);
    expect(result.data.readings[0].temperature).toBe(26.4);
  });

  it("reports a 401 as an authorization problem, not a transient one", async () => {
    vi.stubGlobal("fetch", respondWith(401, { error: "unauthorized" }));

    const result = await fetchFeed();

    expect(result).toMatchObject({
      ok: false,
      code: "THINGSPEAK_UNAUTHORIZED",
    });
  });

  it("reports a 404 as a missing channel", async () => {
    vi.stubGlobal("fetch", respondWith(404, { status: "404" }));

    expect(await fetchFeed()).toMatchObject({
      ok: false,
      code: "CHANNEL_NOT_FOUND",
    });
  });

  it("reports a 429 as rate limiting so the caller waits", async () => {
    vi.stubGlobal("fetch", respondWith(429, {}));

    expect(await fetchFeed()).toMatchObject({
      ok: false,
      code: "THINGSPEAK_RATE_LIMITED",
    });
  });

  it("reports a 500 as unavailable", async () => {
    vi.stubGlobal("fetch", respondWith(500, {}));

    expect(await fetchFeed()).toMatchObject({
      ok: false,
      code: "THINGSPEAK_UNAVAILABLE",
    });
  });

  it("treats a network failure or timeout as unavailable, never as empty", async () => {
    // The dangerous alternative: reading a thrown fetch as "no data", which
    // would show an empty dashboard for a channel that is actually fine.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    expect(await fetchFeed()).toMatchObject({
      ok: false,
      code: "THINGSPEAK_UNAVAILABLE",
    });
  });

  it("rejects a 200 whose body is not the expected shape", async () => {
    vi.stubGlobal("fetch", respondWith(200, { unexpected: true }));

    expect(await fetchFeed()).toMatchObject({
      ok: false,
      code: "THINGSPEAK_RESPONSE_INVALID",
    });
  });

  it("recognises the bare -1 some ThingSpeak endpoints return with a 200", async () => {
    vi.stubGlobal("fetch", respondWith(200, -1));

    expect(await fetchFeed()).toMatchObject({
      ok: false,
      code: "CHANNEL_NOT_FOUND",
    });
  });

  it("survives a 200 carrying invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("<html>oops</html>", { status: 200 })),
    );

    expect(await fetchFeed()).toMatchObject({
      ok: false,
      code: "THINGSPEAK_RESPONSE_INVALID",
    });
  });

  it("fails closed when the channel id is not configured", async () => {
    vi.stubEnv("THINGSPEAK_CHANNEL_ID", "");
    vi.stubGlobal("fetch", respondWith(200, CHANNEL_BODY));

    expect(await fetchFeed()).toMatchObject({
      ok: false,
      code: "SERVER_MISCONFIGURED",
    });
  });

  it("never sends the request when configuration is missing", async () => {
    vi.stubEnv("THINGSPEAK_CHANNEL_ID", "");
    const spy = respondWith(200, CHANNEL_BODY);
    vi.stubGlobal("fetch", spy);

    await fetchFeed();

    expect(spy).not.toHaveBeenCalled();
  });

  it("asks ThingSpeak for UTC and never caches the answer", async () => {
    const spy = respondWith(200, CHANNEL_BODY);
    vi.stubGlobal("fetch", spy);

    await fetchFeed({ results: 5 });

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain("timezone=UTC");
    expect(init).toMatchObject({ cache: "no-store" });
  });
});
