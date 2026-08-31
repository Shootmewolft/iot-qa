import { describe, expect, it } from "vitest";

import {
  formatDuration,
  MAX_MESSAGES_PER_BATCH,
  MIN_SECONDS_BETWEEN_BATCHES,
  planBatches,
} from "@/lib/upload/batching";

describe("planBatches", () => {
  it("fits a small dataset in a single batch with no waiting", () => {
    const plan = planBatches(500);

    expect(plan.totalBatches).toBe(1);
    expect(plan.minimumDurationSeconds).toBe(0);
  });

  it("splits 10,000 rows into 11 batches", () => {
    const plan = planBatches(10_000);

    // ceil(10000 / 960) = 11, matching the spec's own worked example.
    expect(plan.totalBatches).toBe(11);
    expect(plan.minimumDurationSeconds).toBe(10 * MIN_SECONDS_BETWEEN_BATCHES);
  });

  it("counts the gaps between batches, not one per batch", () => {
    const plan = planBatches(MAX_MESSAGES_PER_BATCH * 2);

    expect(plan.totalBatches).toBe(2);
    expect(plan.minimumDurationSeconds).toBe(MIN_SECONDS_BETWEEN_BATCHES);
  });

  it("uses exactly one batch at the boundary", () => {
    expect(planBatches(MAX_MESSAGES_PER_BATCH).totalBatches).toBe(1);
    expect(planBatches(MAX_MESSAGES_PER_BATCH + 1).totalBatches).toBe(2);
  });

  it("never exceeds the free-account ceiling, even if asked to", () => {
    expect(planBatches(5000, 5000).batchSize).toBe(MAX_MESSAGES_PER_BATCH);
  });

  it("handles an empty dataset", () => {
    const plan = planBatches(0);

    expect(plan.totalBatches).toBe(0);
    expect(plan.minimumDurationSeconds).toBe(0);
  });
});

describe("formatDuration", () => {
  it("describes an instant plan", () => {
    expect(formatDuration(0)).toBe("inmediato");
  });

  it("formats seconds, minutes and hours", () => {
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(150)).toBe("2 min 30 s");
    expect(formatDuration(3720)).toBe("1 h 2 min");
  });
});
