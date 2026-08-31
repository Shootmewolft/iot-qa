"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { DicesIcon, Wand2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { IconButton } from "@/components/common/icon-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  isoToLocalInput,
  localInputToIso,
  localOffsetLabel,
} from "@/lib/datetime";
import {
  DEFAULT_PROFILE_ID,
  findProfile,
  generatorProfiles,
} from "@/lib/generator/profiles";
import { generatorConfigSchema } from "@/lib/generator/schema";
import type { GeneratorConfig } from "@/lib/generator/types";

type FormValues = z.infer<typeof generatorConfigSchema>;

function defaultValues(): FormValues {
  const profile = findProfile(DEFAULT_PROFILE_ID);
  if (!profile) throw new Error("Default generator profile is missing");

  /*
   * `startAt` starts EMPTY on purpose. Deriving it from the clock during
   * render gives the server one value and the browser another a moment
   * later, which React reports as a hydration mismatch. The real default is
   * filled in after mount, where the two can no longer disagree.
   */
  return { ...profile.config, count: 1000, startAt: "", seed: "grupo-4" };
}

export function GeneratorForm({
  onGenerate,
  isGenerating,
}: {
  onGenerate: (config: GeneratorConfig) => void;
  isGenerating: boolean;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(generatorConfigSchema),
    defaultValues: defaultValues(),
    mode: "onBlur",
  });

  // Everything that depends on the clock or the browser timezone is applied
  // after hydration, never during it.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!form.getValues("startAt")) {
      // Anchored in the past so the dataset describes readings that could
      // have happened, rather than measurements dated in the future.
      form.setValue(
        "startAt",
        new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        { shouldValidate: true },
      );
    }
  }, [form]);

  function applyProfile(id: string) {
    const profile = findProfile(id);
    if (!profile) return;

    for (const [key, value] of Object.entries(profile.config)) {
      form.setValue(key as keyof FormValues, value as never, {
        shouldValidate: true,
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parámetros</CardTitle>
        <CardDescription>
          La misma semilla y la misma configuración producen siempre el mismo
          dataset.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onGenerate)} className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="generator-profile">Perfil</Label>
              <Select
                defaultValue={DEFAULT_PROFILE_ID}
                onValueChange={applyProfile}
              >
                {/* The id ties the visible label to the trigger; without it
                    the control announces as an unnamed button. */}
                <SelectTrigger id="generator-profile">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {generatorProfiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                {findProfile(DEFAULT_PROFILE_ID)?.description}
              </FormDescription>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                form={form}
                name="count"
                label="Mediciones"
                description="Entre 1 y 10.000."
                min={1}
                max={10000}
                step={1}
              />

              <FormField
                control={form.control}
                name="seed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Semilla</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <IconButton
                        type="button"
                        variant="outline"
                        label="Generar una semilla aleatoria"
                        onClick={() =>
                          field.onChange(
                            Math.random().toString(36).slice(2, 10),
                          )
                        }
                      >
                        <DicesIcon />
                      </IconButton>
                    </div>
                    <FormDescription>
                      Reutilízala para reproducir el mismo dataset.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="startAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Primera medición
                      {mounted ? ` (${localOffsetLabel()})` : ""}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        step={1}
                        value={isoToLocalInput(field.value)}
                        onChange={(event) => {
                          const iso = localInputToIso(event.target.value);
                          if (iso) field.onChange(iso);
                        }}
                      />
                    </FormControl>
                    <FormDescription className="font-mono text-xs">
                      {field.value}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <NumberField
                form={form}
                name="intervalSeconds"
                label="Intervalo histórico (s)"
                description="Separación entre timestamps, no espera de envío."
                min={1}
                step={1}
              />
            </div>

            <Separator />

            <RangeFields
              form={form}
              prefix="temperature"
              label="Temperatura (°C)"
            />
            <RangeFields form={form} prefix="humidity" label="Humedad (%)" />

            <Button type="submit" disabled={isGenerating}>
              <Wand2Icon />
              Generar
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function RangeFields({
  form,
  prefix,
  label,
}: {
  form: ReturnType<typeof useForm<FormValues>>;
  prefix: "temperature" | "humidity";
  label: string;
}) {
  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium">{label}</p>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <NumberField
          form={form}
          name={`${prefix}.min`}
          label="Mínimo"
          step={0.1}
        />
        <NumberField
          form={form}
          name={`${prefix}.max`}
          label="Máximo"
          step={0.1}
        />
        <NumberField
          form={form}
          name={`${prefix}.base`}
          label="Base"
          step={0.1}
        />
        <NumberField
          form={form}
          name={`${prefix}.dailyAmplitude`}
          label="Amplitud diaria"
          min={0}
          step={0.1}
        />
        <NumberField
          form={form}
          name={`${prefix}.noise`}
          label="Ruido (σ)"
          min={0}
          step={0.05}
        />
      </div>
    </div>
  );
}

/**
 * A number input reports `""` as NaN via `valueAsNumber`. Passing that
 * straight to the form would surface a confusing "expected number, received
 * NaN" instead of the field's own range message, so it is normalized here.
 */
function NumberField({
  form,
  name,
  label,
  description,
  min,
  max,
  step,
}: {
  form: ReturnType<typeof useForm<FormValues>>;
  name: string;
  label: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <FormField
      control={form.control}
      name={name as keyof FormValues}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type="number"
              inputMode="decimal"
              min={min}
              max={max}
              step={step}
              value={
                typeof field.value === "number" && Number.isFinite(field.value)
                  ? field.value
                  : ""
              }
              onBlur={field.onBlur}
              onChange={(event) => {
                const parsed = event.target.valueAsNumber;
                field.onChange(Number.isNaN(parsed) ? undefined : parsed);
              }}
            />
          </FormControl>
          {description ? (
            <FormDescription>{description}</FormDescription>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
