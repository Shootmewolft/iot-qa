import "server-only";

import type { ApiErrorCode } from "@/lib/api/errors";
import {
  thingSpeakBaseUrl,
  thingSpeakChannelId,
  thingSpeakReadApiKey,
} from "@/lib/env";
import type { TimeRange } from "@/lib/statistics/ranges";
import { mapFeed } from "@/lib/thingspeak/mapper";
import {
  buildFeedUrl,
  type FeedQuery,
  MAX_RESULTS_PER_READ,
} from "@/lib/thingspeak/query";
import { rawFeedResponseSchema } from "@/lib/thingspeak/schemas";
import type {
  ChannelFeed,
  ChannelInfo,
  ChannelReading,
} from "@/lib/thingspeak/types";

const REQUEST_TIMEOUT_MS = 15_000;

export type ThingSpeakResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ApiErrorCode; status?: number };

/**
 * Maps an HTTP status onto the retry policy in the MVP spec, section 16.
 * The distinction matters: 401 must stop the operator, 429 must make them
 * wait, and 5xx must trigger verification rather than a blind retry.
 */
export function classifyStatus(status: number): ApiErrorCode {
  if (status === 401 || status === 403) return "THINGSPEAK_UNAUTHORIZED";
  if (status === 404) return "CHANNEL_NOT_FOUND";
  if (status === 429) return "THINGSPEAK_RATE_LIMITED";
  if (status >= 500) return "THINGSPEAK_UNAVAILABLE";
  return "REQUEST_INVALID";
}

/**
 * Reads entries from the configured channel.
 *
 * `results` is clamped to ThingSpeak's 8,000-entry ceiling by `buildFeedUrl`.
 * A caller that needs the whole channel must page through time windows; it
 * will not be told it got everything when it did not.
 */
export async function fetchFeed(
  query: FeedQuery = {},
): Promise<ThingSpeakResult<ChannelFeed>> {
  let url: string;

  try {
    url = buildFeedUrl(
      thingSpeakBaseUrl(),
      thingSpeakChannelId(),
      query,
      thingSpeakReadApiKey(),
    );
  } catch {
    return { ok: false, code: "SERVER_MISCONFIGURED" };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      // Measurements must never be served stale, and a route without a
      // request-time API would otherwise bake this at build.
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Network failure or timeout. Indistinguishable from here, and both mean
    // the same thing to the caller: we do not know, so do not assume.
    return { ok: false, code: "THINGSPEAK_UNAVAILABLE" };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: classifyStatus(response.status),
      status: response.status,
    };
  }

  /*
   * Defensive: this endpoint answers a real 404 for a missing or private
   * channel (verified), but other ThingSpeak endpoints signal failure with a
   * bare `-1` and a 200. Catching it here yields an honest CHANNEL_NOT_FOUND
   * instead of a misleading "unexpected format".
   */
  const body = await response.json().catch(() => null);
  if (body === -1 || body === "-1") {
    return { ok: false, code: "CHANNEL_NOT_FOUND", status: 200 };
  }

  const parsed = rawFeedResponseSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, code: "THINGSPEAK_RESPONSE_INVALID", status: 200 };
  }

  return { ok: true, data: mapFeed(parsed.data) };
}

/** Channel metadata plus the most recent reading, for the status panel. */
export async function fetchChannelStatus(): Promise<
  ThingSpeakResult<ChannelFeed>
> {
  return fetchFeed({ results: 1 });
}

/**
 * Reads a range that may hold more than one request can return.
 *
 * ThingSpeak caps a read at 8,000 entries and says nothing when it truncates,
 * so a "30 days" view would quietly become "the most recent 8,000 readings".
 * This walks the range in windows and merges the results, de-duplicating by
 * entry id in case two windows overlap on a boundary.
 */
export async function fetchFeedWindows(
  windows: TimeRange[],
): Promise<ThingSpeakResult<ChannelFeed & { truncated: boolean }>> {
  const readings = new Map<number, ChannelReading>();
  let channel: ChannelInfo | null = null;
  let truncated = false;

  for (const window of windows) {
    const result = await fetchFeed({
      start: window.start ?? undefined,
      end: window.end ?? undefined,
      results: MAX_RESULTS_PER_READ,
    });

    if (!result.ok) return result;

    channel ??= result.data.channel;
    if (result.data.readings.length >= MAX_RESULTS_PER_READ) truncated = true;

    for (const reading of result.data.readings) {
      readings.set(reading.entryId, reading);
    }
  }

  if (!channel) return { ok: false, code: "THINGSPEAK_RESPONSE_INVALID" };

  return {
    ok: true,
    data: {
      channel,
      readings: [...readings.values()].sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
      ),
      truncated,
    },
  };
}
