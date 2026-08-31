import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * `server-only` throws on import unless the `react-server` export condition
 * is active, which would make every server module untestable here.
 */
const serverOnlyStub = fileURLToPath(
  new URL("./src/test/server-only-stub.ts", import.meta.url),
);

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": serverOnlyStub },
  },
  test: {
    globals: true,
    projects: [
      {
        /*
         * Server-side code: domain logic, auth, ThingSpeak clients.
         * These must NOT run under jsdom — its globals live in a separate
         * realm, so `instanceof Uint8Array` fails inside WebCrypto callers
         * such as jose.
         */
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/{lib,config}/**/*.{test,spec}.ts"],
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "dom",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/{components,app,hooks,db}/**/*.{test,spec}.{ts,tsx}"],
        },
      },
    ],
  },
});
