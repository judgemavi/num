import { occurrenceLinks, transactionLines, transactions, type OccurrenceLinkRow } from "@num/db";
import {
  Temporal,
  planProposalKey,
  detectPlans,
  isInboxMissed,
  linkDateRange,
  matchLinks,
  missedCandidates,
  occurrenceWindows,
  openOccurrences,
  variableAmounts,
  withinTolerance,
  type DetectionTransaction,
  type Occurrence,
  type OccurrenceStatus,
  type OccurrenceWindow,
  type PlanProposal,
  type RecurringSignals,
  type UpcomingList,
} from "@num/shared";
import { and, eq, gte, inArray, lt, lte } from "drizzle-orm";
import type { Db } from "../db";
import { bookStep } from "./book-step";
import { decidedKeys } from "./decision-keys";
import { applyLinkedSchedule, isDecided } from "./match-apply";
import { activeSchedules, requireSchedule, type ScheduleView } from "./schedules";
import { withoutId, write, type WriteInput } from "./write";

type TxnRow = {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  merchantId: string | null;
};

const horizonDays = 400;

function horizon(asOf: string) {
  return Temporal.PlainDate.from(asOf).add({ days: horizonDays }).toString();
}

function transactionsByIds(db: Db, ids: readonly string[]) {
  const found = new Map<string, TxnRow>();
  for (let index = 0; index < ids.length; index += 400) {
    const slice = ids.slice(index, index + 400);
    if (slice.length === 0) {
      continue;
    }
    const rows = db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        date: transactions.date,
        amount: transactions.amount,
        merchantId: transactions.merchantId,
      })
      .from(transactions)
      .where(and(inArray(transactions.id, slice)))
      .all();
    for (const row of rows) {
      found.set(row.id, row);
    }
  }
  return found;
}

/** The transactions of the accounts from `from` (included) to `before` (not included). */
function transactionsForAccounts(db: Db, accountIds: readonly string[], from: string, before: string) {
  const rows: TxnRow[] = [];
  for (const accountId of accountIds) {
    rows.push(
      ...db
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          date: transactions.date,
          amount: transactions.amount,
          merchantId: transactions.merchantId,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.accountId, accountId),
            gte(transactions.date, from),
            lt(transactions.date, before),
          ),
        )
        .all(),
    );
  }
  return rows;
}

/**
 * Each transaction of the detection window with the facts of its lines: the category of a plain transaction
 * and the target of its one transfer line.
 */
function detectionTransactions(db: Db, asOf: string): DetectionTransaction[] {
  const since = Temporal.PlainDate.from(asOf).subtract({ months: 18 }).toString();
  const rows = db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      merchantId: transactions.merchantId,
      date: transactions.date,
      amount: transactions.amount,
      categoryId: transactionLines.categoryId,
      transferAccountId: transactionLines.transferAccountId,
    })
    .from(transactions)
    .innerJoin(transactionLines, eq(transactionLines.transactionId, transactions.id))
    .where(and(gte(transactions.date, since), lte(transactions.date, asOf)))
    .all();
  const lines = new Map<string, typeof rows>();
  for (const row of rows) {
    lines.set(row.id, [...(lines.get(row.id) ?? []), row]);
  }
  return [...lines.values()].flatMap((group) => {
    const first = group[0];
    if (!first) {
      return [];
    }
    const transfers = group.filter((line) => line.transferAccountId !== null);
    const plain = group.length === 1 && transfers.length === 0;
    return [
      {
        id: first.id,
        accountId: first.accountId,
        merchantId: first.merchantId,
        plain,
        categoryId: plain ? first.categoryId : null,
        transferAccountId: transfers.length === 1 ? (transfers[0]?.transferAccountId ?? null) : null,
        date: first.date,
        amount: first.amount,
      },
    ];
  });
}

/**
 * A schedule of the account covers a proposal for its merchant. A schedule with no merchant covers a proposal for its
 * category, or a proposal for one amount when it has no category and the amount is in its tolerance.
 * A schedule with no merchant covers a proposal for its transfer target.
 */
