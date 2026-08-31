/**
 * Physical limits of the DHT22 sensor the project uses (spec section 12.2).
 * Generating a value the real hardware could never report would make the
 * dataset useless as QA evidence.
 */
export const DHT22_LIMITS = {
  temperature: { min: -40, max: 80 },
  humidity: { min: 0, max: 100 },
} as const;

export const GENERATOR_LIMITS = {
  rows: { min: 1, max: 10_000 },
  intervalSeconds: { min: 1, max: 86_400 },
  decimals: { min: 0, max: 2 },
} as const;

export type RangeConfig = {
  min: number;
  max: number;
  base: number;
  /** Peak-to-base swing of the daily cycle, in the variable's own unit. */
  dailyAmplitude: number;
  /** Standard deviation of the noise term, in the variable's own unit. */
  noise: number;
};

export type GeneratorConfig = {
  /** How many measurements to produce. */
  count: number;
  /** ISO 8601 timestamp of the first measurement. */
  startAt: string;
  /** Historical spacing between consecutive measurements, in seconds. */
  intervalSeconds: number;
  /** Same seed plus same config yields the same dataset. */
  seed: string;
  temperature: RangeConfig;
  humidity: RangeConfig;
  /**
   * How strongly humidity moves against temperature, 0 to 1.
   * 0 makes the two independent; 1 mirrors the temperature deviation fully.
   */
  correlation: number;
  /** Probability per measurement of injecting an anomalous spike, 0 to 1. */
  anomalyRate: number;
  /** Size of an anomaly, as a multiple of the noise standard deviation. */
  anomalyMagnitude: number;
  /** Decimal places in the emitted values. */
  decimals: number;
};

export type GeneratedMeasurement = {
  /** 0-based position in the dataset. */
  sequence: number;
  /** ISO 8601 in UTC. */
  createdAt: string;
  temperature: number;
  humidity: number;
  /** True when this row carries an injected anomaly. */
  anomaly: boolean;
};

export type GeneratorProfile = {
  id: string;
  name: string;
  description: string;
  config: Omit<GeneratorConfig, "count" | "startAt" | "seed">;
};
