import { settings } from "@num/db";
import {
  Temporal,
  amountsWithinOnePercent,
  buildPayeeIndex,
  containedMatch,
  familyMatch,
  confidenceModes,
  learnedConfidence,
  linkWindowStart,
  matchLinks,
  occurrenceDates,
  scoreMatch,
  similarFactor,
  type ConfidenceMode,
  type LearnedRow,
  type LinkTransaction,
  type FamilySignal,
  type MatchResult,
  type PayeeIndex,
  type PlanSchedule,
  type RecurringSignal,
  type ScoreInput,
} from "@num/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { loadMortgageLearned, type MortgageHit, type MortgageLearned } from "./mortgage-learned";
type Reader = { all<T>(query: ReturnType<typeof sql>): T[] } & Pick<Db, "select">;

type ConfirmRow = {
  id: string;
  date: string;
  amount: number;
  payee: string;
  merchantId: string | null;
  categoryId: string;
};

type PlanRow = {
  id: string;
  name: string;
  kind: string;
  accountId: string;
  expectedAmount: number;
  tolerance: number;
  categoryId: string | null;
  transferAccountId: string | null;
  merchantId: string | null;
  startDate: string;
  endDate: string | null;
  freq: string;
  interval: number;
  monthDay: number | null;
  businessDayShift: string;
};

type TransferRow = { id: string; date: string; payee: string; transferAccountId: string };

export type MatchBook = {
  mode: ConfidenceMode;
  byPayee: Map<string, ConfirmRow[]>;
  transfersByPayee: Map<string, TransferRow[]>;
  mortgageLearned: Map<string, MortgageLearned>;
  payeeLearned: Map<string, ReturnType<typeof learnedConfidence>>;
  amountLearned: Map<string, ReturnType<typeof learnedConfidence>>;
  labels: Map<string, string>;
  tops: Map<string, Omit<FamilySignal, "word">>;
  index: PayeeIndex;
  mortgageIndex: PayeeIndex;
  contained: Map<string, string | null>;
  mortgageContained: Map<string, MortgageHit | null>;
  families: Map<string, FamilySignal | null>;
};

function asMode(value: string | undefined): ConfidenceMode {
  if (value && (confidenceModes as readonly string[]).includes(value)) {
    return value as ConfidenceMode;
  }
  return "balanced";
}

export function confidenceMode(db: Reader): ConfidenceMode {
  const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "autoConfidence")).get();
  return asMode(row?.value);
}

