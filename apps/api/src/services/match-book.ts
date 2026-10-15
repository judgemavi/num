import { accounts, occurrenceLinks, settings, transactions, type TransactionRow } from "@num/db";
import {
  Temporal,
  amountGuardFor,
  bandSignals,
  buildPayeeIndex,
  candidateKey,
  containedMatch,
  familyMatch,
  fitLabels,
  learnedConfidence,
  learnedLabels,
  linkWindowStart,
  matchLinks,
  occurrenceDates,
  scoreMatch,
  similarFactor,
  type LearnedLabel,
  type LearnedRow,
  type LearnedScore,
  type LinkTransaction,
  type FamilySignal,
  type MatchResult,
  type PayeeIndex,
  type RecurringSignal,
} from "@num/shared";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { keepPrefix } from "./decision-keep";
import { loadMortgageLearned, type MortgageHit, type MortgageLearned } from "./mortgage-learned";
import { activeSchedules } from "./schedules";
import type { Reader } from "./write";

/**
 * The two reads below return one row for each confirmed transaction of the book. They stay raw SQL: the driver
 * makes the row objects, and the query builder is slower for a result of this size. The row types use the column types.
 */
type ConfirmRow = Pick<TransactionRow, "id" | "date" | "amount" | "merchantId"> & {
  payee: TransactionRow["payeeNormalized"];
  /** Null is the label "no category" of a kept row (decision 0046). */
  categoryId: string | null;
};

type TransferRow = Pick<TransactionRow, "id" | "date"> & {
  payee: TransactionRow["payeeNormalized"];
  transferAccountId: string;
};

/** A confirmed row with one line: not a mirror and not an automatic label. */
const confirmedLine = sql`
  t.mirror = 0
  and t.auto_reason is null
  and not exists (
    select 1 from transaction_lines extra
    where extra.transaction_id = t.id and extra.id <> l.id
  )
`;

type Direction = "out" | "in";

/** Decision 0036: the learned key is the payee and the direction. Zero is money in. */
function directionOf(amount: number): Direction {
  return amount < 0 ? "out" : "in";
}

/**
 * What the confirmed rows of one direction teach. Each map is keyed by the normalized payee. `payeeLearned` has the
 * "no category" labels. `named`, `labels`, `tops` and `index` do not: the similar payee and the brand family signals
 * do not use them (decision 0046).
 */
type Side = {
  bands: Map<string, LearnedLabel[]>;
  payeeLearned: Map<string, LearnedScore<string | null>[]>;
  named: Map<string, LearnedScore[]>;
  /** The learned signals of an amount, keyed by the payee and the labels whose band contains the amount. */
  bandLearned: Map<string, ReturnType<typeof bandSignals>>;
  labels: Map<string, string>;
  tops: Map<string, FamilySignal>;
  index: PayeeIndex;
  contained: Map<string, string | null>;
  families: Map<string, FamilySignal | null>;
};

export type MatchBook = {
  sides: Record<Direction, Side>;
  transfersByPayee: Map<string, TransferRow[]>;
  mortgageLearned: Map<string, MortgageLearned>;
  mortgageIndex: PayeeIndex;
  mortgageContained: Map<string, MortgageHit | null>;
};

function byPayee<T extends { payee: string }>(rows: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.payee);
    if (list) {
      list.push(row);
    } else {
      groups.set(row.payee, [row]);
    }
  }
  return groups;
}

/** A category label wins over a learned transfer. Learned transfers ignore the direction. */
function buildSide(rows: readonly ConfirmRow[], transferTops: ReadonlyMap<string, FamilySignal>): Side {
  const bands = new Map<string, LearnedLabel[]>();
  const payeeLearned = new Map<string, LearnedScore<string | null>[]>();
  const named = new Map<string, LearnedScore[]>();
  const labels = new Map<string, string>();
  const tops = new Map<string, FamilySignal>();
  for (const [payee, list] of byPayee(rows)) {
    const scores = learnedConfidence(list);
    payeeLearned.set(payee, scores);
    bands.set(payee, learnedLabels(list));
    const categories = scores.flatMap(({ categoryId, ...score }) => (categoryId === null ? [] : [{ ...score, categoryId }]));
    const top = categories[0];
    if (top) {
      named.set(payee, categories);
      labels.set(payee, candidateKey(top.categoryId, top.merchantId));
      tops.set(payee, { ...top, transferAccountId: null });
    }
  }
  for (const [payee, top] of transferTops) {
    if (!labels.has(payee)) {
      labels.set(payee, `transfer\0${top.transferAccountId}`);
      tops.set(payee, top);
    }
  }
  return {
    bands,
    payeeLearned,
    named,
    bandLearned: new Map(),
    labels,
    tops,
    index: buildPayeeIndex(labels.keys()),
    contained: new Map(),
    families: new Map(),
  };
}

