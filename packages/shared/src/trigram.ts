export function characterTrigrams(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  const source = `  ${text}  `;
  const grams = new Set<string>();
  for (let index = 0; index < source.length - 2; index += 1) {
    grams.add(source.slice(index, index + 3));
  }
  return [...grams];
}

export function trigramCosine(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const rightSet = new Set(right);
  let shared = 0;
  for (const gram of left) {
    if (rightSet.has(gram)) {
      shared += 1;
    }
  }
  return shared / Math.sqrt(left.length * right.length);
}

export type TrigramIndex = {
  byGram: Map<string, number[]>;
  payees: { payee: string; grams: string[] }[];
};

export function buildTrigramIndex(payees: readonly string[]): TrigramIndex {
  const byGram = new Map<string, number[]>();
  const rows = payees.map((payee) => ({ payee, grams: characterTrigrams(payee) }));
  rows.forEach((row, index) => {
    for (const gram of row.grams) {
      const bucket = byGram.get(gram);
      if (bucket) {
        bucket.push(index);
      } else {
        byGram.set(gram, [index]);
      }
    }
  });
  return { byGram, payees: rows };
}

/** Scores only payees that share a trigram with the query. */
export function similarPayees(index: TrigramIndex, payee: string, minimum: number): { payee: string; similarity: number }[] {
  const grams = characterTrigrams(payee);
  const seen = new Set<number>();
  for (const gram of grams) {
    for (const indexOfPayee of index.byGram.get(gram) ?? []) {
      seen.add(indexOfPayee);
    }
  }
  const matches: { payee: string; similarity: number }[] = [];
  for (const indexOfPayee of seen) {
    const row = index.payees[indexOfPayee];
    if (!row || row.payee === payee) {
      continue;
    }
    const similarity = trigramCosine(grams, row.grams);
    if (similarity >= minimum) {
      matches.push({ payee: row.payee, similarity });
    }
  }
  matches.sort((left, right) => right.similarity - left.similarity || (left.payee < right.payee ? -1 : 1));
  return matches;
}
