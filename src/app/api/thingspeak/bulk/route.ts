import { z } from "zod";

import {
  firstRejection,
  guardJsonContentType,
  guardOrigin,
  guardSession,
} from "@/lib/api/guards";
import { apiFailure, apiSuccess, newRequestId } from "@/lib/api/response";
import { DHT22_LIMITS } from "@/lib/generator/types";
import { bulkWrite } from "@/lib/thingspeak/bulk";
import { MAX_MESSAGES_PER_BATCH } from "@/lib/upload/batching";

const measurementSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  temperature: z
    .number()
    .min(DHT22_LIMITS.temperature.min)
    .max(DHT22_LIMITS.temperature.max),
  humidity: z
    .number()
    .min(DHT22_LIMITS.humidity.min)
    .max(DHT22_LIMITS.humidity.max),
});

const bodySchema = z.object({
  jobId: z.string().min(1).max(64),
  batchIndex: z.number().int().min(0),
  measurements: z.array(measurementSchema).min(1).max(MAX_MESSAGES_PER_BATCH),
});

/**
 * Sends one batch to ThingSpeak (MVP spec, section 15.3).
 *
 * Deliberately handles a SINGLE batch and returns: a Vercel function must not
 * sit waiting between batches. The browser owns the schedule and the 15-second
 * gap (spec section 15.5).
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
  if (!body.success) {
    /*
     * The issue PATH matters, not just its code: an out-of-range
     * temperature also reports `too_big`, and diagnosing that as
     * "batch too large" would send the operator hunting the wrong problem.
     * Only a `too_big` on the array itself means the batch is oversized.
     */
    const oversizedBatch = body.error.issues.some(
      (issue) =>
        issue.code === "too_big" &&
        issue.path.length === 1 &&
        issue.path[0] === "measurements",
    );

    return apiFailure(
      oversizedBatch ? "BATCH_TOO_LARGE" : "REQUEST_INVALID",
      requestId,
    );
  }

  const { measurements } = body.data;

  // Checked here rather than trusting the client: ThingSpeak rejects the whole
  // batch on one duplicate, and a wasted call also burns the 15-second window.
  const timestamps = new Set(measurements.map((row) => row.createdAt));
  if (timestamps.size !== measurements.length) {
    return apiFailure("TIMESTAMP_DUPLICATED", requestId);
  }

  const result = await bulkWrite(measurements);

  if (!result.ok) {
    return apiFailure(result.code, requestId);
  }

  return apiSuccess(
    {
      jobId: body.data.jobId,
      batchIndex: body.data.batchIndex,
      accepted: result.data.accepted,
    },
    requestId,
  );
}
