import "server-only";

/**
 * Server-only environment access.
 *
 * Nothing here may ever be re-exported to a Client Component, and none of
 * these names may be prefixed with NEXT_PUBLIC_ (MVP spec, section 5.5).
 */

function required(name: string, minLength = 1): string {
  const value = process.env[name];

  if (!value || value.length < minLength) {
    throw new Error(
      `Missing or invalid environment variable ${name}. ` +
        `Expected at least ${minLength} characters. ` +
        "Configure it in .env.local for local development, or in the Vercel project settings.",
    );
  }

  return value;
}

/** The shared password that gates the whole application. */
export function appPassword(): string {
  return required("APP_PASSWORD");
}

/** HMAC key used to sign session tokens. 32 chars is the floor for HS256. */
export function sessionSecret(): Uint8Array {
  return new TextEncoder().encode(required("SESSION_SECRET", 32));
}

/**
 * Canonical origin of the deployment, used to reject cross-site writes.
 * Falls back to the Vercel-provided URL, then to undefined so that local
 * development over http://localhost keeps working.
 */
export function appOrigin(): string | undefined {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return undefined;
}

export const isProduction = process.env.NODE_ENV === "production";

/**
 * ThingSpeak configuration.
 *
 * Keys are read here and never leave the server. Diagnostics may report
 * whether a key is present, never its value (MVP spec, section 5.5).
 */
export function thingSpeakBaseUrl(): string {
  return process.env.THINGSPEAK_BASE_URL ?? "https://api.thingspeak.com";
}

export function thingSpeakChannelId(): string {
  return required("THINGSPEAK_CHANNEL_ID");
}

export function thingSpeakReadApiKey(): string | undefined {
  return process.env.THINGSPEAK_READ_API_KEY || undefined;
}

export function thingSpeakWriteApiKey(): string {
  return required("THINGSPEAK_WRITE_API_KEY");
}

export function thingSpeakUserApiKey(): string {
  return required("THINGSPEAK_USER_API_KEY");
}

/** Presence-only view of the configuration, safe to send to the browser. */
export function configurationReport() {
  const present = (name: string) => Boolean(process.env[name]);

  return {
    appPassword: present("APP_PASSWORD"),
    sessionSecret: present("SESSION_SECRET"),
    appOrigin: Boolean(appOrigin()),
    thingSpeakChannelId: present("THINGSPEAK_CHANNEL_ID"),
    thingSpeakReadApiKey: present("THINGSPEAK_READ_API_KEY"),
    thingSpeakWriteApiKey: present("THINGSPEAK_WRITE_API_KEY"),
    thingSpeakUserApiKey: present("THINGSPEAK_USER_API_KEY"),
  } as const;
}

export type ConfigurationReport = ReturnType<typeof configurationReport>;
