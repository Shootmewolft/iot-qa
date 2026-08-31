import { MAX_RESULTS_PER_READ } from "@/lib/thingspeak/query";

/** Presets offered by the dashboard filter (spec section 18). */
export const RANGE_PRESETS = [
  { id: "1h", label: "Última hora", minutes: 60 },
  { id: "24h", label: "24 horas", minutes: 60 * 24 },
  { id: "7d", label: "7 días", minutes: 60 * 24 * 7 },
  { id: "30d", label: "30 días", minutes: 60 * 24 * 30 },
  { id: "all", label: "Todo", minutes: 0 },
] as const;

export type RangePresetId = (typeof RANGE_PRESETS)[number]["id"];

export const DEFAULT_RANGE: RangePresetId = "30d";

export type TimeRange = {
  /** ISO instant, or null to mean "no lower bound". */
  start: string | null;
  end: string | null;
};

export function isRangePreset(value: string): value is RangePresetId {
  return RANGE_PRESETS.some((preset) => preset.id === value);
}

export function resolvePreset(id: RangePresetId, now = new Date()): TimeRange {
  const preset = RANGE_PRESETS.find((p) => p.id === id);
  if (!preset || preset.minutes === 0) return { start: null, end: null };

  return {
    start: new Date(now.getTime() - preset.minutes * 60_000).toISOString(),
    end: now.toISOString(),
  };
}

export type WindowPlan = {
  windows: TimeRange[];
  /**
   * True when the range had to be split because it could hold more than
   * ThingSpeak returns in one read. Splitting is what keeps a "30 days"
   * view from silently showing only its last 8,000 entries.
   */
  split: boolean;
};

/**
 * Splits a range into windows that each fit under the 8,000-result ceiling.
 *
 * The estimate uses the device's own cadence: at one reading every 20 seconds
 * a window of 8,000 covers about 44 hours. Overestimating the cadence only
 * costs an extra request; underestimating would silently drop data, so the
 * window is deliberately conservative.
 */
export function planWindows(
  range: TimeRange,
  expectedSecondsPerReading = 20,
): WindowPlan {
  if (!range.start || !range.end) {
    return { windows: [range], split: false };
  }

  const startMs = new Date(range.start).getTime();
  const endMs = new Date(range.end).getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return { windows: [range], split: false };
  }

  // Half the theoretical capacity, so a burst of faster readings still fits.
  const windowMs =
    (MAX_RESULTS_PER_READ / 2) * expectedSecondsPerReading * 1000;
  const totalMs = endMs - startMs;

  if (totalMs <= windowMs) return { windows: [range], split: false };

  const windows: TimeRange[] = [];
  for (let cursor = startMs; cursor < endMs; cursor += windowMs) {
    windows.push({
      start: new Date(cursor).toISOString(),
      end: new Date(Math.min(cursor + windowMs, endMs)).toISOString(),
    });
  }

  return { windows, split: true };
}
