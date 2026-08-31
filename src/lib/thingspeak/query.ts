/**
 * ThingSpeak caps a single ordinary read at 8,000 entries.
 *
 * This constant is exported rather than inlined because it is a correctness
 * boundary, not a tuning knob: any caller that needs more data — a full
 * channel backup, most obviously — must page through time windows instead of
 * asking for more and silently receiving a truncated answer.
 */
export const MAX_RESULTS_PER_READ = 8000;

/** ThingSpeak expects `YYYY-MM-DD HH:NN:SS`, interpreted in the `timezone` param. */
export function toThingSpeakDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${iso}`);
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export type FeedQuery = {
  /** Number of entries to return. Clamped to MAX_RESULTS_PER_READ. */
  results?: number;
  /** ISO 8601 lower bound, inclusive. */
  start?: string;
  /** ISO 8601 upper bound, inclusive. */
  end?: string;
};

export function buildFeedUrl(
  baseUrl: string,
  channelId: string,
  query: FeedQuery,
  readApiKey?: string,
): string {
  const url = new URL(
    `/channels/${channelId}/feeds.json`,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  );

  // Always UTC: the domain stores UTC and the UI localizes (spec section 12.5).
  url.searchParams.set("timezone", "UTC");

  if (readApiKey) url.searchParams.set("api_key", readApiKey);

  if (query.results !== undefined) {
    const clamped = Math.max(0, Math.min(query.results, MAX_RESULTS_PER_READ));
    url.searchParams.set("results", String(clamped));
  }

  if (query.start) url.searchParams.set("start", toThingSpeakDate(query.start));
  if (query.end) url.searchParams.set("end", toThingSpeakDate(query.end));

  return url.toString();
}
