/**
 * A CSV reader for bank exports. Hand-rolled rather than a dependency: the whole
 * job is one function, and Expo Go rules out anything needing a native build.
 */

/**
 * Splits RFC4180 text into rows of fields.
 *
 * A `split(',')` would shred this format. A bank's `description` column carries
 * both commas and the decimal comma of a European locale — "Caterer AG, 10420,
 * 8,50 CHF, exchange rate: 1,08" is a *single* field — so quoting has to be
 * honoured properly, doubled quotes ("") included.
 */
function splitRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // Close the row on the first of a \r\n rather than emitting a blank one.
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Thrown for a file this importer cannot read at all. The message is shown. */
export class CsvError extends Error {}

/**
 * Parses to records keyed by header name.
 *
 * Keyed by name, never by position: banks add columns, and an index-based reader
 * would silently read the wrong field the day they do rather than fail loudly.
 */
export function parseCsv(text: string, required: string[] = []): Record<string, string>[] {
  const rows = splitRows(text).filter((row) => row.some((field) => field.trim() !== ''));
  const header = rows.shift();
  if (!header) throw new CsvError('That file is empty.');

  const columns = header.map((name) => name.trim());
  const missing = required.filter((name) => !columns.includes(name));
  if (missing.length > 0) {
    // Naming the column beats "invalid file": it says whether the wrong export
    // was picked or the format moved.
    throw new CsvError(`This export is missing the ${missing.join(', ')} column.`);
  }

  return rows.map((row) => {
    const record: Record<string, string> = {};
    columns.forEach((name, index) => {
      record[name] = (row[index] ?? '').trim();
    });
    return record;
  });
}