export function loadMatchBook(db: Reader): MatchBook {
  const rows = db.all<ConfirmRow>(sql`
    select t.id as id, t.date as date, t.amount as amount, t.payee_normalized as payee,
      t.merchant_id as merchantId, l.category_id as categoryId
    from transactions t
    inner join transaction_lines l on l.transaction_id = t.id
    where 1 = 1
      and t.mirror = 0
      and t.auto_reason is null
      and l.category_id is not null
      and l.transfer_account_id is null
      and not exists (
        select 1 from transaction_lines extra
        where extra.transaction_id = t.id and extra.id <> l.id
      )
  `);
  const byPayee = new Map<string, ConfirmRow[]>();
  for (const row of rows) {
    const list = byPayee.get(row.payee);
    if (list) {
      list.push(row);
    } else {
      byPayee.set(row.payee, [row]);
    }
  }
  const transfers = db.all<TransferRow>(sql`
    select t.id as id, t.date as date, t.payee_normalized as payee, l.transfer_account_id as transferAccountId
    from transactions t
    inner join transaction_lines l on l.transaction_id = t.id
    where 1 = 1
      and t.mirror = 0
      and t.auto_reason is null
      and l.category_id is null
      and l.transfer_account_id is not null
      and not exists (
        select 1 from transaction_lines extra
        where extra.transaction_id = t.id and extra.id <> l.id
      )
  `);
  const transfersByPayee = new Map<string, TransferRow[]>();
  for (const row of transfers) {
    const list = transfersByPayee.get(row.payee);
    if (list) {
      list.push(row);
    } else {
      transfersByPayee.set(row.payee, [row]);
    }
  }
  const payeeLearned = new Map<string, ReturnType<typeof learnedConfidence>>();
  const labels = new Map<string, string>();
  const tops: MatchBook["tops"] = new Map();
  for (const [payee, rows] of byPayee) {
    const scores = learnedConfidence(learnedOf(rows));
    payeeLearned.set(payee, scores);
    const top = scores[0];
    if (top) {
      labels.set(payee, `${top.categoryId}\0${top.merchantId ?? ""}`);
      tops.set(payee, { ...top, transferAccountId: null });
    }
  }
  for (const [payee, rows] of transfersByPayee) {
    const top = learnedConfidence(rows.map((row) => ({ id: row.id, date: row.date, categoryId: row.transferAccountId, merchantId: null })))[0];
    if (top && !labels.has(payee)) {
      labels.set(payee, `transfer\0${top.categoryId}`);
      tops.set(payee, { ...top, categoryId: null, merchantId: null, transferAccountId: top.categoryId });
    }
  }
  const mortgageLearned = loadMortgageLearned(db);
  const index = buildPayeeIndex(labels.keys());
  const mortgageIndex = buildPayeeIndex(mortgageLearned.keys());
  return {
    mode: confidenceMode(db),
    byPayee,
    transfersByPayee,
    mortgageLearned,
    payeeLearned,
    amountLearned: new Map(),
    labels,
    tops,
    index,
    mortgageIndex,
    contained: new Map(),
    mortgageContained: new Map(),
    families: new Map(),
  };
}

function learnedOf(rows: readonly ConfirmRow[]): LearnedRow[] {
  return rows.map((row) => ({ id: row.id, date: row.date, categoryId: row.categoryId, merchantId: row.merchantId }));
}

/** The learned payee that a payee without answers of its own contains (decision 0026). */
export function containedFor(book: MatchBook, payee: string): string | null {
  if (book.labels.has(payee)) {
    return null;
  }
  let found = book.contained.get(payee);
  if (found === undefined) {
    found = containedMatch(book.index, payee, (learned) => book.labels.get(learned) ?? null);
    book.contained.set(payee, found);
  }
  return found;
}

