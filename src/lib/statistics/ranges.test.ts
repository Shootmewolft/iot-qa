import { describe, expect, it } from "vitest";

import {
  DEFAULT_RANGE,
  isRangePreset,
  planWindows,
  RANGE_PRESETS,
  resolvePreset,
} from "@/lib/statistics/ranges";

const NOW = new Date("2026-08-30T12:00:00.000Z");

describe("resolvePreset", () => {
  it("resolves the last hour", () => {
    expect(resolvePreset("1h", NOW)).toEqual({
      start: "2026-08-30T11:00:00.000Z",
      end: "2026-08-30T12:00:00.000Z",
    });
  });

  it("resolves 30 days", () => {
    expect(resolvePreset("30d", NOW).start).toBe("2026-07-31T12:00:00.000Z");
  });

  it("leaves 'all' unbounded", () => {
    expect(resolvePreset("all", NOW)).toEqual({ start: null, end: null });
  });

  it("resolves every shipped preset", () => {
    for (const preset of RANGE_PRESETS) {
      expect(() => resolvePreset(preset.id, NOW)).not.toThrow();
    }
  });
});

describe("isRangePreset", () => {
  it("accepts the shipped ids and rejects anything else", () => {
    expect(isRangePreset(DEFAULT_RANGE)).toBe(true);
    expect(isRangePreset("1h")).toBe(true);
    expect(isRangePreset("../../etc/passwd")).toBe(false);
    expect(isRangePreset("")).toBe(false);
  });
});

describe("planWindows", () => {
  it("leaves a short range in one window", () => {
    const plan = planWindows(resolvePreset("1h", NOW));

    expect(plan.windows).toHaveLength(1);
    expect(plan.split).toBe(false);
  });

  it("splits a 30-day range so nothing is silently truncated", () => {
    // At one reading every 20 seconds, 30 days holds ~129,600 entries and a
    // single read returns at most 8,000.
    const plan = planWindows(resolvePreset("30d", NOW));

    expect(plan.split).toBe(true);
    expect(plan.windows.length).toBeGreaterThan(1);
  });

  it("produces contiguous windows with no gaps", () => {
    const plan = planWindows(resolvePreset("7d", NOW));

    for (let i = 1; i < plan.windows.length; i++) {
      expect(plan.windows[i].start).toBe(plan.windows[i - 1].end);
    }
  });

  it("never runs past the end of the range", () => {
    const range = resolvePreset("30d", NOW);
    const plan = planWindows(range);

    expect(plan.windows[0].start).toBe(range.start);
    expect(plan.windows[plan.windows.length - 1].end).toBe(range.end);
  });

  it("splits more finely for a faster cadence", () => {
    const range = resolvePreset("7d", NOW);

    const slow = planWindows(range, 60);
    const fast = planWindows(range, 2);

    expect(fast.windows.length).toBeGreaterThan(slow.windows.length);
  });

  it("does not split an unbounded range", () => {
    expect(planWindows({ start: null, end: null }).split).toBe(false);
  });

  it("does not split an inverted or empty range", () => {
    expect(
      planWindows({ start: NOW.toISOString(), end: NOW.toISOString() }).split,
    ).toBe(false);
  });
});
