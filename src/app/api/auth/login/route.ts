import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import {
  firstRejection,
  guardJsonContentType,
  guardOrigin,
} from "@/lib/api/guards";
import { apiFailure, apiSuccess, newRequestId } from "@/lib/api/response";
import { setSessionCookie } from "@/lib/auth/dal";
import { createSessionToken } from "@/lib/auth/session";
import { appPassword } from "@/lib/env";

const loginSchema = z.object({
  password: z.string().min(1).max(512),
});

/**
 * Compares two secrets without leaking their length or contents through
 * timing. Both sides are hashed first so the buffers always match in size,
 * which `timingSafeEqual` requires.
 */
function secretsMatch(candidate: string, expected: string): boolean {
  const digest = (value: string) =>
    createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}

export async function POST(request: Request) {
  const requestId = newRequestId();

  const rejected = firstRejection(
    guardOrigin(request, requestId),
    guardJsonContentType(request, requestId),
  );
  if (rejected) return rejected;

  let expected: string;
  try {
    expected = appPassword();
  } catch {
    // Never echo the underlying message: it names the missing variable.
    return apiFailure("SERVER_MISCONFIGURED", requestId);
  }

  const body = loginSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiFailure("REQUEST_INVALID", requestId);

  if (!secretsMatch(body.data.password, expected)) {
    return apiFailure("AUTH_INVALID", requestId);
  }

  await setSessionCookie(await createSessionToken());

  return apiSuccess({ authenticated: true }, requestId);
}
