import { describe, expect, it } from "vitest";

import { UTF8_BOM } from "@/lib/csv/serialize";
import {
  issuesToCsv,
  parseNumericCell,
  parseTimestampCell,
  type RawRow,
  validateRows,
} from "@/lib/validation/measurement";

function row(createdAt: string, temperature: string, humidity: string): RawRow {
  return { createdAt, temperature, humidity };
}

const good: RawRow[] = [
  row("2026-08-01T13:00:00Z", "26.4", "72.1"),
  row("2026-08-01T13:00:20Z", "26.5", "71.8"),
];

describe("parseNumericCell", () => {
  it("parses plain and signed decimals", () => {
    expect(parseNumericCell("26.4")).toEqual({ ok: true, value: 26.4 });
    expect(parseNumericCell("-40")).toEqual({ ok: true, value: -40 });
    expect(parseNumericCell(" 0 ")).toEqual({ ok: true, value: 0 });
    expect(parseNumericCell(".5")).toEqual({ ok: true, value: 0.5 });
  });

  it("accepts a comma decimal separator, which Spanish spreadsheets write", () => {
    expect(parseNumericCell("26,4")).toEqual({ ok: true, value: 26.4 });
  });

  it("rejects an empty cell as missing, not as zero", () => {
    expect(parseNumericCell("")).toEqual({ ok: false, code: "VALUE_MISSING" });
    expect(parseNumericCell("   ")).toEqual({
      ok: false,
      code: "VALUE_MISSING",
    });
  });

  it("rejects text that Number() would silently coerce", () => {
    expect(parseNumericCell("abc").ok).toBe(false);
    expect(parseNumericCell("12abc").ok).toBe(false);
    expect(parseNumericCell("1e5x").ok).toBe(false);
    expect(parseNumericCell("N/A").ok).toBe(false);
  });

  it("rejects Infinity and NaN spellings", () => {
    expect(parseNumericCell("Infinity").ok).toBe(false);
    expect(parseNumericCell("-Infinity").ok).toBe(false);
    expect(parseNumericCell("NaN").ok).toBe(false);
  });

  it("rejects a thousands separator rather than guessing", () => {
    // "1.234,5" is ambiguous across locales; refusing beats a wrong reading.
    expect(parseNumericCell("1.234,5").ok).toBe(false);
  });
});

describe("parseTimestampCell", () => {
  it("normalizes to UTC", () => {
    const result = parseTimestampCell("2026-08-01T08:00:00-05:00");
    expect(result).toMatchObject({
      ok: true,
      value: "2026-08-01T13:00:00.000Z",
    });
  });

  it("reports a missing timestamp separately from an invalid one", () => {
    expect(parseTimestampCell("")).toEqual({
      ok: false,
      code: "TIMESTAMP_MISSING",
    });
    expect(parseTimestampCell("mañana")).toEqual({
      ok: false,
      code: "TIMESTAMP_INVALID",
    });
  });
});

