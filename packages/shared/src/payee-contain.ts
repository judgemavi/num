/** Decision 0026: match a new payee to a learned payee by containment. No lists, only counts from the user's data. */

const cutMinimum = 4;
const noiseMinimum = 5;

type Entry = { payee: string; words: string[] };

export type PayeeIndex = {
  noise: ReadonlySet<string>;
  byFirst: Map<string, Entry[]>;
  firstsByStem: Map<string, string[]>;
};

export type ContainedMatch = { kind: "same" | "similar"; payee: string };

function wordsOf(payee: string): string[] {
  return payee.split(" ").filter((word) => word.length > 0);
}

/** Two different words where the shorter is a prefix of the longer and has 4 or more letters. */
function isCut(left: string, right: string): boolean {
  return left !== right && Math.min(left.length, right.length) >= cutMinimum && (left.startsWith(right) || right.startsWith(left));
}

/** A noise word is never the first word of a payee, and it follows 5 or more different first words. */
export function noiseWords(payees: Iterable<string>): Set<string> {
  const firsts = new Set<string>();
  const followed = new Map<string, Set<string>>();
  for (const payee of payees) {
    const [first, ...rest] = wordsOf(payee);
    if (first === undefined) {
      continue;
    }
    firsts.add(first);
    for (const word of rest) {
      const set = followed.get(word);
      if (set) {
        set.add(first);
      } else {
        followed.set(word, new Set([first]));
      }
    }
  }
  const noise = new Set<string>();
  for (const [word, set] of followed) {
    if (!firsts.has(word) && set.size >= noiseMinimum) {
      noise.add(word);
    }
  }
  return noise;
}

/** Indexes the learned payees by first word. Build it once for each book. */
export function buildPayeeIndex(noise: ReadonlySet<string>, learned: Iterable<string>): PayeeIndex {
  const byFirst = new Map<string, Entry[]>();
  for (const payee of new Set(learned)) {
    const words = wordsOf(payee);
    const first = words[0];
    if (first === undefined) {
      continue;
    }
    const list = byFirst.get(first);
    if (list) {
      list.push({ payee, words });
    } else {
      byFirst.set(first, [{ payee, words }]);
    }
  }
  const firstsByStem = new Map<string, string[]>();
  for (const first of byFirst.keys()) {
    if (first.length < cutMinimum) {
      continue;
    }
    const stem = first.slice(0, cutMinimum);
    const list = firstsByStem.get(stem);
    if (list) {
      list.push(first);
    } else {
      firstsByStem.set(stem, [first]);
    }
  }
  return { noise, byFirst, firstsByStem };
}

function anchored(index: PayeeIndex, first: string): Entry[] {
  const entries = [...(index.byFirst.get(first) ?? [])];
  if (first.length >= cutMinimum) {
    for (const other of index.firstsByStem.get(first.slice(0, cutMinimum)) ?? []) {
      if (isCut(first, other)) {
        entries.push(...(index.byFirst.get(other) ?? []));
      }
    }
  }
  return entries;
}

function sameWord(newWord: string, learnedWord: string, cutAllowed: boolean): boolean {
  return newWord === learnedWord || (cutAllowed && isCut(newWord, learnedWord));
}

/** The number of learned words that are not noise when all of them are in the new payee. Null when one is not. */
function containedCount(index: PayeeIndex, entry: Entry, words: readonly string[]): number | null {
  let count = 0;
  const last = entry.words.length - 1;
  for (let position = 0; position <= last; position += 1) {
    const word = entry.words[position] ?? "";
    if (index.noise.has(word)) {
      continue;
    }
    const cutAllowed = position === 0 || position === last;
    if (!words.some((candidate) => sameWord(candidate, word, cutAllowed))) {
      return null;
    }
    count += 1;
  }
  return count;
}

function hasOtherWords(index: PayeeIndex, entry: Entry, words: readonly string[]): boolean {
  const last = entry.words.length - 1;
  return words.some(
    (word) =>
      !index.noise.has(word) &&
      !entry.words.some((learned, position) => sameWord(word, learned, position === 0 || position === last)),
  );
}

/**
 * The learned payee that the new payee contains, with the most words that are not noise.
 * `labelOf` gives the answer a learned payee teaches. Two equal candidates with different answers give no match.
 */
export function containedMatch(
  index: PayeeIndex,
  payee: string,
  labelOf: (learnedPayee: string) => string | null,
): ContainedMatch | null {
  const words = wordsOf(payee);
  const first = words[0];
  if (first === undefined) {
    return null;
  }
  let best: { entry: Entry; kind: ContainedMatch["kind"] }[] = [];
  let bestCount = 0;
  for (const entry of anchored(index, first)) {
    if (entry.payee === payee) {
      continue;
    }
    const count = containedCount(index, entry, words);
    if (count === null || count < bestCount) {
      continue;
    }
    if (count > bestCount) {
      best = [];
      bestCount = count;
    }
    best.push({ entry, kind: hasOtherWords(index, entry, words) ? "similar" : "same" });
  }
  if (best.length === 0 || new Set(best.map((item) => labelOf(item.entry.payee) ?? `\0${item.entry.payee}`)).size > 1) {
    return null;
  }
  best.sort((left, right) => (left.kind === right.kind ? (left.entry.payee < right.entry.payee ? -1 : 1) : left.kind === "same" ? -1 : 1));
  const chosen = best[0];
  return chosen ? { kind: chosen.kind, payee: chosen.entry.payee } : null;
}
