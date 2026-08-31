import { describe, expect, it } from "vitest";

import {
  BACKUP_HEADERS,
  type BackupMetadata,
  parseBackup,
  serializeBackup,
} from "@/lib/backup/serialize";
import { UTF8_BOM } from "@/lib/csv/serialize";
import type { ChannelReading } from "@/lib/thingspeak/types";

const metadata: BackupMetadata = {
  channelId: 3474649,
  channelName: "Sistema IoT - Grupo 4",
  exportedAt: "2026-08-30T22:00:00.000Z",
  rowCount: 3,
  truncated: false,
};

const readings: ChannelReading[] = [
  {
    entryId: 9,
    createdAt: "2026-09-01T12:00:00.000Z",
    temperature: 26.4,
    humidity: 72.1,
  },
  {
    entryId: 10,
    createdAt: "2026-09-01T12:00:20.000Z",
    temperature: 26.5,
    humidity: null,
  },
  {
    entryId: 11,
    createdAt: "2026-09-01T12:00:40.000Z",
    temperature: null,
    humidity: 71.5,
  },
];

function body(csv: string): string[] {
  return csv
    .slice(UTF8_BOM.length)
    .trimEnd()
    .split("\r\n")
    .filter((line) => !line.startsWith("#"));
}

describe("serializeBackup", () => {
  it("keeps the original entry ids", () => {
    // They do not survive a restore, but they prove which rows were covered.
    const lines = body(serializeBackup(readings, metadata));

    expect(lines[0]).toBe(BACKUP_HEADERS.join(","));
    expect(lines[1]).toBe("9,2026-09-01T12:00:00.000Z,26.4,72.1");
  });

  it("records which channel and when, so the file is evidence", () => {
    const csv = serializeBackup(readings, metadata);

    expect(csv).toContain("# canal_id,3474649");
    expect(csv).toContain("# exportado_en,2026-08-30T22:00:00.000Z");
  });

  it("marks a truncated read loudly", () => {
    const csv = serializeBackup(readings, { ...metadata, truncated: true });
    expect(csv).toContain("# completo,NO - lectura truncada en 8000");
  });

  it("writes an empty cell for a missing field, never a zero", () => {
    const lines = body(serializeBackup(readings, metadata));

    expect(lines[2]).toBe("10,2026-09-01T12:00:20.000Z,26.5,");
    expect(lines[3]).toBe("11,2026-09-01T12:00:40.000Z,,71.5");
  });

  it("quotes a channel name containing a comma", () => {
    const csv = serializeBackup(readings, {
      ...metadata,
      channelName: "Grupo 4, sede norte",
    });

    expect(csv).toContain('"Grupo 4, sede norte"');
  });
});

describe("parseBackup", () => {
  it("round-trips its own output", () => {
    const parsed = parseBackup(serializeBackup(readings, metadata));

    expect(parsed.readings).toHaveLength(3);
    expect(parsed.readings[0]).toEqual({
      createdAt: "2026-09-01T12:00:00.000Z",
      temperature: 26.4,
      humidity: 72.1,
    });
  });

  it("recovers the metadata", () => {
    const parsed = parseBackup(serializeBackup(readings, metadata));

    expect(parsed.metadata.channelId).toBe(3474649);
    expect(parsed.metadata.exportedAt).toBe("2026-08-30T22:00:00.000Z");
  });

  it("preserves a missing field as null rather than zero", () => {
    const parsed = parseBackup(serializeBackup(readings, metadata));

    expect(parsed.readings[1].humidity).toBeNull();
    expect(parsed.readings[2].temperature).toBeNull();
  });

  it("tolerates a file without the BOM or the comment block", () => {
    const parsed = parseBackup(
      "entry_id,created_at,field1,field2\r\n9,2026-09-01T12:00:00.000Z,26.4,72.1\r\n",
    );

    expect(parsed.readings).toHaveLength(1);
  });

  it("skips blank and malformed lines instead of producing junk rows", () => {
    const parsed = parseBackup(
      [
        "entry_id,created_at,field1,field2",
        "9,2026-09-01T12:00:00.000Z,26.4,72.1",
        "",
        "basura",
        "10,,26.5,71.8",
        "11,2026-09-01T12:00:40.000Z,26.6,71.5",
      ].join("\r\n"),
    );

    // The row with no timestamp cannot be restored, so it is dropped.
    expect(parsed.readings.map((r) => r.createdAt)).toEqual([
      "2026-09-01T12:00:00.000Z",
      "2026-09-01T12:00:40.000Z",
    ]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseBackup("").readings).toHaveLength(0);
  });
});
