import type { ParsedTable } from "@/lib/csv/parse";

/**
 * Reads an XLSX file in the browser (MVP spec, section 13.2).
 *
 * ExcelJS is imported dynamically for the same reason it is on the export
 * side: an operator who never touches a spreadsheet should not download it.
 */

export type WorkbookSummary = {
  sheetNames: string[];
};

export async function readSheetNames(file: File): Promise<WorkbookSummary> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  return { sheetNames: workbook.worksheets.map((sheet) => sheet.name) };
}

/**
 * Converts a cell to the raw text the validator expects.
 *
 * Dates get special handling: Excel stores them as numbers, and ExcelJS hands
 * back a Date. Formatting it as ISO here is what lets a spreadsheet-authored
 * file validate at all — the alternative is an Excel serial like 46234.54.
 */
function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    // ExcelJS wraps formulas, hyperlinks and rich text in objects.
    const record = value as Record<string, unknown>;
    if ("result" in record) return cellToText(record.result);
    if ("text" in record) return cellToText(record.text);
    if ("richText" in record && Array.isArray(record.richText)) {
      return record.richText.map((part) => cellToText(part)).join("");
    }
    return "";
  }

  return String(value).trim();
}

export async function parseXlsx(
  file: File,
  sheetName?: string,
): Promise<ParsedTable> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheet = sheetName
    ? workbook.getWorksheet(sheetName)
    : workbook.worksheets[0];

  if (!sheet) {
    throw new Error(
      sheetName
        ? `La hoja "${sheetName}" no existe en el archivo.`
        : "El archivo no contiene ninguna hoja.",
    );
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    headers[columnNumber - 1] =
      cellToText(cell.value) || `columna${columnNumber}`;
  });

  const rows: Record<string, string>[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const record: Record<string, string> = {};
    for (const [index, header] of headers.entries()) {
      if (!header) continue;
      record[header] = cellToText(row.getCell(index + 1).value);
    }
    rows.push(record);
  });

  return {
    headers: headers.filter(Boolean),
    rows,
    delimiter: "",
    warnings: [],
  };
}
