/**
 * A CSV writer, in the shape `src/import/csv.ts` reads.
 *
 * The mirror of the importer on purpose: an export this app cannot read back is
 * not a backup, it is a report. Every column here is a column `import/plan.ts`
 * looks at, so a file that leaves round-trips into the same transactions.
 */
import { isoLocal } from '../time';

/** RFC4180's line ending. `splitRows` accepts either, but this is the standard. */
const EOL = '\r\n';

/** Quoting is only required around these; leaving it off keeps the file legible. */
const NEEDS_QUOTES = /["\r\n,]/;

const field = (value: string): string =>
  NEEDS_QUOTES.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** Header plus rows, quoted where it matters, with a trailing newline. */
export const toCsv = (columns: string[], rows: string[][]): string =>
  [columns, ...rows].map((row) => row.map(field).join(',')).join(EOL) + EOL;

/**
 * The columns, in the order a person scanning the file would want them: when,
 * how much, who, and the bookkeeping afterwards.
 *
 * `transaction_id` is last but it is not optional — the importer requires it and
 * uses it to recognise a row it has already seen, which is what makes importing
 * this file twice safe.
 */
export const EXPORT_COLUMNS = ['datetime', 'amount', 'name', 'category', 'note', 'transaction_id'];

export type ExportRow = {
  occurredAt: number;
  /** Signed, as stored: negative is money out. */
  amountCents: number;
  merchant: string;
  category: string | null;
  note: string | null;
  /**
   * The bank's own id where there was one, and this app's row id where there
   * wasn't — so every row carries a stable, unique id rather than the importer's
   * required column being blank for everything typed by hand.
   */
  transactionId: string;
};

export function transactionsToCsv(rows: ExportRow[]): string {
  return toCsv(
    EXPORT_COLUMNS,
    rows.map((row) => [
      isoLocal(row.occurredAt),
      // Decimal euros, signed, because that is what the importer parses. Cents
      // are the storage format, not the interchange one.
      (row.amountCents / 100).toFixed(2),
      row.merchant,
      row.category ?? '',
      row.note ?? '',
      row.transactionId,
    ]),
  );
}

/** `budget-2026-09-06.csv` — dated, so two exports don't collide in Files. */
export const exportFilename = (at: number = Date.now()): string =>
  `budget-${isoLocal(at).slice(0, 10)}.csv`;
