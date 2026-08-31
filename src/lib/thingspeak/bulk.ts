import "server-only";

import type { ApiErrorCode } from "@/lib/api/errors";
import {
  thingSpeakBaseUrl,
  thingSpeakChannelId,
  thingSpeakWriteApiKey,
} from "@/lib/env";
import { classifyStatus, type ThingSpeakResult } from "@/lib/thingspeak/client";
import { MAX_MESSAGES_PER_BATCH } from "@/lib/upload/batching";

/**
 * Bulk write (MVP spec, section 15).
 *
 * The Write API Key is attached here and never leaves the server. The browser
 * sends measurements; it never learns the credential that writes them.
 */

const REQUEST_TIMEOUT_MS = 25_000;

export type BulkUpdate = {
  created_at: string;
  field1: number;
  field2: number;
};

export type BulkWriteOutcome = {
  /** Rows ThingSpeak did not complain about. NOT a guarantee they landed. */
  accepted: number;
  /**
   * Always false: this endpoint cannot confirm a write. Present so a caller
   * that forgets to verify has to acknowledge the fact in its types.
   */
  confirmed: false;
};

export type BulkMeasurement = {
  createdAt: string;
  temperature: number;
  humidity: number;
};

export function toBulkUpdates(rows: BulkMeasurement[]): BulkUpdate[] {
  return rows.map((row) => ({
    created_at: row.createdAt,
    field1: row.temperature,
    field2: row.humidity,
  }));
}

/**
 * Sends one batch.
 *
 * A timeout or a 5xx is deliberately NOT reported as a failure: ThingSpeak
 * may have stored the rows and lost the response. The caller must verify
 * before retrying, or it risks a duplicate-timestamp rejection of the whole
 * batch (spec section 16).
 */
export async function bulkWrite(
  rows: BulkMeasurement[],
): Promise<ThingSpeakResult<BulkWriteOutcome> & { uncertain?: boolean }> {
  if (rows.length === 0)
    return { ok: true, data: { accepted: 0, confirmed: false } };

  if (rows.length > MAX_MESSAGES_PER_BATCH) {
    return { ok: false, code: "BATCH_TOO_LARGE" };
  }

  let url: string;
  let apiKey: string;

  try {
    const base = thingSpeakBaseUrl();
    url = new URL(
      `/channels/${thingSpeakChannelId()}/bulk_update.json`,
      base.endsWith("/") ? base : `${base}/`,
    ).toString();
    apiKey = thingSpeakWriteApiKey();
  } catch {
    return { ok: false, code: "SERVER_MISCONFIGURED" };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        write_api_key: apiKey,
        updates: toBulkUpdates(rows),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Network error or timeout: the write may or may not have landed.
    return { ok: false, code: "BATCH_STATUS_UNKNOWN", uncertain: true };
  }

  if (!response.ok) {
    /*
     * ThingSpeak names the reason when it rejects outright. Observed:
     * HTTP 400 with `error_code: "error_duplicate_timestamps"` when two
     * rows in the SAME request share a timestamp. Reading it turns a
     * generic "invalid request" into an actionable diagnosis.
     */
    const detail = await response.json().catch(() => null);
    const errorCode =
      detail && typeof detail === "object" && "error" in detail
        ? (detail.error as { error_code?: string })?.error_code
        : undefined;

    if (errorCode === "error_duplicate_timestamps") {
      return { ok: false, code: "TIMESTAMP_DUPLICATED", status: 400 };
    }

    const code: ApiErrorCode = classifyStatus(response.status);

    return {
      ok: false,
      code: response.status >= 500 ? "BATCH_STATUS_UNKNOWN" : code,
      status: response.status,
      uncertain: response.status >= 500,
    };
  }

  const body = await response.json().catch(() => null);

  /*
   * `{"success": true}` DOES NOT MEAN THE ROWS WERE WRITTEN.
   *
   * Verified against the live API: re-sending a batch whose timestamps
   * already exist returns `success: true` and writes nothing. A batch of 30
   * duplicates plus 30 brand-new rows also returns `success: true` and
   * writes NEITHER half — the rejection is all-or-nothing, and silent.
   *
   * The documentation says duplicates cause the updates to be "rejected",
   * which reads like an error response. It is not one.
   *
   * So `accepted` here means "ThingSpeak did not complain", never "these
   * rows are in the channel". The caller MUST read the range back before
   * counting them as confirmed.
   */
  if (body && typeof body === "object" && "success" in body && body.success) {
    return { ok: true, data: { accepted: rows.length, confirmed: false } };
  }

  return { ok: false, code: "BATCH_REJECTED", status: response.status };
}