export function loadMatchBook(db: Reader): MatchBook {
  const rows = db.all<ConfirmRow>(sql`
    select t.id as id, t.date as date, t.amount as amount, t.payee_normalized as payee,
      t.merchant_id as merchantId, l.category_id as categoryId
    from transactions t
    inner join transaction_lines l on l.transaction_id = t.id
    where ${confirmedLine}
      and l.transfer_account_id is null
      and (l.category_id is not null or exists (
        select 1 from inbox_decisions d where d.item_key = ${keepPrefix} || t.id
      ))
  `);
  const transfers = db.all<TransferRow>(sql`
    select t.id as id, t.date as date, t.payee_normalized as payee, l.transfer_account_id as transferAccountId
    from transactions t
    inner join transaction_lines l on l.transaction_id = t.id
    where ${confirmedLine}
      and l.category_id is null
      and l.transfer_account_id is not null
  `);
  const transfersByPayee = byPayee(transfers);
  const transferTops = new Map<string, FamilySignal>();
  for (const [payee, list] of transfersByPayee) {
    const top = learnedConfidence(transferLearned(list))[0];
    if (top) {
      transferTops.set(payee, { ...top, categoryId: null, merchantId: null, transferAccountId: top.categoryId });
    }
  }
  const out: ConfirmRow[] = [];
  const incoming: ConfirmRow[] = [];
  for (const row of rows) {
    (directionOf(row.amount) === "out" ? out : incoming).push(row);
  }
  const mortgageLearned = loadMortgageLearned(db);
  return {
    sides: { out: buildSide(out, transferTops), in: buildSide(incoming, transferTops) },
    transfersByPayee,
    mortgageLearned,
    mortgageIndex: buildPayeeIndex(mortgageLearned.keys()),
    mortgageContained: new Map(),
  };
}

function transferLearned(rows: readonly TransferRow[]): LearnedRow[] {
  return rows.map((row) => ({ id: row.id, date: row.date, categoryId: row.transferAccountId, merchantId: null }));
}

/** True when the payee has answers of its own. A kept "no category" is an answer (decision 0046). */
function hasAnswers(side: Side, payee: string) {
  return side.labels.has(payee) || side.payeeLearned.has(payee);
}

/** The learned payee that a payee without answers of its own contains (decision 0026). */
function containedFor(side: Side, payee: string): string | null {
  if (hasAnswers(side, payee)) {
    return null;
  }
  let found = side.contained.get(payee);
  if (found === undefined) {
    found = containedMatch(side.index, payee, (learned) => side.labels.get(learned) ?? null);
    side.contained.set(payee, found);
  }
  return found;
}

/** The answer that other learned payees with the same first word teach, when they all agree (decision 0026, rule 7). */
function familyFor(side: Side, payee: string): FamilySignal | null {
  if (hasAnswers(side, payee)) {
    return null;
  }
  let found = side.families.get(payee);
  if (found === undefined) {
    const family = familyMatch(side.index, payee, (learned) => side.labels.get(learned) ?? null);
    const tops = (family ?? []).map((name) => side.tops.get(name));
    const first = tops[0];
    const lowest = tops.reduce((low, top) => Math.min(low, top?.confidence ?? 0), 1);
    found = family && first ? { ...first, confidence: lowest } : null;
    side.families.set(payee, found);
  }
  return found;
}

/** The mortgage payment that a payee teaches. A payee that contains a learned payee teaches it with less confidence. */
export function mortgageLearnedFor(book: MatchBook, payee: string): MortgageHit | null {
  const exact = book.mortgageLearned.get(payee);
  if (exact) {
    return { ...exact, similarTo: null };
  }
  let found = book.mortgageContained.get(payee);
  if (found === undefined) {
    const learned = containedMatch(book.mortgageIndex, payee, (name) => book.mortgageLearned.get(name)?.accountId ?? null);
    const hit = learned ? book.mortgageLearned.get(learned) : undefined;
    found = learned && hit ? { ...hit, confidence: hit.confidence * similarFactor, similarTo: learned } : null;
    book.mortgageContained.set(payee, found);
  }
  return found;
}

