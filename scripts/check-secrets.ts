#!/usr/bin/env bun
/**
 * Fails the build if a secret can reach the browser (spec sections 21 and 27).
 *
 * Two independent checks, because they catch different mistakes:
 *
 *  1. A `NEXT_PUBLIC_` prefix on anything secret. That prefix is an explicit
 *     instruction to inline the value into the client bundle, so it is a
 *     mistake that reads as intentional.
 *  2. The actual VALUES from the environment appearing anywhere under
 *     `.next/static`. This is the one that matters: it does not care how the
 *     leak happened, only whether it did.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SECRET_VARS = [
  "APP_PASSWORD",
  "SESSION_SECRET",
  "THINGSPEAK_WRITE_API_KEY",
  "THINGSPEAK_READ_API_KEY",
  "THINGSPEAK_USER_API_KEY",
];

/** Short values would match by coincidence and drown the report in noise. */
const MIN_SCANNABLE_LENGTH = 8;

function walk(dir: string): string[] {
  let files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files = files.concat(walk(path));
    else files.push(path);
  }
  return files;
}

function main(): number {
  const problems: string[] = [];

  for (const name of SECRET_VARS) {
    if (process.env[`NEXT_PUBLIC_${name}`]) {
      problems.push(
        `NEXT_PUBLIC_${name} está definida. Ese prefijo publica el valor en el bundle.`,
      );
    }
  }

  let files: string[];
  try {
    files = walk(".next/static");
  } catch {
    console.error(
      "No hay build en .next/static. Ejecuta `bun run build` antes.",
    );
    return 1;
  }

  const values = SECRET_VARS.map((name) => ({
    name,
    value: process.env[name] ?? "",
  })).filter(({ value }) => value.length >= MIN_SCANNABLE_LENGTH);

  if (values.length === 0) {
    console.warn(
      "Aviso: ninguna variable secreta está definida, así que el escaneo de valores no prueba nada.",
    );
  }

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const { name, value } of values) {
      if (content.includes(value)) {
        problems.push(`El valor de ${name} aparece en ${file}`);
      }
    }
  }

  if (problems.length > 0) {
    console.error("\nSECRETOS EXPUESTOS:\n");
    for (const problem of problems) console.error(`  - ${problem}`);
    return 1;
  }

  console.log(
    `Sin secretos en el bundle. ${files.length} archivos revisados, ${values.length} valores buscados.`,
  );
  return 0;
}

process.exit(main());
