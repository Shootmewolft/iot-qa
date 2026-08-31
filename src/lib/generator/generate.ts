import { createPrng } from "@/lib/generator/prng";
import type {
  GeneratedMeasurement,
  GeneratorConfig,
} from "@/lib/generator/types";

/**
 * Smoothing factor of the autoregressive noise.
 *
 * Independent draws would make consecutive readings jump by several degrees,
 * which no real DHT22 does. Carrying most of the previous value forward makes
 * the series wander instead of jitter (spec section 12.3).
 */
const NOISE_PERSISTENCE = 0.85;

/**
 * Hours to shift the daily sine so its peak lands mid-afternoon and its
 * trough before dawn, which is how an actual classroom behaves.
 */
const DAILY_PEAK_SHIFT_HOURS = 9;

const SECONDS_PER_DAY = 86_400;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Position within the 24-hour cycle, in radians, peaking mid-afternoon. */
function dailyPhase(timestampMs: number): number {
  const secondsOfDay = Math.floor(timestampMs / 1000) % SECONDS_PER_DAY;
  const shifted = secondsOfDay - DAILY_PEAK_SHIFT_HOURS * 3600;
  return (2 * Math.PI * shifted) / SECONDS_PER_DAY;
}

/**
 * Generates a reproducible synthetic dataset.
 *
 * Timestamps are strictly increasing and unique by construction: the interval
 * is at least one second and the sequence is linear. ThingSpeak rejects an
 * entire bulk batch on a single duplicate, so this is a hard requirement, not
 * a nicety (spec sections 12.5 and 15.1).
 */
export function generateMeasurements(
  config: GeneratorConfig,
): GeneratedMeasurement[] {
  const prng = createPrng(config.seed);
  const startMs = new Date(config.startAt).getTime();

  if (Number.isNaN(startMs)) {
    throw new Error(`Invalid startAt: ${config.startAt}`);
  }

  const { temperature: t, humidity: h } = config;

  /*
   * Translates a temperature excursion into humidity units, so that
   * `correlation: 1` means "a full-span temperature swing produces a full-span
   * opposite humidity swing" regardless of the units involved.
   */
  const temperatureSpan = t.max - t.min;
  const humiditySpan = h.max - h.min;
  const couplingScale =
    temperatureSpan > 0 ? humiditySpan / temperatureSpan : 0;

  // Scaling by sqrt(1 - a^2) keeps the stationary standard deviation equal to
  // the configured noise, instead of shrinking it as persistence rises.
  const innovation = Math.sqrt(1 - NOISE_PERSISTENCE ** 2);

  let temperatureNoise = 0;
  let humidityNoise = 0;

  const measurements: GeneratedMeasurement[] = [];

  for (let i = 0; i < config.count; i++) {
    const timestampMs = startMs + i * config.intervalSeconds * 1000;
    const phase = dailyPhase(timestampMs);

    temperatureNoise =
      NOISE_PERSISTENCE * temperatureNoise +
      innovation * t.noise * prng.normal();

    humidityNoise =
      NOISE_PERSISTENCE * humidityNoise + innovation * h.noise * prng.normal();

    const isAnomaly = prng.next() < config.anomalyRate;
    const anomaly = isAnomaly
      ? (prng.next() < 0.5 ? -1 : 1) * config.anomalyMagnitude * t.noise
      : 0;

    // The non-cyclic part of the excursion is what humidity reacts to; the
    // daily inverse relationship is already carried by its own cycle term.
    const deviation = temperatureNoise + anomaly;

    const rawTemperature =
      t.base + t.dailyAmplitude * Math.sin(phase) + deviation;
    const rawHumidity =
      h.base -
      h.dailyAmplitude * Math.sin(phase) -
      config.correlation * couplingScale * deviation +
      humidityNoise;

    measurements.push({
      sequence: i,
      createdAt: new Date(timestampMs).toISOString(),
      temperature: round(clamp(rawTemperature, t.min, t.max), config.decimals),
      humidity: round(clamp(rawHumidity, h.min, h.max), config.decimals),
      anomaly: isAnomaly,
    });
  }

  return measurements;
}
