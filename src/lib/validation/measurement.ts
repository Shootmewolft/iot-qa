import { escapeCsvValue, UTF8_BOM } from "@/lib/csv/serialize";
import { DHT22_LIMITS, GENERATOR_LIMITS } from "@/lib/generator/types";

/**
 * Row-level validation for imported data (MVP spec, section 13.5).
 *
 * Every rule here exists because ThingSpeak or the DHT22 enforces it
 * downstream. The point is to fail on the operator's screen, where a fix
 * costs seconds, rather than mid-upload where a single bad row rejects an
 * entire 960-row batch.
 */

export type ValidationErrorCode =
  | "TIMESTAMP_MISSING"
  | "TIMESTAMP_INVALID"
  | "TIMESTAMP_DUPLICATED"
  | "TIMESTAMP_OUT_OF_ORDER"
  | "VALUE_MISSING"
  | "VALUE_NOT_A_NUMBER"
  | "VALUE_NOT_FINITE"
  | "TEMPERATURE_OUT_OF_RANGE"
  | "HUMIDITY_OUT_OF_RANGE"
  | "ROW_EMPTY"
  | "TOO_MANY_ROWS";

export type ValidationIssue = {
  /** 1-based row number as the operator sees it in their file. */
  row: number;
  column: "created_at" | "field1" | "field2" | "*";
  value: string;
  code: ValidationErrorCode;
  message: string;
};

/** A row as it comes out of a CSV or XLSX parser: everything is text. */
export type RawRow = {
  createdAt: string;
  temperature: string;
  humidity: string;
};

export type ValidMeasurement = {
  sequence: number;
  createdAt: string;
  temperature: number;
  humidity: number;
};

export type ValidationResult = {
  valid: ValidMeasurement[];
  issues: ValidationIssue[];
  /** Rows that were entirely blank and skipped rather than reported. */
  skippedBlankRows: number;
  totalRows: number;
};

const MESSAGES: Record<ValidationErrorCode, string> = {
  TIMESTAMP_MISSING: "Falta la fecha y hora.",
  TIMESTAMP_INVALID: "La fecha y hora no es válida. Usa ISO 8601.",
  TIMESTAMP_DUPLICATED:
    "Timestamp repetido. ThingSpeak rechaza el lote completo si detecta uno.",
  TIMESTAMP_OUT_OF_ORDER: "La fecha es anterior a la de la fila previa.",
  VALUE_MISSING: "Falta el valor.",
  VALUE_NOT_A_NUMBER: "No es un número. Usa punto decimal, no coma.",
  VALUE_NOT_FINITE: "El valor no es finito.",
  TEMPERATURE_OUT_OF_RANGE: `Fuera del rango del DHT22 (${DHT22_LIMITS.temperature.min} a ${DHT22_LIMITS.temperature.max} °C).`,
  HUMIDITY_OUT_OF_RANGE: `Fuera del rango de humedad (${DHT22_LIMITS.humidity.min} a ${DHT22_LIMITS.humidity.max} %).`,
  ROW_EMPTY: "La fila está vacía.",
  TOO_MANY_ROWS: `El archivo supera las ${GENERATOR_LIMITS.rows.max} filas con datos.`,
};

function issue(
  row: number,
  column: ValidationIssue["column"],
  value: string,
  code: ValidationErrorCode,
): ValidationIssue {
  return { row, column, value, code, message: MESSAGES[code] };
}

/**
 * Parses a numeric cell.
 *
 * A comma decimal separator is accepted and normalized: it is what a Spanish
 * locale spreadsheet writes, and rejecting it would fail thousands of rows for
 * a formatting choice the operator did not consciously make.
 */
export function parseNumericCell(
  raw: string,
): { ok: true; value: number } | { ok: false; code: ValidationErrorCode } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, code: "VALUE_MISSING" };

  const normalized =
    trimmed.includes(",") && !trimmed.includes(".")
      ? trimmed.replace(",", ".")
      : trimmed;

  // `Number("")` is 0 and `Number("12abc")` is NaN; the explicit shape check
  // rejects things like "1e5x" that a looser parse would let through.
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(normalized)) {
    return { ok: false, code: "VALUE_NOT_A_NUMBER" };
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, code: "VALUE_NOT_FINITE" };

  return { ok: true, value };
}

