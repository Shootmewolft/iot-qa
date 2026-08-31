"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { RANGE_PRESETS, type RangePresetId } from "@/lib/statistics/ranges";

/**
 * Range filter (spec section 18).
 *
 * The selection lives in the URL, not in component state: the server reads it
 * to fetch the data, and the resulting page is shareable and reloadable —
 * which matters for a QA tool whose whole job is producing evidence.
 */
export function RangeFilter({ active }: { active: RangePresetId }) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function select(id: RangePresetId) {
    const next = new URLSearchParams(params);
    next.set("rango", id);
    startTransition(() => router.push(`?${next}`, { scroll: false }));
  }

  return (
    <fieldset className="flex flex-wrap gap-1">
      <legend className="sr-only">Rango temporal</legend>
      {RANGE_PRESETS.map((preset) => (
        <Button
          key={preset.id}
          size="sm"
          variant={preset.id === active ? "default" : "outline"}
          aria-pressed={preset.id === active}
          disabled={isPending}
          onClick={() => select(preset.id)}
        >
          {preset.label}
        </Button>
      ))}
    </fieldset>
  );
}
