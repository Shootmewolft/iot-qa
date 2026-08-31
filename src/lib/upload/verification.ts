export type VerificationOutcome = "none" | "all" | "partial";

export type VerificationSummary = {
  outcome: VerificationOutcome;
  expected: number;
  found: number;
  missing: number;
};

/**
 * Normalizes a timestamp to a single canonical representation.
 *
 * ThingSpeak echoes "2026-08-30T19:21:28Z" while our mapper emits
 * "2026-08-30T19:21:28.000Z", and an operator's file may carry an offset like
 * "-05:00". Comparing the raw strings makes rows that DO exist look missing,
 * which tells the runner a resend is safe and gets the whole batch rejected
 * for duplicate timestamps — the exact failure section 16 exists to prevent.
 */
export function canonicalTimestamp(value: string): string {
  return new Date(value).toISOString();
}

/**
 * Compares what a batch was supposed to write against what the channel holds.
 *
 * "partial" is the outcome that matters: continuing would either duplicate
 * rows or leave a hole, and neither is recoverable automatically.
 */
export function summarizeVerification(
  expectedTimestamps: string[],
  channelTimestamps: string[],
): VerificationSummary {
  const expected = [...new Set(expectedTimestamps.map(canonicalTimestamp))];
  const present = new Set(channelTimestamps.map(canonicalTimestamp));
  const found = expected.filter((timestamp) => present.has(timestamp)).length;

  return {
    outcome:
      found === 0 ? "none" : found === expected.length ? "all" : "partial",
    expected: expected.length,
    found,
    missing: expected.length - found,
  };
}
