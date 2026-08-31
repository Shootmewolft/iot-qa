import { guardSession } from "@/lib/api/guards";
import { apiSuccess, newRequestId } from "@/lib/api/response";
import { configurationReport } from "@/lib/env";
import { fetchChannelStatus } from "@/lib/thingspeak/client";

/**
 * Connectivity and configuration diagnostics.
 *
 * Reports only WHETHER each secret is configured, never its value
 * (MVP spec, section 5.5). Always answers 200 when the session is valid: a
 * failing channel is diagnostic information, not a failed request.
 */
export async function GET() {
  const requestId = newRequestId();

  const rejected = await guardSession(requestId);
  if (rejected) return rejected;

  const result = await fetchChannelStatus();

  if (!result.ok) {
    return apiSuccess(
      {
        configuration: configurationReport(),
        channel: null,
        lastReading: null,
        reachable: false,
        errorCode: result.code,
      },
      requestId,
    );
  }

  return apiSuccess(
    {
      configuration: configurationReport(),
      channel: result.data.channel,
      lastReading: result.data.readings.at(-1) ?? null,
      reachable: true,
      errorCode: null,
    },
    requestId,
  );
}
