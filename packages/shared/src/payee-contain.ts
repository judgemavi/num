/** Match a new payee to a learned payee that it contains. The result is always "similar". */

const cutMinimum = 4;

type Entry = { payee: string; words: string[] };

export type PayeeIndex = Map<string, Entry[]>;

function wordsOf(payee: string) {
  return payee.split(" ").filter((word) => word.length > 0);
}

/** Indexes the learned payees by first word. Build it once for each book. */
export function buildPayeeIndex(learned: Iterable<string>): PayeeIndex {
  const index: PayeeIndex = new Map();
  for (const payee of new Set(learned)) {
    const words = wordsOf(payee);
    const first = words[0];
    if (first === undefined) {
      continue;
    }
    const list = index.get(first);
    if (list) {
      list.push({ payee, words });
    } else {
      index.set(first, [{ payee, words }]);
    }
  }
  return index;
}

/** The learned words are in the new words in order. Only the last new word may be the start of a learned word. */
function isContained(learned: readonly string[], words: readonly string[]) {
  let position = 0;
  for (const word of learned) {
    let found = false;
    while (position < words.length && !found) {
      const candidate = words[position] ?? "";
      const cut = position === words.length - 1 && candidate.length >= cutMinimum && word.startsWith(candidate);
      found = candidate === word || cut;
      position += 1;
    }
    if (!found) {
      return false;
    }
  }
  return true;
}

/**
 * The learned payee that the new payee contains, with the most words.
 * `labelOf` gives the answer a learned payee teaches. Two equal candidates with different answers give no match.
 */
export function containedMatch(
  index: PayeeIndex,
  payee: string,
  labelOf: (learnedPayee: string) => string | null,
): string | null {
  const words = wordsOf(payee);
  const first = words[0];
  if (first === undefined) {
    return null;
  }
  let best: Entry[] = [];
  for (const entry of index.get(first) ?? []) {
    if (entry.payee === payee || entry.words.length > words.length || !isContained(entry.words, words)) {
      continue;
    }
    const size = best[0]?.words.length ?? 0;
    if (entry.words.length > size) {
      best = [entry];
    } else if (entry.words.length === size) {
      best.push(entry);
    }
  }
  if (new Set(best.map((entry) => labelOf(entry.payee) ?? `\0${entry.payee}`)).size > 1) {
    return null;
  }
  return best.map((entry) => entry.payee).sort()[0] ?? null;
}

/**
 * Brand family (rule 7): the other learned payees with the same first word as the new payee.
 * Returns them when there are 2 or more and all teach the same answer. Otherwise null.
 */
export function familyMatch(
  index: PayeeIndex,
  payee: string,
  labelOf: (learnedPayee: string) => string | null,
): string[] | null {
  const word = wordsOf(payee)[0];
  if (word === undefined) {
    return null;
  }
  const payees = (index.get(word) ?? []).map((entry) => entry.payee).filter((name) => name !== payee);
  const labels = new Set(payees.map((name) => labelOf(name) ?? `\0${name}`));
  return payees.length >= 2 && labels.size === 1 ? payees.sort() : null;
}
