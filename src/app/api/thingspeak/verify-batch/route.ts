import { z } from "zod";

import {
  firstRejection,
  guardJsonContentType,
  guardOrigin,
  guardSession,
} from "@/lib/api/guards";
import { apiFailure, apiSuccess, newRequestId } from "@/lib/api/response";
import { fetchFeed } from "@/lib/thingspeak/client";
import { MAX_MESSAGES_PER_BATCH } from "@/lib/upload/batching";
import {
  canonicalTimestamp,
  summarizeVerification,
} from "@/lib/upload/verification";

const bodySchema = z.object({
  /** Every timestamp the batch was supposed to write, as ISO instants. */
  timestamps: z
    .array(z.iso.datetime({ offset: true }))
    .min(1)
    .max(MAX_MESSAGES_PER_BATCH),
});

/**
 * Resolves a batch whose outcome is unknown (MVP spec, section 16).
 *
 * A timeout does not mean ThingSpeak refused: it may have stored the rows and
 * lost the response. Re-sending blindly would hit duplicate timestamps and
 * reject the entire batch, so the range is read back first.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();

  const rejected = firstRejection(
    guardOrigin(request, requestId),
    guardJsonContentType(request, requestId),
    await guardSession(requestId),
  );
  if (rejected) return rejected;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiFailure("REQUEST_INVALID", requestId);

  const expected = [
    ...new Set(body.data.timestamps.map(canonicalTimestamp)),
  ].sort();
  const start = expected[0];
  const end = expected[expected.length - 1];

  const feed = await fetchFeed({ start, end, results: MAX_MESSAGES_PER_BATCH });
  if (!feed.ok) return apiFailure(feed.code, requestId);

  const summary = summarizeVerification(
    expected,
    feed.data.readings.map((reading) => reading.createdAt),
  );

  return apiSuccess({ ...summary, range: { start, end } }, requestId);
}
