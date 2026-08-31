"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, LockIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const schema = z.object({
  password: z.string().min(1, "Escribe la contraseña."),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "" },
  });

  async function onSubmit(values: FormValues) {
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        // Deliberately generic: never reveal whether the password merely
        // failed or the server is misconfigured (spec section 11.1).
        setError("No se pudo iniciar sesión. Revisa la contraseña.");
        form.resetField("password");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("No se pudo contactar con el servidor. Intenta de nuevo.");
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="bg-primary text-primary-foreground mb-2 flex size-9 items-center justify-center rounded-lg">
          <LockIcon className="size-4" />
        </div>
        <CardTitle>ThingSpeak QA</CardTitle>
        <CardDescription>
          Herramienta interna. Escribe la contraseña para continuar.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contraseña</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      autoFocus
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {error ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
              Entrar
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
