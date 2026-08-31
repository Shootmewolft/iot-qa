import { describe, expect, it } from "vitest";

import {
  CSV_HEADERS,
  csvTemplate,
  escapeCsvValue,
  serializeCsv,
  UTF8_BOM,
} from "@/lib/csv/serialize";

const rows = [
  { createdAt: "2026-08-01T13:00:00.000Z", temperature: 26.4, humidity: 72.1 },
  { createdAt: "2026-08-01T13:00:20.000Z", temperature: 26.5, humidity: 71.8 },
];

describe("escapeCsvValue", () => {
  it("leaves a plain value untouched", () => {
    expect(escapeCsvValue("26.4", ",")).toBe("26.4");
  });

  it("quotes a value containing the delimiter", () => {
    expect(escapeCsvValue("a,b", ",")).toBe('"a,b"');
    expect(escapeCsvValue("a;b", ";")).toBe('"a;b"');
  });

  it("doubles embedded quotes", () => {
    expect(escapeCsvValue('say "hi"', ",")).toBe('"say ""hi"""');
  });

  it("quotes values containing newlines", () => {
    expect(escapeCsvValue("a\nb", ",")).toBe('"a\nb"');
  });
});

describe("serializeCsv", () => {
  it("uses the header names ThingSpeak itself uses", () => {
    const csv = serializeCsv(rows, { withBom: false });
    expect(csv.split("\r\n")[0]).toBe(CSV_HEADERS.join(","));
  });

  it("writes one row per measurement", () => {
    const csv = serializeCsv(rows, { withBom: false });
    const lines = csv.trimEnd().split("\r\n");

    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("2026-08-01T13:00:00.000Z,26.40,72.10");
  });

  it("prepends a BOM by default so Excel reads it as UTF-8", () => {
    expect(serializeCsv(rows).startsWith(UTF8_BOM)).toBe(true);
    expect(serializeCsv(rows, { withBom: false }).startsWith(UTF8_BOM)).toBe(
      false,
    );
  });

  it("honours the requested decimals", () => {
    const csv = serializeCsv(rows, { withBom: false, decimals: 1 });
    expect(csv).toContain("26.4,72.1");
  });

  it("writes an empty cell for a missing reading, not a zero", () => {
    const csv = serializeCsv(
      [
        {
          createdAt: "2026-08-01T13:00:00.000Z",
          temperature: null,
          humidity: 72,
        },
      ],
      { withBom: false, decimals: 1 },
    );

    expect(csv).toContain("2026-08-01T13:00:00.000Z,,72.0");
  });

  it("supports a semicolon delimiter", () => {
    const csv = serializeCsv(rows, {
      withBom: false,
      delimiter: ";",
      decimals: 1,
    });
    expect(csv).toContain("created_at;field1;field2");
    expect(csv).toContain("2026-08-01T13:00:00.000Z;26.4;72.1");
  });

  it("ends with a newline", () => {
    expect(serializeCsv(rows, { withBom: false }).endsWith("\r\n")).toBe(true);
  });

  it("emits only the header for an empty dataset", () => {
    const csv = serializeCsv([], { withBom: false });
    expect(csv).toBe("created_at,field1,field2\r\n");
  });
});

describe("csvTemplate", () => {
  it("ships two illustrative rows", () => {
    const lines = csvTemplate().trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
  });
});