export function scorePayee(
  book: MatchBook,
  input: { payee: string; amount: number; recurring: RecurringSignal | null },
): MatchResult {
  const side = book.sides[directionOf(input.amount)];
  const contained = containedFor(side, input.payee);
  const family = contained ? null : familyFor(side, input.payee);
  const bands = side.bands.get(input.payee) ?? [];
  const fit = fitLabels(bands, input.amount);
  const fitKey = `${input.payee}\0${fit.map((label) => label.key).join("\0")}`;
  let learned = side.bandLearned.get(fitKey);
  if (!learned) {
    learned = bandSignals(fit, side.payeeLearned.get(input.payee) ?? []);
    side.bandLearned.set(fitKey, learned);
  }
  return scoreMatch({
    ...learned,
    amountGuard: amountGuardFor(bands, fit, input.amount),
    recurring: input.recurring,
    similar: contained
      ? {
          scores: side.named.get(contained) ?? [],
          transferRows: book.transfersByPayee.get(contained) ?? [],
        }
      : null,
    family,
    transferRows: book.transfersByPayee.get(input.payee) ?? [],
  });
}

function graceDays(db: Reader) {
  const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "recurringGraceDays")).get();
  const parsed = Number(row?.value ?? "3");
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 3;
}

export type RecurringHit = RecurringSignal & { dueDate: string };

export function recurringForRows(db: Reader, pending: readonly LinkTransaction[], asOf: string): Map<string, RecurringHit> {
  const hits = new Map<string, RecurringHit>();
  if (pending.length === 0) {
    return hits;
  }
  const schedules = activeSchedules(db);
  if (schedules.length === 0) {
    return hits;
  }
  const grace = graceDays(db);
  const links = db
    .select({ bucketId: occurrenceLinks.bucketId, dueDate: occurrenceLinks.dueDate, transactionId: occurrenceLinks.transactionId })
    .from(occurrenceLinks)
    .all();
  const linked = new Set(links.map((link) => `${link.bucketId}|${link.dueDate}`));
  const taken = new Set(links.flatMap((link) => (link.transactionId ? [link.transactionId] : [])));
  const limit = Temporal.PlainDate.from(asOf).add({ days: grace }).toString();
  const occurrences = schedules.flatMap((schedule) => {
    const from = linkWindowStart(schedule.startDate, asOf);
    return occurrenceDates(schedule, limit, from).flatMap((date) =>
      linked.has(`${schedule.id}|${date.dueDate}`)
        ? []
        : [
            {
              bucketId: schedule.id,
              dueDate: date.dueDate,
              accountId: schedule.accountId,
              merchantId: schedule.merchantId,
              expectedAmount: schedule.expectedAmount,
              tolerance: schedule.tolerance,
            },
          ],
    );
  });
  const accountIds = new Set(schedules.map((schedule) => schedule.accountId));
  const from = Temporal.PlainDate.from(asOf).subtract({ months: 13 }).subtract({ days: grace }).toString();
  const to = Temporal.PlainDate.from(asOf).add({ days: grace * 2 }).toString();
  const existing = db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      date: transactions.date,
      amount: transactions.amount,
      merchantId: transactions.merchantId,
    })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .all()
    .filter((row) => accountIds.has(row.accountId) && !taken.has(row.id));
  const pendingIds = new Set(pending.map((row) => row.id));
  const unique = matchLinks(
    occurrences,
    [...existing.filter((row) => !pendingIds.has(row.id)), ...pending],
    grace,
  ).unique;
  const mortgages = new Set(
    db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.kind, "mortgage"))
      .all()
      .map((row) => row.id),
  );
  const bySchedule = new Map(schedules.map((schedule) => [schedule.id, schedule]));
  for (const pair of unique) {
    if (!pendingIds.has(pair.transactionId)) {
      continue;
    }
    const schedule = bySchedule.get(pair.bucketId);
    if (!schedule) {
      continue;
    }
    const mortgage = schedule.transferAccountId !== null && mortgages.has(schedule.transferAccountId);
    hits.set(pair.transactionId, {
      bucketId: schedule.id,
      categoryId: mortgage ? null : schedule.categoryId,
      merchantId: schedule.merchantId,
      transferAccountId: schedule.transferAccountId,
      mortgage,
      dueDate: pair.dueDate,
    });
  }
  return hits;
}