/** The answer that other learned payees with the same first word teach, when they all agree (decision 0026, rule 7). */
export function familyFor(book: MatchBook, payee: string): FamilySignal | null {
  if (book.labels.has(payee)) {
    return null;
  }
  let found = book.families.get(payee);
  if (found === undefined) {
    const family = familyMatch(book.index, payee, (learned) => book.labels.get(learned) ?? null);
    const tops = (family?.payees ?? []).map((name) => book.tops.get(name));
    const first = tops[0];
    const lowest = tops.reduce((low, top) => Math.min(low, top?.confidence ?? 0), 1);
    found = family && first ? { ...first, word: family.word, confidence: lowest } : null;
    book.families.set(payee, found);
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
  const contained = containedFor(book, input.payee);
  const family = contained ? null : familyFor(book, input.payee);
  const same = book.byPayee.get(input.payee) ?? [];
  const amountKey = `${input.payee}\0${input.amount}`;
  let amountScores = book.amountLearned.get(amountKey);
  if (!amountScores) {
    amountScores = learnedConfidence(learnedOf(same.filter((row) => amountsWithinOnePercent(row.amount, input.amount))));
    book.amountLearned.set(amountKey, amountScores);
  }
  const scored: ScoreInput = {
    mode: book.mode,
    recurring: input.recurring,
    amountRows: [],
    payeeRows: [],
    amountScores,
    payeeScores: book.payeeLearned.get(input.payee) ?? [],
    similar: contained
      ? {
          payee: contained,
          scores: book.payeeLearned.get(contained) ?? [],
          transferRows: book.transfersByPayee.get(contained) ?? [],
        }
      : null,
    family,
    transferRows: book.transfersByPayee.get(input.payee) ?? [],
  };
  return scoreMatch(scored);
}

function scheduleOf(row: PlanRow): PlanSchedule {
  return {
    startDate: row.startDate,
    endDate: row.endDate,
    freq: row.freq as PlanSchedule["freq"],
    interval: row.interval,
    monthDay: row.monthDay,
    businessDayShift: row.businessDayShift as PlanSchedule["businessDayShift"],
  };
}

function graceDays(db: Reader): number {
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
  const plans = db.all<PlanRow>(sql`
    select id, name, kind, account_id as accountId, expected_amount as expectedAmount, tolerance,
      category_id as categoryId, transfer_account_id as transferAccountId, merchant_id as merchantId,
      start_date as startDate, end_date as endDate, freq, interval, month_day as monthDay,
      business_day_shift as businessDayShift
    from recurring_plans
    where active = 1 and archived_at is null
  `);
  if (plans.length === 0) {
    return hits;
  }
  const grace = graceDays(db);
  const links = db.all<{ planId: string; dueDate: string; transactionId: string | null }>(sql`
    select plan_id as planId, due_date as dueDate, transaction_id as transactionId from occurrence_links
  `);
  const linked = new Set(links.map((link) => `${link.planId}|${link.dueDate}`));
  const taken = new Set(links.flatMap((link) => (link.transactionId ? [link.transactionId] : [])));
  const limit = Temporal.PlainDate.from(asOf).add({ days: grace }).toString();
  const occurrences = plans.flatMap((plan) => {
    const from = linkWindowStart(plan.startDate, asOf);
    return occurrenceDates(scheduleOf(plan), limit, from).flatMap((date) =>
      linked.has(`${plan.id}|${date.dueDate}`)
        ? []
        : [
            {
              planId: plan.id,
              dueDate: date.dueDate,
              accountId: plan.accountId,
              merchantId: plan.merchantId,
              expectedAmount: plan.expectedAmount,
              tolerance: plan.tolerance,
            },
          ],
    );
  });
  const accountIds = new Set(plans.map((plan) => plan.accountId));
  const from = Temporal.PlainDate.from(asOf).subtract({ months: 13 }).subtract({ days: grace }).toString();
  const to = Temporal.PlainDate.from(asOf).add({ days: grace * 2 }).toString();
  const existing = db.all<LinkTransaction>(sql`
    select id, account_id as accountId, date, amount, merchant_id as merchantId
    from transactions
    where date >= ${from} and date <= ${to}
  `).filter((row) => accountIds.has(row.accountId) && !taken.has(row.id));
  const pendingIds = new Set(pending.map((row) => row.id));
  const unique = matchLinks(
    occurrences,
    [...existing.filter((row) => !pendingIds.has(row.id)), ...pending],
    grace,
  ).unique;
  const mortgages = new Set(
    db.all<{ id: string }>(sql`select id from accounts where kind = 'mortgage'`).map((row) => row.id),
  );
  const byPlan = new Map(plans.map((plan) => [plan.id, plan]));
  for (const pair of unique) {
    if (!pendingIds.has(pair.transactionId)) {
      continue;
    }
    const plan = byPlan.get(pair.planId);
    if (!plan) {
      continue;
    }
    const mortgage = plan.kind === "transfer" && plan.transferAccountId !== null && mortgages.has(plan.transferAccountId);
    hits.set(pair.transactionId, {
      planId: plan.id,
      planName: plan.name,
      categoryId: mortgage ? null : plan.categoryId,
      merchantId: plan.merchantId,
      transferAccountId: plan.transferAccountId,
      mortgage,
      dueDate: pair.dueDate,
    });
  }
  return hits;
}

export function learnedCount(rows: readonly LearnedRow[]): number {
  return learnedConfidence(rows).reduce((max, score) => Math.max(max, score.count), 0);
}
