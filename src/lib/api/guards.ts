import "server-only";

import { apiFailure } from "@/lib/api/response";
import { getSession } from "@/lib/auth/dal";
import { appOrigin } from "@/lib/env";

/**
 * Guards every protected Route Handler. Returns a Response to send back when
 * the request must be rejected, or null when it may proceed.
 *
 * The proxy already redirects browsers without a cookie, but a Route Handler
 * is reachable directly, so it must verify on its own (spec section 5.4).
 */
export async function guardSession(requestId: string) {
  const session = await getSession();
  return session ? null : apiFailure("SESSION_EXPIRED", requestId);
}

/**
 * Rejects cross-site writes. When APP_ORIGIN is unset we are running locally
 * and there is no canonical origin to compare against, so the check is skipped
 * rather than guessed at.
 */
export function guardOrigin(request: Request, requestId: string) {
  const expected = appOrigin();
  if (!expected) return null;

  const origin = request.headers.get("origin");
  return origin === expected
    ? null
    : apiFailure("ORIGIN_NOT_ALLOWED", requestId);
}

/** Rejects anything that is not a JSON body on a write. */
export function guardJsonContentType(request: Request, requestId: string) {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.toLowerCase().startsWith("application/json")
    ? null
    : apiFailure("CONTENT_TYPE_INVALID", requestId);
}

/** Runs guards in order and returns the first rejection, if any. */
export function firstRejection(
  ...results: (Response | null)[]
): Response | null {
  return results.find((result) => result !== null) ?? null;
}
