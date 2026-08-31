import { describe, expect, it } from "vitest";

import { MIN_SECONDS_BETWEEN_BATCHES } from "@/lib/upload/batching";
import {
  backoffSeconds,
  decideAfterVerification,
  decideNextAction,
  MAX_AUTOMATIC_ATTEMPTS,
} from "@/lib/upload/policy";

describe("decideNextAction", () => {
  it("confirms a successful batch", () => {
    expect(decideNextAction({ kind: "ok" }, 0)).toEqual({ action: "confirm" });
  });

  it("VERIFIES a timeout instead of retrying it", () => {
    // The whole point of the policy: a timeout is not a failure. ThingSpeak
    // may hold the rows, and a blind retry would duplicate timestamps and
    // reject the entire batch.
    expect(decideNextAction({ kind: "timeout" }, 0).action).toBe("verify");
  });

  it("VERIFIES a 5xx instead of retrying it", () => {
    expect(decideNextAction({ kind: "http", status: 500 }, 0).action).toBe(
      "verify",
    );
    expect(decideNextAction({ kind: "http", status: 503 }, 0).action).toBe(
      "verify",
    );
  });

  it("waits on a 429 and gives up after three attempts", () => {
    expect(decideNextAction({ kind: "http", status: 429 }, 0)).toEqual({
      action: "wait",
      seconds: MIN_SECONDS_BETWEEN_BATCHES,
    });
    expect(decideNextAction({ kind: "http", status: 429 }, 1).action).toBe(
      "wait",
    );
    expect(
      decideNextAction(
        { kind: "http", status: 429 },
        MAX_AUTOMATIC_ATTEMPTS - 1,
      ).action,
    ).toBe("stop");
  });

  it("fails hard on a rejected credential", () => {
    expect(decideNextAction({ kind: "http", status: 401 }, 0).action).toBe(
      "fail",
    );
    expect(decideNextAction({ kind: "http", status: 403 }, 0).action).toBe(
      "fail",
    );
  });

  it("fails rather than retrying a 400", () => {
    // The same bytes would fail identically; retrying only wastes the window.
    expect(decideNextAction({ kind: "http", status: 400 }, 0).action).toBe(
      "fail",
    );
  });

  it("pauses when the browser is offline", () => {
    expect(decideNextAction({ kind: "offline" }, 0).action).toBe("stop");
  });

  it("always explains a non-confirming decision", () => {
    const outcomes = [
      { kind: "timeout" as const },
      { kind: "offline" as const },
      { kind: "http" as const, status: 401 },
      { kind: "http" as const, status: 500 },
      { kind: "http" as const, status: 400 },
    ];

    for (const outcome of outcomes) {
      const decision = decideNextAction(outcome, 0);
      expect("reason" in decision && decision.reason.length).toBeGreaterThan(
        10,
      );
    }
  });
});

describe("backoffSeconds", () => {
  it("never goes below the mandatory 15-second gap", () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(backoffSeconds(attempt)).toBeGreaterThanOrEqual(
        MIN_SECONDS_BETWEEN_BATCHES,
      );
    }
  });

  it("climbs 15, 30, 60 and then holds", () => {
    expect(backoffSeconds(0)).toBe(15);
    expect(backoffSeconds(1)).toBe(30);
    expect(backoffSeconds(2)).toBe(60);
    expect(backoffSeconds(9)).toBe(60);
  });
});

describe("decideAfterVerification", () => {
  it("confirms when every row is present", () => {
    expect(decideAfterVerification("all")).toEqual({ action: "confirm" });
  });

  it("allows a resend when nothing landed", () => {
    expect(decideAfterVerification("none").action).toBe("wait");
  });

  it("STOPS on a partial batch rather than guessing", () => {
    // Continuing would either duplicate rows or leave a hole. Neither is
    // recoverable automatically, so a human decides (spec section 16).
    const decision = decideAfterVerification("partial");

    expect(decision.action).toBe("stop");
    expect("reason" in decision && decision.reason).toContain("manual");
  });
});
