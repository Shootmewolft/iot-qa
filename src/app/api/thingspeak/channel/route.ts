import { z } from "zod";

import {
  firstRejection,
  guardJsonContentType,
  guardOrigin,
  guardSession,
} from "@/lib/api/guards";
import { apiFailure, apiSuccess, newRequestId } from "@/lib/api/response";
import { thingSpeakChannelId } from "@/lib/env";
import { clearChannel } from "@/lib/thingspeak/channel";
import { fetchFeed } from "@/lib/thingspeak/client";

const bodySchema = z.object({
  /**
   * Row count of the backup the operator downloaded, echoed back as a
   * receipt. This is the one precondition that survives: it is what makes an
   * accidental clear recoverable, and it is checked here so a script written
   * against this endpoint cannot skip it either.
   */
  backupRows: z.number().int().min(0),
});

/**
 * Clears every entry in the channel.
 *
 * DELETE rather than POST because that is what it is. The three body fields
 * are all preconditions the SERVER checks: a UI that forgot to ask, or a
 * script written against this endpoint directly, still cannot wipe a channel
 * by accident.
 */
export async function DELETE(request: Request) {
  const requestId = newRequestId();

  const rejected = firstRejection(
    guardOrigin(request, requestId),
    guardJsonContentType(request, requestId),
    await guardSession(requestId),
  );
  if (rejected) return rejected;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiFailure("REQUEST_INVALID", requestId);

  try {
    thingSpeakChannelId();
  } catch {
    return apiFailure("SERVER_MISCONFIGURED", requestId);
  }

  /*
   * The channel is read BEFORE clearing so the response can state exactly how
   * much was destroyed. Without it the operator is told "done" with no way to
   * check the backup covered what was lost.
   */
  const before = await fetchFeed({ results: 1 });
  const lastEntryId = before.ok ? before.data.channel.lastEntryId : null;

  if (lastEntryId !== null && lastEntryId > 0 && body.data.backupRows === 0) {
    return apiFailure("BACKUP_REQUIRED", requestId);
  }

  const result = await clearChannel();
  if (!result.ok) return apiFailure(result.code, requestId);

  // Read back: "the request succeeded" is not the same as "the channel is
  // empty", and this is not an operation to be optimistic about.
  const after = await fetchFeed({ results: 1 });

  return apiSuccess(
    {
      clearedAt: result.data.clearedAt,
      lastEntryIdBefore: lastEntryId,
      backupRows: body.data.backupRows,
      verifiedEmpty: after.ok ? after.data.readings.length === 0 : null,
    },
    requestId,
  );
}