function covers(schedule: ScheduleView, proposal: PlanProposal) {
  if (schedule.accountId !== proposal.accountId) {
    return false;
  }
  if (proposal.merchantId || schedule.merchantId) {
    return schedule.merchantId === proposal.merchantId;
  }
  if (proposal.transferAccountId || schedule.transferAccountId) {
    return schedule.transferAccountId === proposal.transferAccountId;
  }
  if (proposal.categoryId || schedule.categoryId) {
    return schedule.categoryId === proposal.categoryId;
  }
  return withinTolerance(proposal.expectedAmount, schedule.expectedAmount, schedule.tolerance);
}

function amountsByDue(links: OccurrenceLinkRow[], txns: Map<string, TxnRow>, asOf: string) {
  return links
    .filter((link) => link.transactionId && link.dueDate <= asOf)
    .sort((left, right) => (left.dueDate < right.dueDate ? 1 : left.dueDate > right.dueDate ? -1 : 0))
    .flatMap((link) => {
      const txn = link.transactionId ? txns.get(link.transactionId) : undefined;
      return txn ? [txn.amount] : [];
    });
}

function statusFor(
  row: ScheduleView,
  window: OccurrenceWindow,
  asOf: string,
  link: OccurrenceLinkRow | undefined,
  actual: number | null,
): OccurrenceStatus {
  if (link?.skipped) {
    return "skipped";
  }
  if (link?.transactionId) {
    if (row.amountMode === "fixed" && actual !== null && !withinTolerance(actual, row.expectedAmount, row.tolerance)) {
      return "changed";
    }
    return "linked";
  }
  if (row.archivedAt === null && isInboxMissed(window, asOf)) {
    return "missed";
  }
  return "open";
}

export function listOccurrences(db: Db, bucketId: string, asOf: string) {
  const row = requireSchedule(db, bucketId);
  const links = db.select().from(occurrenceLinks).where(eq(occurrenceLinks.bucketId, bucketId)).all();
  const byDue = new Map(links.map((link) => [link.dueDate, link]));
  const txns = transactionsByIds(
    db,
    links.flatMap((link) => (link.transactionId ? [link.transactionId] : [])),
  );
  const actuals = amountsByDue(links, txns, asOf);
  const amounts =
    row.amountMode === "variable" ? variableAmounts(actuals, row.expectedAmount, bookStep(db)) : { forecast: row.expectedAmount, safe: row.expectedAmount };
  const items: Occurrence[] = occurrenceWindows(row, horizon(asOf)).map((window) => {
    const link = byDue.get(window.dueDate);
    const txn = link?.transactionId ? txns.get(link.transactionId) : undefined;
    const actual = txn ? txn.amount : null;
    return {
      dueDate: window.dueDate,
      nominalDate: window.nominalDate,
      status: statusFor(row, window, asOf, link, actual),
      transactionId: link?.transactionId ?? null,
      actualAmount: actual,
      reason: link?.reason ?? null,
    };
  });
  return { forecastAmount: amounts.forecast, safeAmount: amounts.safe, items };
}

const upcomingDays = 30;

/** The occurrences of all active schedules from `asOf` to 30 days later, by date. */
export function listUpcoming(db: Db, asOf: string): UpcomingList {
  const until = Temporal.PlainDate.from(asOf).add({ days: upcomingDays }).toString();
  const items = activeSchedules(db).flatMap((row) => {
    const list = listOccurrences(db, row.id, asOf);
    return list.items
      .filter((item) => item.dueDate >= asOf && item.dueDate <= until)
      .map((item) => ({ ...item, bucketId: row.id, accountId: row.accountId, forecastAmount: list.forecastAmount }));
  });
  items.sort((left, right) => (left.dueDate !== right.dueDate ? (left.dueDate < right.dueDate ? -1 : 1) : left.bucketId < right.bucketId ? -1 : 1));
  return { items };
}