/** Parses a timestamp cell to an ISO instant in UTC. */
export function parseTimestampCell(
  raw: string,
):
  | { ok: true; value: string; ms: number }
  | { ok: false; code: ValidationErrorCode } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, code: "TIMESTAMP_MISSING" };

  const date = new Date(trimmed);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return { ok: false, code: "TIMESTAMP_INVALID" };

  return { ok: true, value: date.toISOString(), ms };
}

export function validateRows(rows: RawRow[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  const valid: ValidMeasurement[] = [];
  const seen = new Map<string, number>();

  let skippedBlankRows = 0;
  let previousMs = Number.NEGATIVE_INFINITY;

  rows.forEach((row, index) => {
    // +2: one for the header line, one to make it 1-based like a spreadsheet.
    const rowNumber = index + 2;

    const isBlank =
      row.createdAt.trim() === "" &&
      row.temperature.trim() === "" &&
      row.humidity.trim() === "";

    if (isBlank) {
      skippedBlankRows++;
      return;
    }

    const timestamp = parseTimestampCell(row.createdAt);
    const temperature = parseNumericCell(row.temperature);
    const humidity = parseNumericCell(row.humidity);

    let rowHasIssue = false;

    if (!timestamp.ok) {
      issues.push(
        issue(rowNumber, "created_at", row.createdAt, timestamp.code),
      );
      rowHasIssue = true;
    } else {
      const duplicateOf = seen.get(timestamp.value);
      if (duplicateOf !== undefined) {
        issues.push(
          issue(
            rowNumber,
            "created_at",
            `${row.createdAt} (ya en la fila ${duplicateOf})`,
            "TIMESTAMP_DUPLICATED",
          ),
        );
        rowHasIssue = true;
      } else if (timestamp.ms < previousMs) {
        issues.push(
          issue(
            rowNumber,
            "created_at",
            row.createdAt,
            "TIMESTAMP_OUT_OF_ORDER",
          ),
        );
        rowHasIssue = true;
      }
    }

    if (!temperature.ok) {
      issues.push(
        issue(rowNumber, "field1", row.temperature, temperature.code),
      );
      rowHasIssue = true;
    } else if (
      temperature.value < DHT22_LIMITS.temperature.min ||
      temperature.value > DHT22_LIMITS.temperature.max
    ) {
      issues.push(
        issue(rowNumber, "field1", row.temperature, "TEMPERATURE_OUT_OF_RANGE"),
      );
      rowHasIssue = true;
    }

    if (!humidity.ok) {
      issues.push(issue(rowNumber, "field2", row.humidity, humidity.code));
      rowHasIssue = true;
    } else if (
      humidity.value < DHT22_LIMITS.humidity.min ||
      humidity.value > DHT22_LIMITS.humidity.max
    ) {
      issues.push(
        issue(rowNumber, "field2", row.humidity, "HUMIDITY_OUT_OF_RANGE"),
      );
      rowHasIssue = true;
    }

    if (timestamp.ok) {
      // Registered even for a rejected row, so a later duplicate of a bad
      // timestamp is still reported against its first occurrence.
      if (!seen.has(timestamp.value)) seen.set(timestamp.value, rowNumber);
      previousMs = Math.max(previousMs, timestamp.ms);
    }

    if (!rowHasIssue && timestamp.ok && temperature.ok && humidity.ok) {
      valid.push({
        sequence: valid.length,
        createdAt: timestamp.value,
        temperature: temperature.value,
        humidity: humidity.value,
      });
    }
  });

  if (rows.length - skippedBlankRows > GENERATOR_LIMITS.rows.max) {
    issues.push({
      row: GENERATOR_LIMITS.rows.max + 2,
      column: "*",
      value: String(rows.length - skippedBlankRows),
      code: "TOO_MANY_ROWS",
      message: `El archivo tiene ${(rows.length - skippedBlankRows).toLocaleString("es-CO")} filas con datos y el máximo es ${GENERATOR_LIMITS.rows.max.toLocaleString("es-CO")}.`,
    });
  }

  return {
    valid,
    issues,
    skippedBlankRows,
    totalRows: rows.length,
  };
}

/** Downloadable error report (spec section 13.6). */
export function issuesToCsv(issues: ValidationIssue[]): string {
  const quote = (value: string) => escapeCsvValue(value, ",");

  const lines = [
    "fila,columna,valor,codigo,motivo",
    ...issues.map((item) =>
      [
        String(item.row),
        item.column,
        quote(item.value),
        item.code,
        quote(item.message),
      ].join(","),
    ),
  ];

  return `${UTF8_BOM}${lines.join("\r\n")}\r\n`;
}
