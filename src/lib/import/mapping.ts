/**
 * Column mapping (MVP spec, section 13.4).
 *
 * The operator can always override, but guessing correctly on the common
 * cases removes a step from every import. Matching is accent- and
 * case-insensitive because a Spanish spreadsheet will say "Temperatura" and
 * ThingSpeak's own export says "field1".
 */

export type MappedField = "createdAt" | "temperature" | "humidity";

export type ColumnMapping = Record<MappedField, string | null>;

export const EMPTY_MAPPING: ColumnMapping = {
  createdAt: null,
  temperature: null,
  humidity: null,
};

/** Lowercases, strips accents and collapses separators to a single space. */
export function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CANDIDATES: Record<MappedField, string[]> = {
  createdAt: [
    "created at",
    "createdat",
    "timestamp",
    "fecha",
    "fecha hora",
    "fecha y hora",
    "hora",
    "datetime",
    "date",
    "time",
  ],
  temperature: [
    "field1",
    "field 1",
    "temperatura",
    "temperature",
    "temp",
    "temperatura c",
    "temperatura (c)",
  ],
  humidity: [
    "field2",
    "field 2",
    "humedad",
    "humidity",
    "hum",
    "humedad relativa",
    "humedad relativa (%)",
  ],
};

/**
 * Guesses the mapping from a header row.
 *
 * An exact match always beats a partial one, so a file with both "field1" and
 * "temperatura ambiente" maps field1 rather than whichever appeared first.
 * A column already claimed by one field cannot be claimed by another.
 */
export function detectMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping: ColumnMapping = { ...EMPTY_MAPPING };
  const claimed = new Set<string>();

  const claim = (field: MappedField, index: number) => {
    mapping[field] = headers[index];
    claimed.add(headers[index]);
  };

  for (const pass of ["exact", "partial"] as const) {
    for (const field of Object.keys(CANDIDATES) as MappedField[]) {
      if (mapping[field] !== null) continue;

      const index = normalized.findIndex((header, i) => {
        if (claimed.has(headers[i])) return false;
        return pass === "exact"
          ? CANDIDATES[field].includes(header)
          : CANDIDATES[field].some(
              (candidate) =>
                header.startsWith(candidate) || header.includes(candidate),
            );
      });

      if (index >= 0) claim(field, index);
    }
  }

  return mapping;
}

export function isMappingComplete(mapping: ColumnMapping): boolean {
  return Object.values(mapping).every((column) => column !== null);
}
