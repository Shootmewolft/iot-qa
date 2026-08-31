import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSessionToken,
  SESSION_MAX_AGE_SECONDS,
  verifySessionToken,
} from "@/lib/auth/session";

const SECRET = "a-test-secret-that-is-long-enough-32+";
const key = () => new TextEncoder().encode(SECRET);

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", SECRET);
});

describe("createSessionToken", () => {
  it("issues a token that verifies", async () => {
    const session = await verifySessionToken(await createSessionToken());

    expect(session).not.toBeNull();
    expect(session?.role).toBe("operator");
  });

  it("signs an expiry matching the configured lifetime", async () => {
    const session = await verifySessionToken(await createSessionToken());

    if (!session) throw new Error("expected a valid session");
    // The lifetime is carried in the token itself, not just in the cookie.
    expect(session.exp - session.iat).toBe(SESSION_MAX_AGE_SECONDS);
  });
});

describe("verifySessionToken", () => {
  it("rejects a missing token", async () => {
    expect(await verifySessionToken(undefined)).toBeNull();
  });

  it("rejects a malformed token", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const forged = await new SignJWT({ role: "operator" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("thingspeak-qa")
      .setAudience("thingspeak-qa:operator")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-completely-different-secret-32+++"));

    expect(await verifySessionToken(forged)).toBeNull();
  });

  it("rejects an expired token even though the signature is valid", async () => {
    const expired = await new SignJWT({ role: "operator" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("thingspeak-qa")
      .setAudience("thingspeak-qa:operator")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(key());

    expect(await verifySessionToken(expired)).toBeNull();
  });

  it("rejects a token without an expiry", async () => {
    const eternal = await new SignJWT({ role: "operator" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("thingspeak-qa")
      .setAudience("thingspeak-qa:operator")
      .setIssuedAt()
      .sign(key());

    expect(await verifySessionToken(eternal)).toBeNull();
  });

  it("rejects a token issued for another audience", async () => {
    const otherAudience = await new SignJWT({ role: "operator" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("thingspeak-qa")
      .setAudience("someone-else")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key());

    expect(await verifySessionToken(otherAudience)).toBeNull();
  });

  it("rejects a token whose role claim was tampered with", async () => {
    const escalated = await new SignJWT({ role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("thingspeak-qa")
      .setAudience("thingspeak-qa:operator")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key());

    expect(await verifySessionToken(escalated)).toBeNull();
  });
});
