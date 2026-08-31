import { z } from "zod";

import { guardSession } from "@/lib/api/guards";
import { apiFailure, apiSuccess, newRequestId } from "@/lib/api/response";
import { fetchFeed } from "@/lib/thingspeak/client";
import { MAX_RESULTS_PER_READ } from "@/lib/thingspeak/query";

const querySchema = z
  .object({
    results: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_RESULTS_PER_READ)
      .optional(),
    start: z.iso.datetime({ offset: true }).optional(),
    end: z.iso.datetime({ offset: true }).optional(),
  })
  .refine(
    (value) => !value.start || !value.end || value.start <= value.end,
    "start must not be after end",
  );

export async function GET(request: Request) {
  const requestId = newRequestId();

  const rejected = await guardSession(requestId);
  if (rejected) return rejected;

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = querySchema.safeParse(params);
  if (!query.success) return apiFailure("REQUEST_INVALID", requestId);

  const result = await fetchFeed(query.data);
  if (!result.ok) return apiFailure(result.code, requestId);

  return apiSuccess(
    {
      channel: result.data.channel,
      readings: result.data.readings,
      count: result.data.readings.length,
      /*
       * Tells the caller the answer may be incomplete. ThingSpeak silently
       * truncates at 8,000, and a backup that does not notice would destroy
       * data it believed it had saved (spec sections 18 and 20.2).
       */
      truncated: result.data.readings.length >= MAX_RESULTS_PER_READ,
      maxResultsPerRead: MAX_RESULTS_PER_READ,
    },
    requestId,
  );
}
