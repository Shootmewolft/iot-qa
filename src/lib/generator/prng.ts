/**
 * Deterministic pseudo-random number generation.
 *
 * The whole point is reproducibility: the same seed and the same
 * configuration must yield byte-identical datasets, so a QA run can be
 * replayed and an anomaly re-examined (spec section 12.4). `Math.random()`
 * cannot do this, so we carry our own generator.
 */

/**
 * Hashes an arbitrary seed string into a 32-bit integer.
 * xmur3 — chosen because it avalanches well, so "aula-1" and "aula-2"
 * produce unrelated streams rather than neighbouring ones.
 */
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;

  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);

  h ^= h >>> 16;
  return h >>> 0;
}

export type Prng = {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal, mean 0 and standard deviation 1. */
  normal(): number;
};

/**
 * mulberry32: 32 bits of state, uniform output, and fast. More than enough
 * for synthetic sensor data, and small enough to stay auditable.
 */
export function createPrng(seed: string): Prng {
  let state = hashSeed(seed);

  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /**
   * Box-Muller. The second variate of each pair is cached so no draw is
   * wasted, which keeps the stream stable for a given seed.
   */
  let spare: number | null = null;

  const normal = () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }

    // `next()` can return exactly 0, and log(0) is -Infinity.
    let u = next();
    while (u === 0) u = next();

    const v = next();
    const magnitude = Math.sqrt(-2 * Math.log(u));

    spare = magnitude * Math.sin(2 * Math.PI * v);
    return magnitude * Math.cos(2 * Math.PI * v);
  };

  return { next, normal };
}
