/**
 * Error codes surfaced by the API, mirroring the table in the MVP spec,
 * section 24. The UI shows `message`; `code` and the request id go in the
 * expandable technical detail.
 */
export const API_ERRORS = {
  AUTH_INVALID: {
    message: "La contraseña no es correcta.",
    retryable: true,
    status: 401,
  },
  SESSION_EXPIRED: {
    message: "La sesión expiró. Vuelve a iniciar sesión.",
    retryable: false,
    status: 401,
  },
  ORIGIN_NOT_ALLOWED: {
    message: "El origen de la solicitud no está autorizado.",
    retryable: false,
    status: 403,
  },
  CONTENT_TYPE_INVALID: {
    message: "El tipo de contenido de la solicitud no es válido.",
    retryable: false,
    status: 415,
  },
  REQUEST_INVALID: {
    message: "La solicitud no tiene el formato esperado.",
    retryable: false,
    status: 400,
  },
  SERVER_MISCONFIGURED: {
    message: "El servidor no está configurado correctamente.",
    retryable: false,
    status: 500,
  },
  THINGSPEAK_UNAUTHORIZED: {
    message: "ThingSpeak rechazó las credenciales. Revisa las API Keys.",
    retryable: false,
    status: 502,
  },
  THINGSPEAK_RATE_LIMITED: {
    message: "ThingSpeak pide esperar antes de la siguiente solicitud.",
    retryable: true,
    status: 429,
  },
  THINGSPEAK_UNAVAILABLE: {
    message: "No se pudo contactar con ThingSpeak.",
    retryable: true,
    status: 502,
  },
  THINGSPEAK_RESPONSE_INVALID: {
    message: "ThingSpeak respondió con un formato inesperado.",
    retryable: false,
    status: 502,
  },
  TIMESTAMP_DUPLICATED: {
    message:
      "El lote contiene dos filas con el mismo timestamp. ThingSpeak rechaza el envío completo (HTTP 400, error_duplicate_timestamps).",
    retryable: false,
    status: 400,
  },
  BATCH_TOO_LARGE: {
    message: "El lote supera los 960 mensajes que admite ThingSpeak.",
    retryable: false,
    status: 400,
  },
  BATCH_REJECTED: {
    message:
      "ThingSpeak rechazó el lote. La causa más común es un timestamp repetido.",
    retryable: false,
    status: 422,
  },
  BATCH_STATUS_UNKNOWN: {
    message:
      "No se sabe si el lote se guardó. Verifica el rango antes de reintentar.",
    retryable: false,
    status: 504,
  },
  PARTIAL_BATCH_DETECTED: {
    message:
      "El lote quedó guardado a medias. Requiere intervención manual antes de continuar.",
    retryable: false,
    status: 409,
  },
  CHANNEL_CLEAR_UNCERTAIN: {
    message:
      "No se sabe si el canal se vació. Consúltalo antes de volver a intentarlo.",
    retryable: false,
    status: 504,
  },

  BACKUP_REQUIRED: {
    message:
      "Hay que descargar un respaldo antes de vaciar el canal. Es irreversible.",
    retryable: false,
    status: 428,
  },
  CHANNEL_NOT_FOUND: {
    message: "El canal no existe o no es accesible con esta Read API Key.",
    retryable: false,
    status: 404,
  },
} as const;

export type ApiErrorCode = keyof typeof API_ERRORS;
