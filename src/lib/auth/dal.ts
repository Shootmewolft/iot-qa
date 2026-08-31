import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  type SessionPayload,
  verifySessionToken,
} from "@/lib/auth/session";
import { isProduction } from "@/lib/env";

/**
 * Data Access Layer for authentication.
 *
 * `proxy.ts` only performs an optimistic cookie check to keep prefetches cheap.
 * Every protected page and every protected Route Handler re-verifies here,
 * close to the data. See the MVP spec, section 5.4.
 */

/** Reads and verifies the session. Memoized per render pass. */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
});

/** Verifies the session or redirects to the login screen. For pages. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
