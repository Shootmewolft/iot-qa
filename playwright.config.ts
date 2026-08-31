import { readFileSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

/**
 * Next.js loads `.env` itself, but the Playwright process does not, so the
 * password the tests type in has to be read here explicitly.
 */
function readEnvFile(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(".env", "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const separator = line.indexOf("=");
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
    );
  } catch {
    return {};
  }
}

const fileEnv = readEnvFile();

process.env.APP_PASSWORD ??= fileEnv.APP_PASSWORD;

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    /*
     * Dark on purpose. next-themes resolves to the system scheme on the
     * client and to nothing on the server, so a value derived from the theme
     * only diverges when the two differ. Running light hid a real mismatch
     * that a user in dark mode hit immediately.
     */
    colorScheme: "dark",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `bun run dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      // Never a real key in E2E: a write test must not be able to reach the
      // production channel (see the entry this project accidentally wrote).
      THINGSPEAK_WRITE_API_KEY: "CLAVE_INVALIDA_DE_PRUEBA",
      THINGSPEAK_USER_API_KEY: "CLAVE_INVALIDA_DE_PRUEBA",
    },
  },
});
