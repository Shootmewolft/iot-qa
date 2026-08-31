/**
 * CSV shape defined by the MVP spec, section 13.1. The header names are the
 * ones ThingSpeak itself uses, so a file exported here can be read back
 * without a mapping step.
 */
export const CSV_HEADERS = ["created_at", "field1", "field2"] as const;

export type CsvRow = {
  createdAt: string;
  temperature: number | null;
  humidity: number | null;
};

/**
 * Byte-order mark. Excel on Windows assumes the system codepage for a .csv
 * without one and mangles accented characters; every other consumer ignores
 * it. Cheap insurance for a file a QA operator will very likely open in Excel.
 */
export const UTF8_BOM = "﻿";

/**
 * Quotes a value only when it needs it, per RFC 4180. Our own values never
 * contain separators, but an imported-then-re-exported dataset might.
 */
export function escapeCsvValue(value: string, delimiter: string): string {
  const needsQuotes =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r");

  return needsQuotes ? `"${value.replaceAll('"', '""')}"` : value;
}

function formatNumber(value: number | null, decimals: number): string {
  if (value === null || !Number.isFinite(value)) return "";
  return value.toFixed(decimals);
}

export type SerializeOptions = {
  delimiter?: string;
  decimals?: number;
  /** Prepend a BOM so Excel reads the file as UTF-8. */
  withBom?: boolean;
};

export function serializeCsv(
  rows: CsvRow[],
  options: SerializeOptions = {},
): string {
  const { delimiter = ",", decimals = 2, withBom = true } = options;

  const lines = [
    CSV_HEADERS.join(delimiter),
    ...rows.map((row) =>
      [
        escapeCsvValue(row.createdAt, delimiter),
        formatNumber(row.temperature, decimals),
        formatNumber(row.humidity, decimals),
      ].join(delimiter),
    ),
  ];

  // Trailing newline: POSIX tools and several parsers expect it.
  return `${withBom ? UTF8_BOM : ""}${lines.join("\r\n")}\r\n`;
}

/** Empty template with two illustrative rows (spec section 13.1). */
export function csvTemplate(): string {
  return serializeCsv([
    {
      createdAt: "2026-08-01T13:00:00.000Z",
      temperature: 26.4,
      humidity: 72.1,
    },
    {
      createdAt: "2026-08-01T13:00:20.000Z",
      temperature: 26.5,
      humidity: 71.8,
    },
  ]);
}
