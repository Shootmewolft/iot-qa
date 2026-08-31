import "server-only";

import { jwtVerify, SignJWT } from "jose";

import { sessionSecret } from "@/lib/env";

export const SESSION_COOKIE = "tsqa_session";

/**
 * Session lifetime.
 *
 * Deliberately long: this is an internal tool used by a small team over a
 * short-lived deployment, and being logged out mid-upload would be worse than
 * the risk a shorter window buys. The lifetime is still ENFORCED — the `exp`
 * claim below is signed into the token and checked by `jwtVerify` on every
 * request. Cookie `maxAge` alone is only a hint to the browser and proves
 * nothing about a token that is replayed by hand.
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const ISSUER = "thingspeak-qa";
const AUDIENCE = "thingspeak-qa:operator";

export type SessionPayload = {
  /** Single role in the MVP (spec section 6). */
  role: "operator";
  /** Issued-at, seconds since epoch. */
  iat: number;
  /** Expiry, seconds since epoch. */
  exp: number;
};

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: "operator" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(sessionSecret());
}

/**
 * Verifies signature, issuer, audience and expiry. Returns null for anything
 * that does not check out, so callers never have to distinguish "tampered"
 * from "expired" — both mean "no session".
 */
export async function verifySessionToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      requiredClaims: ["exp", "iat"],
    });

    if (payload.role !== "operator") return null;

    return {
      role: "operator",
      iat: payload.iat as number,
      exp: payload.exp as number,
    };
  } catch {
    return null;
  }
}