/** The occurrences with no link or skip that a transaction can match on `asOf`, and the transactions in their windows. */
function linkInput(db: Db, schedules: ScheduleView[], links: OccurrenceLinkRow[], asOf: string) {
  const occurrences = openOccurrences(schedules, new Set(links.map((link) => `${link.bucketId}|${link.dueDate}`)), asOf);
  const range = linkDateRange(occurrences);
  const taken = new Set(links.flatMap((link) => (link.transactionId ? [link.transactionId] : [])));
  const accountIds = [...new Set(occurrences.map((item) => item.accountId))];
  const candidates = range ? transactionsForAccounts(db, accountIds, range.from, range.before).filter((txn) => !taken.has(txn.id)) : [];
  return { occurrences, candidates };
}

export function recurringSignals(db: Db, asOf: string): RecurringSignals {
  const schedules = activeSchedules(db);
  const links = db.select().from(occurrenceLinks).all();
  const linkedIds = links.flatMap((link) => (link.transactionId ? [link.transactionId] : []));
  const txnById = transactionsByIds(db, linkedIds);
  const changed: RecurringSignals["changed"] = [];
  const missed: RecurringSignals["missed"] = [];
  for (const row of schedules) {
    const scheduleLinks = links.filter((link) => link.bucketId === row.id);
    const byDue = new Map(scheduleLinks.map((link) => [link.dueDate, link]));
    if (row.amountMode === "fixed") {
      for (const link of scheduleLinks) {
        if (!link.transactionId) {
          continue;
        }
        const txn = txnById.get(link.transactionId);
        if (!txn || withinTolerance(txn.amount, row.expectedAmount, row.tolerance)) {
          continue;
        }
        changed.push({
          bucketId: row.id,
          dueDate: link.dueDate,
          transactionId: txn.id,
          expectedAmount: row.expectedAmount,
          actualAmount: txn.amount,
        });
      }
    }
    for (const window of missedCandidates(row, asOf)) {
      if (!byDue.has(window.dueDate)) {
        missed.push({ bucketId: row.id, dueDate: window.dueDate });
      }
    }
  }
  const open = linkInput(db, schedules, links, asOf);
  const ambiguous = matchLinks(open.occurrences, open.candidates).ambiguous;
  const declined = decidedKeys(db, "plan_proposal");
  const proposals = detectPlans(detectionTransactions(db, asOf), bookStep(db), asOf).filter((proposal) => {
    return !schedules.some((schedule) => covers(schedule, proposal)) && !declined.has(planProposalKey(proposal));
  });
  return { changed, missed, ambiguous, proposals };
}

export function autoLink(db: Db, asOf: string, input: WriteInput & { accountId?: string }): { linked: number } {
  const schedules = activeSchedules(db).filter((row) => !input.accountId || row.accountId === input.accountId);
  const open = linkInput(db, schedules, db.select().from(occurrenceLinks).all(), asOf);
  const unique = matchLinks(open.occurrences, open.candidates).unique;
  if (unique.length === 0) {
    return { linked: 0 };
  }
  const bySchedule = new Map(schedules.map((schedule) => [schedule.id, schedule]));
  write(db, { source: input.source, at: input.at }, (tx) => {
    for (const pair of unique) {
      const schedule = bySchedule.get(pair.bucketId);
      // An automatic link labels only a row that the person did not decide.
      if (schedule && !isDecided(tx, pair.transactionId)) {
        applyLinkedSchedule(tx, schedule, pair.transactionId);
      }
      const id = crypto.randomUUID();
      const row: OccurrenceLinkRow = {
        id,
        bucketId: pair.bucketId,
        dueDate: pair.dueDate,
        transactionId: pair.transactionId,
        skipped: false,
        reason: null,
      };
      tx.insert(occurrenceLinks).values(row).run();
      tx.audit({
        entity: "occurrence_links",
        entityId: id,
        action: "link",
        before: null,
        after: withoutId(row),
      });
    }
  });
  return { linked: unique.length };
}