describe("validateRows", () => {
  it("accepts a clean file", () => {
    const result = validateRows(good);

    expect(result.issues).toHaveLength(0);
    expect(result.valid).toHaveLength(2);
    expect(result.valid[0].sequence).toBe(0);
  });

  it("numbers rows the way a spreadsheet does, counting the header", () => {
    const result = validateRows([row("nope", "26.4", "72.1")]);
    expect(result.issues[0].row).toBe(2);
  });

  it("skips fully blank rows instead of reporting them", () => {
    const result = validateRows([good[0], row("", "", ""), good[1]]);

    expect(result.skippedBlankRows).toBe(1);
    expect(result.issues).toHaveLength(0);
    expect(result.valid).toHaveLength(2);
  });

  it("reports a partially empty row rather than skipping it", () => {
    const result = validateRows([row("2026-08-01T13:00:00Z", "", "72.1")]);

    expect(result.skippedBlankRows).toBe(0);
    expect(result.issues[0].code).toBe("VALUE_MISSING");
    expect(result.issues[0].column).toBe("field1");
  });

  it("detects duplicate timestamps and points at the first occurrence", () => {
    const result = validateRows([
      good[0],
      row("2026-08-01T13:00:00Z", "27.0", "70.0"),
    ]);

    const duplicate = result.issues.find(
      (i) => i.code === "TIMESTAMP_DUPLICATED",
    );

    expect(duplicate).toBeDefined();
    expect(duplicate?.value).toContain("fila 2");
    expect(result.valid).toHaveLength(1);
  });

  it("treats offset and Z spellings of the same instant as duplicates", () => {
    const result = validateRows([
      row("2026-08-01T13:00:00Z", "26.4", "72.1"),
      row("2026-08-01T08:00:00-05:00", "26.5", "71.8"),
    ]);

    expect(result.issues.some((i) => i.code === "TIMESTAMP_DUPLICATED")).toBe(
      true,
    );
  });

  it("detects rows out of chronological order", () => {
    const result = validateRows([
      row("2026-08-01T13:00:20Z", "26.4", "72.1"),
      row("2026-08-01T13:00:00Z", "26.5", "71.8"),
    ]);

    expect(result.issues.some((i) => i.code === "TIMESTAMP_OUT_OF_ORDER")).toBe(
      true,
    );
  });

  it("rejects temperatures outside the DHT22 envelope", () => {
    const result = validateRows([
      row("2026-08-01T13:00:00Z", "120", "72.1"),
      row("2026-08-01T13:00:20Z", "-100", "72.1"),
    ]);

    expect(
      result.issues.filter((i) => i.code === "TEMPERATURE_OUT_OF_RANGE"),
    ).toHaveLength(2);
    expect(result.valid).toHaveLength(0);
  });

  it("rejects humidity outside 0 to 100", () => {
    const result = validateRows([row("2026-08-01T13:00:00Z", "26.4", "140")]);
    expect(result.issues[0].code).toBe("HUMIDITY_OUT_OF_RANGE");
  });

  it("accepts the exact boundary values", () => {
    const result = validateRows([
      row("2026-08-01T13:00:00Z", "-40", "0"),
      row("2026-08-01T13:00:20Z", "80", "100"),
    ]);

    expect(result.issues).toHaveLength(0);
    expect(result.valid).toHaveLength(2);
  });

  it("reports several problems in the same row", () => {
    const result = validateRows([row("nope", "abc", "999")]);
    expect(result.issues).toHaveLength(3);
  });

  it("keeps valid rows even when others fail", () => {
    const result = validateRows([good[0], row("bad", "x", "y"), good[1]]);

    expect(result.valid).toHaveLength(2);
    // Sequence is reassigned over the surviving rows, with no gaps.
    expect(result.valid.map((v) => v.sequence)).toEqual([0, 1]);
  });

  it("flags a file above the 10,000-row ceiling", () => {
    const many = Array.from({ length: 10_001 }, (_, i) =>
      row(
        new Date(Date.UTC(2026, 7, 1) + i * 20_000).toISOString(),
        "26",
        "70",
      ),
    );

    expect(
      validateRows(many).issues.some((i) => i.code === "TOO_MANY_ROWS"),
    ).toBe(true);
  });

  it("does not flag exactly 10,000 rows", () => {
    const many = Array.from({ length: 10_000 }, (_, i) =>
      row(
        new Date(Date.UTC(2026, 7, 1) + i * 20_000).toISOString(),
        "26",
        "70",
      ),
    );

    expect(
      validateRows(many).issues.some((i) => i.code === "TOO_MANY_ROWS"),
    ).toBe(false);
  });
});

describe("issuesToCsv", () => {
  it("emits a header and one line per issue", () => {
    const csv = issuesToCsv(validateRows([row("nope", "abc", "72.1")]).issues);

    // The BOM is deliberate: the operator opens this report in Excel.
    expect(csv.startsWith(UTF8_BOM)).toBe(true);

    const lines = csv.slice(UTF8_BOM.length).trimEnd().split("\r\n");
    expect(lines[0]).toBe("fila,columna,valor,codigo,motivo");
    expect(lines).toHaveLength(3);
  });

  it("quotes values containing commas", () => {
    const csv = issuesToCsv([
      {
        row: 2,
        column: "field1",
        value: "1,5",
        code: "VALUE_NOT_A_NUMBER",
        message: "No es un número. Usa punto decimal, no coma.",
      },
    ]);

    expect(csv).toContain('"1,5"');
    expect(csv).toContain('"No es un número. Usa punto decimal, no coma."');
  });
});
