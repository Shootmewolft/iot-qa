/**
 * Helpers for `<input type="datetime-local">`, which speaks the browser's
 * local time and has no timezone at all. Everything else in the app carries
 * UTC, so the boundary is converted here, in one place.
 */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** ISO instant to the `YYYY-MM-DDTHH:mm:ss` an input expects, in local time. */
export function isoToLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** Local input value back to an ISO instant, or null when unparseable. */
export function localInputToIso(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** e.g. "UTC-5", to label a local-time field unambiguously. */
export function localOffsetLabel(date = new Date()): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;

  return `UTC${sign}${hours}${rest > 0 ? `:${pad(rest)}` : ""}`;
}
