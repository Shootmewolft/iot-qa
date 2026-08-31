import "server-only";

import {
  thingSpeakBaseUrl,
  thingSpeakChannelId,
  thingSpeakUserApiKey,
} from "@/lib/env";
import { classifyStatus, type ThingSpeakResult } from "@/lib/thingspeak/client";

/**
 * Destructive channel operations (MVP spec, section 20.3).
 *
 * ThingSpeak offers no way to delete individual entries: the only deletion it
 * exposes clears the whole feed. That is why a backup is a precondition and
 * not a suggestion — once this runs, the local copy is the only copy.
 */

const REQUEST_TIMEOUT_MS = 30_000;

export type ClearOutcome = {
  clearedAt: string;
};

/**
 * Clears every entry from the channel.
 *
 * Uses the USER API Key, not the channel's Write Key. That key can clear any
 * channel on the account, which is precisely why this function is the only
 * place that touches it.
 */
export async function clearChannel(): Promise<ThingSpeakResult<ClearOutcome>> {
  let url: string;
  let apiKey: string;
  let channelId: string;

  try {
    const base = thingSpeakBaseUrl();
    channelId = thingSpeakChannelId();
    url = new URL(
      `/channels/${channelId}/feeds.json`,
      base.endsWith("/") ? base : `${base}/`,
    ).toString();
    apiKey = thingSpeakUserApiKey();
  } catch {
    return { ok: false, code: "SERVER_MISCONFIGURED" };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "DELETE",
      cache: "no-store",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ api_key: apiKey }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    /*
     * A timeout here is genuinely ambiguous: the channel may already be
     * empty. The caller must read it back rather than assume either way.
     */
    return { ok: false, code: "CHANNEL_CLEAR_UNCERTAIN" };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: classifyStatus(response.status),
      status: response.status,
    };
  }

  return { ok: true, data: { clearedAt: new Date().toISOString() } };
}
