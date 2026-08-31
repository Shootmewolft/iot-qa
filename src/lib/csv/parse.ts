import Papa from "papaparse";

export type ParsedTable = {
  headers: string[];
  /** One record per data row, keyed by header. Every value is raw text. */
  rows: Record<string, string>[];
  /** Delimiter Papa Parse settled on, shown to the operator for confidence. */
  delimiter: string;
  /** Non-fatal parse problems, e.g. a row with the wrong field count. */
  warnings: string[];
};

/**
 * Parses a CSV file in the browser (MVP spec, section 13.3).
 *
 * The delimiter is auto-detected rather than assumed: a Spanish-locale Excel
 * exports semicolons, and silently reading those as a single column would
 * produce thousands of meaningless validation errors.
 */
export function parseCsv(file: File): Promise<ParsedTable> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      // Everything stays a string: validation owns the numeric parsing, so it
      // can report WHY a cell failed instead of receiving a silent null.
      dynamicTyping: false,
      transformHeader: (header) => header.trim(),
      complete: (result) => {
        const headers = result.meta.fields ?? [];

        resolve({
          headers,
          rows: result.data,
          delimiter: result.meta.delimiter,
          warnings: result.errors
            .slice(0, 20)
            .map((error) =>
              error.row === undefined
                ? error.message
                : `Fila ${error.row + 2}: ${error.message}`,
            ),
        });
      },
      error: (error) => reject(error),
    });
  });
}
