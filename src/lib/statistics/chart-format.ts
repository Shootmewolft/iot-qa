export function formatMeasurementTick(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(1);
}
