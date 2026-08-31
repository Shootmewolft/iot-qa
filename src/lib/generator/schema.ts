import { z } from "zod";

import { DHT22_LIMITS, GENERATOR_LIMITS } from "@/lib/generator/types";

const rangeSchema = (limits: { min: number; max: number }, label: string) =>
  z
    .object({
      min: z.number().min(limits.min).max(limits.max),
      max: z.number().min(limits.min).max(limits.max),
      base: z.number().min(limits.min).max(limits.max),
      dailyAmplitude: z.number().min(0),
      noise: z.number().min(0),
    })
    .refine((r) => r.min < r.max, {
      message: `El mínimo de ${label} debe ser menor que el máximo.`,
      path: ["min"],
    })
    .refine((r) => r.base >= r.min && r.base <= r.max, {
      message: `El valor base de ${label} debe estar entre el mínimo y el máximo.`,
      path: ["base"],
    });

export const generatorConfigSchema = z.object({
  count: z
    .number()
    .int()
    .min(GENERATOR_LIMITS.rows.min)
    .max(GENERATOR_LIMITS.rows.max),
  startAt: z.iso.datetime({ offset: true }),
  intervalSeconds: z
    .number()
    .int()
    .min(GENERATOR_LIMITS.intervalSeconds.min)
    .max(GENERATOR_LIMITS.intervalSeconds.max),
  seed: z.string().min(1).max(128),
  temperature: rangeSchema(DHT22_LIMITS.temperature, "temperatura"),
  humidity: rangeSchema(DHT22_LIMITS.humidity, "humedad"),
  correlation: z.number().min(0).max(1),
  anomalyRate: z.number().min(0).max(1),
  anomalyMagnitude: z.number().min(0).max(20),
  decimals: z
    .number()
    .int()
    .min(GENERATOR_LIMITS.decimals.min)
    .max(GENERATOR_LIMITS.decimals.max),
});

export type GeneratorConfigInput = z.input<typeof generatorConfigSchema>;

/**
 * Warnings that do not invalidate a dataset but that the operator must see
 * before uploading. Kept separate from schema errors on purpose: a dataset
 * dated in the future is legal for ThingSpeak but almost always a mistake
 * (spec section 12.5).
 */
export type GeneratorWarning = {
  code: "FUTURE_TIMESTAMPS" | "LONG_TIME_SPAN";
  message: string;
};

export function collectWarnings(
  config: z.infer<typeof generatorConfigSchema>,
  now = Date.now(),
): GeneratorWarning[] {
  const warnings: GeneratorWarning[] = [];

  const startMs = new Date(config.startAt).getTime();
  const endMs = startMs + (config.count - 1) * config.intervalSeconds * 1000;

  if (endMs > now) {
    warnings.push({
      code: "FUTURE_TIMESTAMPS",
      message:
        "El dataset termina en el futuro. ThingSpeak lo aceptará, pero las mediciones no corresponderán a ninguna lectura real.",
    });
  }

  const spanDays = (endMs - startMs) / 86_400_000;
  if (spanDays > 365) {
    warnings.push({
      code: "LONG_TIME_SPAN",
      message: `El dataset abarca ${Math.round(spanDays)} días. Revisa el intervalo si no era la intención.`,
    });
  }

  return warnings;
}
