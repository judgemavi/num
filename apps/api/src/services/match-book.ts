import { settings } from "@num/db";
import {
  Temporal,
  amountsWithinOnePercent,
  buildTrigramIndex,
  normalizePayee,
  confidenceModes,
  learnedConfidence,
  linkWindowStart,
  matchLinks,
  occurrenceDates,
  scoreMatch,
  similarPayees,
  type ConfidenceMode,
  type LearnedRow,
  type LinkTransaction,
  type MatchResult,
  type PlanSchedule,
  type RecurringSignal,
  type ScoreInput,
} from "@num/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
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

export type MatchBook = {
  mode: ConfidenceMode;
  byPayee: Map<string, ConfirmRow[]>;
  payees: string[];
  index: ReturnType<typeof buildTrigramIndex>;
  merchants: { id: string; name: string; categoryId: string; payee: string }[];
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
    where t.deleted_at is null
      and t.mirror = 0
      and t.auto_reason is null
      and l.category_id is not null
      and l.transfer_account_id is null
      and t.id in (
        select transaction_id from transaction_lines group by transaction_id having count(*) = 1
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
  const payees = [...byPayee.keys()];
  const merchants = db.all<{ id: string; name: string; categoryId: string }>(sql`
    select id as id, name as name, default_category_id as categoryId
    from merchants
    where archived_at is null and default_category_id is not null
  `);
  return {
    mode: confidenceMode(db),
    byPayee,
    payees,
    index: buildTrigramIndex(payees),
    merchants: merchants.map((merchant) => ({ ...merchant, payee: normalizePayee(merchant.name) })),
  };
}

function learnedOf(rows: readonly ConfirmRow[]): LearnedRow[] {
  return rows.map((row) => ({ id: row.id, date: row.date, categoryId: row.categoryId, merchantId: row.merchantId }));
}

export function scorePayee(
  book: MatchBook,
  input: { payee: string; amount: number; recurring: RecurringSignal | null },
): MatchResult {
  const same = book.byPayee.get(input.payee) ?? [];
  const amountRows = learnedOf(same.filter((row) => amountsWithinOnePercent(row.amount, input.amount)));
  const similar = similarPayees(book.index, input.payee).map((hit) => ({
    payee: hit.payee,
    similarity: hit.similarity,
    rows: learnedOf(book.byPayee.get(hit.payee) ?? []),
  }));
  const merchantHits = book.merchants.filter((merchant) => merchant.payee === input.payee);
  const merchant = merchantHits.length === 1 ? merchantHits[0] : null;
  const scored: ScoreInput = {
    mode: book.mode,
    recurring: input.recurring,
    amountRows,
    payeeRows: learnedOf(same),
    similar,
    merchant: merchant ? { id: merchant.id, name: merchant.name, categoryId: merchant.categoryId } : null,
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
    where deleted_at is null and date >= ${from} and date <= ${to}
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
