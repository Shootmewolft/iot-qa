import { describe, expect, it } from "vitest";

import { isoToLocalInput, localInputToIso } from "@/lib/datetime";

describe("datetime-local conversion", () => {
  it("round-trips an instant through the input format", () => {
    const iso = "2026-08-01T13:00:00.000Z";
    const roundTripped = localInputToIso(isoToLocalInput(iso));

    expect(roundTripped).toBe(iso);
  });

  it("returns an empty string for an unparseable instant", () => {
    expect(isoToLocalInput("nope")).toBe("");
  });

  it("returns null for empty or invalid input", () => {
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("nope")).toBeNull();
  });
});
