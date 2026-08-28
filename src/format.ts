/** Money lives in the database as integer cents and is formatted only here. */

const group = (n: number) => n.toLocaleString('en-US');

/** Bare figure for the hero numbers — the Amount component adds the symbol. */
export const figure = (cents: number): string => group(Math.round(Math.abs(cents) / 100));

/**
 * A transaction's amount. Sums of a thousand or more drop their cents, which is
 * how the design reads: "6.40 €" next to "+4,200 €".
 */
export function amountLabel(cents: number, { signed = false } = {}): string {
  const abs = Math.abs(cents);
  const body =
    abs >= 100_000
      ? group(Math.round(abs / 100))
      : `${group(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, '0')}`;
  const sign = cents < 0 ? (signed ? '−' : '') : signed ? '+' : '';
  return `${sign}${body} €`;
}

/** Whole euros with the symbol, for the quieter figures. */
export const euroLabel = (cents: number): string =>
  `${cents < 0 ? '−' : ''}${group(Math.round(Math.abs(cents) / 100))} €`;

/** '44' or '6.4' from the keypad → cents. */
export function parseAmountToCents(input: string): number {
  const value = Number.parseFloat(input);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/**
 * The inverse, for seeding the keypad when editing an existing row. Whole euros
 * lose the ".00" so the keypad reads the way it would if you had just typed it.
 */
export function centsToAmountInput(cents: number): string {
  const abs = Math.abs(cents);
  return abs % 100 === 0 ? String(abs / 100) : (abs / 100).toFixed(2);
}
