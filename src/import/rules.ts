/**
 * How an exported row becomes a categorised transaction: what the merchant is
 * called, and which category it belongs to.
 *
 * Everything here is pure — rows in, decisions out — so it can be reasoned about
 * without a database and tested without a simulator.
 */
import { sanitizeMerchant } from '../format';

/**
 * Payment processors that prefix the merchant they collected for. Left in, the
 * first token of "SP FLOWERSHOP" and "SP BIKEHIRE" would match, and two
 * unrelated shops would share a memory entry and a duplicate check.
 */
const PROCESSOR_PREFIXES = new Set(['sp', 'sumup', 'paypal', 'pp', 'www', 'card', 'apl']);

/**
 * A card descriptor's trailing noise: the terminal reference a marketplace
 * appends ("SHOP* A1B2C3D4E"), a branch number ("CATERER (DEUTSCHLAND) AG,
 * 10420"), a store code ("GROCER-1234 CITY CENTRE").
 */
const TRAILING_REFERENCE = /[*,-]\s*[A-Z0-9][A-Z0-9. ]*$/i;

/** Company suffixes, which have a spelling of their own rather than a case rule. */
const LEGAL_FORMS: Record<string, string> = {
  AG: 'AG', GMBH: 'GmbH', SA: 'SA', SARL: 'SARL', BV: 'BV', NV: 'NV',
  LTD: 'Ltd', INC: 'Inc', PLC: 'PLC', SPA: 'SpA', KG: 'KG', OHG: 'OHG',
};

/**
 * A vowel-less all-caps word is an abbreviation, not shouting: SV, DM, CH keep
 * their case where DANKE, IHR and ZUR are ordinary words that should not. It
 * mis-reads a vowel-carrying initialism — NASA becomes Nasa — which one rename
 * fixes for good, since the matching key ignores case and only the label moves.
 */
const isAbbreviation = (word: string) =>
  word === word.toUpperCase() && !/[AEIOU]/.test(word);

const titleCase = (input: string) =>
  input.replace(/\p{L}[\p{L}']*/gu, (word) => {
    const legal = LEGAL_FORMS[word.toUpperCase()];
    if (legal) return legal;
    return isAbbreviation(word) ? word : word[0].toUpperCase() + word.slice(1).toLowerCase();
  });

/**
 * Whether a descriptor is shouting. Not `=== toUpperCase()`: a single stray
 * lowercase letter from a transliterated umlaut ("BAeCKEREI HAUPTSTRASSE") would
 * exempt the whole string, so this goes on the balance of the letters.
 */
function isShouting(input: string): boolean {
  const letters = input.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return false;
  const upper = letters.filter((letter) => letter === letter.toUpperCase()).length;
  return upper / letters.length >= 0.6;
}

/**
 * What the transaction is called in the app. SHOUTING card descriptors are
 * title-cased, since every hand-entered name in the app is sentence case and a
 * list that mixes the two reads as two different apps.
 */
export function merchantName(raw: string): string {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  const trimmed = collapsed.replace(TRAILING_REFERENCE, '').trim() || collapsed;
  return sanitizeMerchant(isShouting(trimmed) ? titleCase(trimmed) : trimmed);
}

/**
 * The matching key behind that name, for the merchant memory and the duplicate
 * check. Lowercase, letters only, and processor prefixes carry their merchant
 * with them so "SP BIKEHIRE" keys as `spbikehire`, not `sp`.
 */
export function merchantKey(raw: string): string {
  const words = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word !== '' && !/^\d+$/.test(word));
  if (words.length === 0) return '';

  const take = PROCESSOR_PREFIXES.has(words[0]) ? 2 : 1;
  return words.slice(0, take).join('');
}

/**
 * Merchant category codes, grouped to this app's categories. Broader than any
 * one export needs, so the second bank's file is not a rewrite.
 *
 * Two rules held to deliberately:
 *
 * - Nothing maps to 'Other'. A code we don't know goes to review, where the user
 *   decides once and the merchant memory keeps it — filing it as Other would
 *   look like a decision while being the absence of one.
 * - 5912 (drug stores) and 5977 (cosmetics) are Groceries, not Health and not
 *   Shopping. A German drugstore basket is toiletries, cleaning supplies and
 *   staples — the same weekly shop as the supermarket, just a different door —
 *   so it belongs beside 5411 rather than beside furniture and clothing.
 *   Leaving Health for 80xx keeps that category meaning actual medical spending.
 */
const MCC_CATEGORIES: Record<string, string[]> = {
  Groceries: ['5411', '5422', '5441', '5451', '5462', '5499', '5912', '5977'],
  // 5813 is bars: a tab is eating-out spend, so it sits here rather than in Leisure.
  Dining: ['5811', '5812', '5813', '5814'],
  Transport: ['4111', '4121', '4131', '4784', '5533', '5541', '5542', '7523'],
  Shopping: [
    '5200', '5211', '5311', '5399', '5611', '5621', '5631', '5641', '5651',
    '5655', '5661', '5691', '5699', '5712', '5732', '5734', '5940',
    '5941', '5945', '5992', '5999',
  ],
  Health: ['5122', '5975', '5976', '8011', '8021', '8031', '8042', '8043', '8049', '8062', '8071', '8099'],
  Leisure: ['7832', '7841', '7911', '7922', '7929', '7932', '7933', '7991', '7996', '7997', '7998', '7999'],
  Subscription: ['4814', '4815', '4816', '4899', '5815', '5816', '5817', '5818', '5968', '7372'],
  Housing: ['4900', '6513', '7349'],
};

/**
 * Flattened once at module load: code → category name. A code must appear in
 * exactly one group above — listed twice, the last group silently wins and the
 * mistake shows up only as transactions filed somewhere surprising.
 */
const BY_CODE = new Map<string, string>(
  Object.entries(MCC_CATEGORIES).flatMap(([category, codes]) =>
    codes.map((code) => [code, category] as const),
  ),
);

/** The category name an MCC implies, or null when we would only be guessing. */
export const categoryForMcc = (mcc: string): string | null => BY_CODE.get(mcc.trim()) ?? null;

/**
 * A securities purchase carries no MCC — it never touched a card terminal — so
 * the export's own columns are what identify it.
 */
export const isSecuritiesPurchase = (row: { type: string; category: string }): boolean =>
  row.type.trim().toUpperCase() === 'BUY' || row.category.trim().toUpperCase() === 'TRADING';
