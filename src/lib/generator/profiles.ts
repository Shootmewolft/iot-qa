import rawProfiles from "@/config/generator-profiles.json";

import { generatorConfigSchema } from "@/lib/generator/schema";
import type { GeneratorProfile } from "@/lib/generator/types";

export const generatorProfiles = rawProfiles as GeneratorProfile[];

export const DEFAULT_PROFILE_ID = "aula";

export function findProfile(id: string): GeneratorProfile | undefined {
  return generatorProfiles.find((profile) => profile.id === id);
}

/**
 * Every shipped profile must satisfy the same validation the UI enforces.
 * A profile that cannot be generated is a build-time mistake, not something
 * the operator should discover at runtime.
 */
export function validateProfiles(): { id: string; error: string }[] {
  return generatorProfiles.flatMap((profile) => {
    const result = generatorConfigSchema.safeParse({
      ...profile.config,
      count: 10,
      startAt: "2026-01-01T00:00:00Z",
      seed: "validation",
    });

    return result.success
      ? []
      : [
          {
            id: profile.id,
            error: result.error.issues[0]?.message ?? "inválido",
          },
        ];
  });
}
