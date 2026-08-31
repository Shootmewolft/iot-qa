import { describe, expect, it } from "vitest";

import {
  canonicalTimestamp,
  summarizeVerification,
} from "@/lib/upload/verification";

/** The three spellings of one instant that this system actually produces. */
const SAME_INSTANT = [
  "2026-08-30T19:21:28Z",
  "2026-08-30T19:21:28.000Z",
  "2026-08-30T14:21:28-05:00",
];

describe("canonicalTimestamp", () => {
  it("collapses every spelling of an instant to one string", () => {
    const canonical = SAME_INSTANT.map(canonicalTimestamp);
    expect(new Set(canonical).size).toBe(1);
  });
});

describe("summarizeVerification", () => {
  it("reports 'all' regardless of how the timestamps are written", () => {
    // Regression: comparing raw strings made ThingSpeak's own "…:28Z" fail to
    // match our mapper's "…:28.000Z", so three rows that DO exist reported as
    // missing. The runner would then have resent them and had the whole batch
    // rejected for duplicates.
    for (const written of SAME_INSTANT) {
      for (const stored of SAME_INSTANT) {
        expect(summarizeVerification([written], [stored]).outcome).toBe("all");
      }
    }
  });

  it("reports 'none' when nothing landed, so a resend is safe", () => {
    const summary = summarizeVerification(
      ["2027-06-01T10:00:00Z", "2027-06-01T10:00:20Z"],
      ["2026-08-30T19:21:28Z"],
    );

    expect(summary).toEqual({
      outcome: "none",
      expected: 2,
      found: 0,
      missing: 2,
    });
  });

  it("reports 'partial' when only some rows landed", () => {
    const summary = summarizeVerification(
      ["2026-08-01T13:00:00Z", "2026-08-01T13:00:20Z", "2026-08-01T13:00:40Z"],
      ["2026-08-01T13:00:00.000Z", "2026-08-01T13:00:20.000Z"],
    );

    expect(summary.outcome).toBe("partial");
    expect(summary.found).toBe(2);
    expect(summary.missing).toBe(1);
  });

  it("counts a duplicated expectation only once", () => {
    const summary = summarizeVerification(
      ["2026-08-01T13:00:00Z", "2026-08-01T13:00:00.000Z"],
      ["2026-08-01T13:00:00Z"],
    );

    expect(summary.expected).toBe(1);
    expect(summary.outcome).toBe("all");
  });

  it("ignores channel entries outside the batch", () => {
    const summary = summarizeVerification(
      ["2026-08-01T13:00:00Z"],
      ["2026-08-01T13:00:00Z", "2026-08-01T13:00:20Z", "2026-08-01T13:00:40Z"],
    );

    expect(summary.outcome).toBe("all");
    expect(summary.expected).toBe(1);
  });

  it("reports 'none' against an empty channel", () => {
    expect(summarizeVerification(["2026-08-01T13:00:00Z"], []).outcome).toBe(
      "none",
    );
  });
});

/**
 * Regression for the behaviour verified against the live ThingSpeak API on
 * 2026-08-30, which contradicts its own documentation:
 *
 *   - Re-sending a batch whose timestamps already exist returns
 *     `{"success": true}` and writes NOTHING.
 *   - A batch of 30 duplicates plus 30 brand-new rows also returns
 *     `{"success": true}` and writes NEITHER half.
 *
 * The write response therefore proves nothing, and every batch has to be read
 * back before it can be counted as confirmed.
 */
describe("a reported success is not proof", () => {
  it("detects a silently rejected batch as 'none'", () => {
    const sent = [
      "2026-09-01T12:00:00.000Z",
      "2026-09-01T12:00:20.000Z",
      "2026-09-01T12:00:40.000Z",
    ];

    // The channel holds other rows, but none of the ones we just "wrote".
    const summary = summarizeVerification(sent, ["2026-08-30T19:21:28Z"]);

    expect(summary.outcome).toBe("none");
    expect(summary.found).toBe(0);
  });

  it("detects an all-or-nothing rejection of a half-new batch", () => {
    const duplicates = ["2026-09-01T12:00:00.000Z", "2026-09-01T12:00:20.000Z"];
    const brandNew = ["2026-09-02T08:00:00.000Z", "2026-09-02T08:00:20.000Z"];

    // ThingSpeak keeps the pre-existing rows and writes none of the new ones.
    const summary = summarizeVerification(
      [...duplicates, ...brandNew],
      duplicates,
    );

    // "partial" is correct here and must stop the runner: the operator has to
    // decide, because neither resending nor skipping is safe.
    expect(summary.outcome).toBe("partial");
    expect(summary.found).toBe(2);
    expect(summary.missing).toBe(2);
  });
});
