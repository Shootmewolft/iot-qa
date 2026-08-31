/**
 * Display timezone for the operator. Timestamps are stored and transported in
 * UTC; only presentation is localized (spec section 12.5).
 *
 * The timezone is pinned explicitly rather than taken from the runtime so
 * that a Server Component and the browser format a value identically and
 * hydration cannot mismatch.
 */
export const DISPLAY_TIME_ZONE = "America/Bogota";

const dateTimeFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: DISPLAY_TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "medium",
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}

export function formatMeasurement(
  value: number | null | undefined,
  unit: string,
  decimals = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toFixed(decimals)} ${unit}`;
}
