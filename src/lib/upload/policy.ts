import { MIN_SECONDS_BETWEEN_BATCHES } from "@/lib/upload/batching";

/**
 * Retry policy (MVP spec, section 16).
 *
 * The governing idea: a failed request and an UNKNOWN request are not the
 * same thing. A timeout or a 5xx may have stored the rows and lost the
 * response, so blindly resending would hit duplicate timestamps and reject
 * the whole batch. Those outcomes must verify, never retry.
 */

export type BatchOutcome =
  | { kind: "ok" }
  | { kind: "http"; status: number }
  | { kind: "timeout" }
  | { kind: "offline" };

export type NextAction =
  | { action: "confirm" }
  | { action: "verify"; reason: string }
  | { action: "wait"; seconds: number }
  | { action: "stop"; reason: string }
  | { action: "fail"; reason: string };

export const MAX_AUTOMATIC_ATTEMPTS = 3;

/** Backoff between automatic attempts, never below the mandatory 15 seconds. */
export function backoffSeconds(attempt: number): number {
  const ladder = [MIN_SECONDS_BETWEEN_BATCHES, 30, 60];
  return ladder[Math.min(attempt, ladder.length - 1)];
}

export function decideNextAction(
  outcome: BatchOutcome,
  attempt: number,
): NextAction {
  if (outcome.kind === "ok") return { action: "confirm" };

  if (outcome.kind === "offline") {
    return {
      action: "stop",
      reason: "Sin conexión de red. El trabajo queda en pausa.",
    };
  }

  if (outcome.kind === "timeout") {
    return {
      action: "verify",
      reason:
        "La solicitud expiró. ThingSpeak pudo haber guardado el lote, así que hay que comprobarlo antes de reintentar.",
    };
  }

  const { status } = outcome;

  if (status === 429) {
    return attempt + 1 >= MAX_AUTOMATIC_ATTEMPTS
      ? {
          action: "stop",
          reason: "ThingSpeak sigue limitando las solicitudes tras 3 intentos.",
        }
      : { action: "wait", seconds: backoffSeconds(attempt) };
  }

  if (status === 401 || status === 403) {
    return {
      action: "fail",
      reason: "ThingSpeak rechazó la Write API Key. Revisa la configuración.",
    };
  }

  if (status >= 500) {
    return {
      action: "verify",
      reason:
        "ThingSpeak devolvió un error de servidor. El lote pudo guardarse, así que hay que comprobarlo.",
    };
  }

  // 4xx other than 429/401/403: the request itself is wrong. Retrying the
  // same bytes would fail identically, so stop and let the operator look.
  return {
    action: "fail",
    reason: "ThingSpeak rechazó el lote. Revisa los datos antes de reintentar.",
  };
}

/** What to do once an uncertain batch has been read back. */
export function decideAfterVerification(
  outcome: "none" | "all" | "partial",
): NextAction {
  if (outcome === "all") return { action: "confirm" };

  if (outcome === "none") {
    return { action: "wait", seconds: MIN_SECONDS_BETWEEN_BATCHES };
  }

  return {
    action: "stop",
    reason:
      "El lote quedó guardado a medias. Continuar automáticamente crearía duplicados o huecos: requiere intervención manual.",
  };
}
