export type CorrelationResult = {
  /** Pearson's r, between -1 and 1. NaN when it cannot be computed. */
  r: number;
  /** Number of paired samples actually used. */
  pairs: number;
  /** Plain-language reading of the coefficient, for the report. */
  interpretation: string;
};

function describeStrength(r: number): string {
  if (Number.isNaN(r)) return "No se puede calcular con estos datos.";

  const magnitude = Math.abs(r);
  const direction = r < 0 ? "inversa" : "directa";

  if (magnitude < 0.1) return "Prácticamente sin relación lineal.";
  if (magnitude < 0.3) return `Relación ${direction} muy débil.`;
  if (magnitude < 0.5) return `Relación ${direction} débil.`;
  if (magnitude < 0.7) return `Relación ${direction} moderada.`;
  if (magnitude < 0.9) return `Relación ${direction} fuerte.`;
  return `Relación ${direction} muy fuerte.`;
}

/**
 * Pearson correlation between two series (spec section 18).
 *
 * Only PAIRS where both values are present are used. Dropping a value from
 * one series but keeping its partner would silently pair readings that never
 * happened together — and an entry with only one field is exactly what the
 * "clear a single field" maintenance path leaves behind.
 */
export function pearson(
  xs: (number | null | undefined)[],
  ys: (number | null | undefined)[],
): CorrelationResult {
  const pairs: [number, number][] = [];

  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const x = xs[i];
    const y = ys[i];
    if (typeof x !== "number" || !Number.isFinite(x)) continue;
    if (typeof y !== "number" || !Number.isFinite(y)) continue;
    pairs.push([x, y]);
  }

  // Two points always sit on a line, so r would be exactly ±1 and mean
  // nothing. Below three pairs the coefficient is not reported.
  if (pairs.length < 3) {
    return {
      r: Number.NaN,
      pairs: pairs.length,
      interpretation: "Hacen falta al menos 3 mediciones con ambos campos.",
    };
  }

  const n = pairs.length;
  const meanX = pairs.reduce((sum, [x]) => sum + x, 0) / n;
  const meanY = pairs.reduce((sum, [, y]) => sum + y, 0) / n;

  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;

  for (const [x, y] of pairs) {
    const dx = x - meanX;
    const dy = y - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }

  // A constant series has zero variance, and r is undefined rather than zero.
  if (varianceX === 0 || varianceY === 0) {
    return {
      r: Number.NaN,
      pairs: n,
      interpretation:
        "Una de las dos series no varía, así que la correlación no está definida.",
    };
  }

  const r = covariance / Math.sqrt(varianceX * varianceY);

  // Floating-point error can push a perfect correlation just past ±1.
  const clamped = Math.min(1, Math.max(-1, r));

  return { r: clamped, pairs: n, interpretation: describeStrength(clamped) };
}
