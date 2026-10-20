export type CsvCell = string | number;

/** Characters that make a spreadsheet read a cell as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One CSV field. Numbers are written as they are; text that a spreadsheet could take for a
 * formula gets a leading apostrophe, and text with a delimiter, quote or line break is quoted.
 */
export function csvField(cell: CsvCell): string {
  if (typeof cell === 'number') {
    return String(cell);
  }
  const text = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvLine(cells: readonly CsvCell[]): string {
  return cells.map(csvField).join(',');
}

/** Lines end with CRLF (RFC 4180). */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((row) => `${csvLine(row)}\r\n`).join('');
}
