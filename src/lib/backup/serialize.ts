import { escapeCsvValue, UTF8_BOM } from "@/lib/csv/serialize";
import type { ChannelReading } from "@/lib/thingspeak/types";

/**
 * Channel backup (MVP spec, section 20.2).
 *
 * Carries `entry_id` alongside the measurement, unlike the import/export
 * format. The ids do NOT survive a restore — ThingSpeak assigns new ones —
 * but keeping them lets an operator prove afterwards which original rows the
 * backup covered, which is the whole point of taking one.
 */

export const BACKUP_HEADERS = [
  "entry_id",
  "created_at",
  "field1",
  "field2",
] as const;

export type BackupMetadata = {
  channelId: number;
  channelName: string;
  exportedAt: string;
  rowCount: number;
  /** True when the read hit ThingSpeak's ceiling and may be incomplete. */
  truncated: boolean;
};

function cell(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "" : String(value);
}

/**
 * Metadata goes in comment lines above the header.
 *
 * A backup that does not say which channel and when it was taken is not
 * evidence. Spreadsheets show the lines as text and CSV readers that honour
 * `#` skip them, so the cost is a few rows of context.
 */
export function serializeBackup(
  readings: ChannelReading[],
  metadata: BackupMetadata,
): string {
  const lines = [
    `# ThingSpeak QA - respaldo de canal`,
    `# canal_id,${metadata.channelId}`,
    `# canal_nombre,${escapeCsvValue(metadata.channelName, ",")}`,
    `# exportado_en,${metadata.exportedAt}`,
    `# filas,${metadata.rowCount}`,
    `# completo,${metadata.truncated ? "NO - lectura truncada en 8000" : "si"}`,
    BACKUP_HEADERS.join(","),
    ...readings.map((reading) =>
      [
        String(reading.entryId),
        reading.createdAt,
        cell(reading.temperature),
        cell(reading.humidity),
      ].join(","),
    ),
  ];

  return `${UTF8_BOM}${lines.join("\r\n")}\r\n`;
}

export type ParsedBackup = {
  readings: {
    createdAt: string;
    temperature: number | null;
    humidity: number | null;
  }[];
  metadata: Partial<BackupMetadata>;
};

/**
 * Reads a backup file produced by `serializeBackup`, for the restore path.
 * Comment lines are parsed for metadata and then skipped.
 */
export function parseBackup(content: string): ParsedBackup {
  const text = content.startsWith(UTF8_BOM) ? content.slice(1) : content;
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");

  const metadata: Partial<BackupMetadata> = {};
  const rows: ParsedBackup["readings"] = [];
  let seenHeader = false;

  for (const line of lines) {
    if (line.startsWith("#")) {
      const [key, ...rest] = line.slice(1).trim().split(",");
      const value = rest.join(",");
      if (key === "canal_id") metadata.channelId = Number(value);
      if (key === "canal_nombre") metadata.channelName = value;
      if (key === "exportado_en") metadata.exportedAt = value;
      continue;
    }

    if (!seenHeader) {
      seenHeader = true;
      continue;
    }

    const parts = line.split(",");
    if (parts.length < 4) continue;

    const createdAt = parts[1]?.trim();
    if (!createdAt) continue;

    const toNumber = (raw: string | undefined) => {
      const trimmed = raw?.trim() ?? "";
      if (trimmed === "") return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    };

    rows.push({
      createdAt,
      temperature: toNumber(parts[2]),
      humidity: toNumber(parts[3]),
    });
  }

  return { readings: rows, metadata };
}
