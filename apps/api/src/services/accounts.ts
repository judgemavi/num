import { accounts, transactions, valuations } from "@num/db";
import {
  accountKinds,
  defaultOnBudget,
  paymentPolicies,
  type Account,
  type AccountCreate,
  type AccountKind,
  type AccountListQuery,
  type AccountUpdate,
  type PaymentPolicy,
  utcNow,
} from "@num/shared";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import { integerSum } from "../integer-sum";
import { ServiceError } from "../service-error";
import {
  accountBalance,
  assertCanArchive,
  assertSameClass,
  cardFields,
  interestRate,
  type CardFields,
} from "./account-rules";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

type Reader = Db | WriteTx;

type AccountRow = typeof accounts.$inferSelect;

function asKind(value: string): AccountKind {
  if (!(accountKinds as readonly string[]).includes(value)) {
    throw new Error("Unknown account kind");
  }
  return value as AccountKind;
}

function asPolicy(value: string | null): PaymentPolicy | null {
  if (value === null) {
    return null;
  }
  if (!(paymentPolicies as readonly string[]).includes(value)) {
    throw new Error("Unknown payment policy");
  }
  return value as PaymentPolicy;
}

function readSum(row: { total: unknown } | undefined): number {
  if (!row) {
    return 0;
  }
  return integerSum(row.total);
}

function transactionTotals(db: Reader): Map<string, number> {
  const rows = db
    .select({
      accountId: transactions.accountId,
      total: sql<unknown>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .groupBy(transactions.accountId)
    .all();
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.accountId, integerSum(row.total));
  }
  return totals;
}

function sumAfter(db: Reader, accountId: string, date: string): number {
  const row = db
    .select({
      total: sql<unknown>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      and(eq(transactions.accountId, accountId), isNull(transactions.deletedAt), gt(transactions.date, date)),
    )
    .get();
  return readSum(row);
}

function latestValuations(db: Reader): Map<string, { date: string; balance: number }> {
  const rows = db
    .select({
      accountId: valuations.accountId,
      date: valuations.date,
      balance: valuations.balance,
    })
    .from(valuations)
    .where(isNull(valuations.deletedAt))
    .all();
  const latest = new Map<string, { date: string; balance: number }>();
  for (const row of rows) {
    const current = latest.get(row.accountId);
    if (!current || row.date > current.date) {
      latest.set(row.accountId, { date: row.date, balance: row.balance });
    }
  }
  return latest;
}

function balanceFor(
  db: Reader,
  row: { id: string; kind: AccountKind; openingBalance: number },
  totals?: Map<string, number>,
  latest?: Map<string, { date: string; balance: number }>,
): number {
  const valuation = (latest ?? latestValuations(db)).get(row.id) ?? null;
  return accountBalance({
    kind: row.kind,
    openingBalance: row.openingBalance,
    transactionTotal: (totals ?? transactionTotals(db)).get(row.id) ?? 0,
    valuation: valuation
      ? { balance: valuation.balance, transactionsAfter: sumAfter(db, row.id, valuation.date) }
      : null,
  });
}

function blankToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function snapshot(row: {
  name: string;
  institution: string | null;
  kind: string;
  onBudget: boolean;
  openingDate: string;
  openingBalance: number;
  archivedAt: string | null;
  creditLimit: number | null;
  statementDay: number | null;
  dueDay: number | null;
  paymentPolicy: string | null;
  fixedPayment: number | null;
  interestRateMilliPct: number | null;
}) {
  return {
    name: row.name,
    institution: row.institution,
    kind: row.kind,
    onBudget: row.onBudget,
    openingDate: row.openingDate,
    openingBalance: row.openingBalance,
    archivedAt: row.archivedAt,
    creditLimit: row.creditLimit,
    statementDay: row.statementDay,
    dueDay: row.dueDay,
    paymentPolicy: row.paymentPolicy,
    fixedPayment: row.fixedPayment,
    interestRateMilliPct: row.interestRateMilliPct,
  };
}

function toAccount(row: AccountRow, balance: number): Account {
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    kind: asKind(row.kind),
    onBudget: row.onBudget,
    openingDate: row.openingDate,
    openingBalance: row.openingBalance,
    archivedAt: row.archivedAt,
    creditLimit: row.creditLimit,
    statementDay: row.statementDay,
    dueDay: row.dueDay,
    paymentPolicy: asPolicy(row.paymentPolicy),
    fixedPayment: row.fixedPayment,
    interestRateMilliPct: row.interestRateMilliPct,
    balance,
  };
}

function storedFields(input: {
  name: string;
  institution: string | null;
  kind: AccountKind;
  onBudget: boolean;
  openingDate: string;
  openingBalance: number;
  archivedAt: string | null;
  card: CardFields;
  interestRateMilliPct: number | null;
}) {
  return {
    name: input.name,
    institution: input.institution,
    kind: input.kind,
    onBudget: input.onBudget,
    openingDate: input.openingDate,
    openingBalance: input.openingBalance,
    archivedAt: input.archivedAt,
    creditLimit: input.card.creditLimit,
    statementDay: input.card.statementDay,
    dueDay: input.card.dueDay,
    paymentPolicy: input.card.paymentPolicy,
    fixedPayment: input.card.fixedPayment,
    interestRateMilliPct: input.interestRateMilliPct,
  };
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareName(left: string, right: string): number {
  const folded = compareText(left.toLowerCase(), right.toLowerCase());
  if (folded !== 0) {
    return folded;
  }
  return compareText(left, right);
}

export function listAccounts(db: Db, query: AccountListQuery) {
  const rows = db
    .select()
    .from(accounts)
    .all()
    .filter((row) => (query.archived ? row.archivedAt !== null : row.archivedAt === null));
  const totals = transactionTotals(db);
  const latest = latestValuations(db);
  const items = rows.map((row) => toAccount(row, balanceFor(db, { ...row, kind: asKind(row.kind) }, totals, latest)));
  const sort = query.sort ?? "name";
  const dir = query.dir === "desc" ? -1 : 1;
  items.sort((left, right) => {
    const field = sort === "kind" ? compareText(left.kind, right.kind) : compareName(left.name, right.name);
    if (field !== 0) {
      return field * dir;
    }
    return compareText(left.id, right.id);
  });
  const start = (query.page - 1) * query.pageSize;
  return {
    items: items.slice(start, start + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total: items.length,
  };
}

export function createAccount(db: Db, input: AccountCreate & WriteInput): Account {
  const card = cardFields(input.kind, input);
  const rate = interestRate(input.kind, input.interestRateMilliPct);
  const id = crypto.randomUUID();
  const row = {
    id,
    ...storedFields({
      name: input.name.trim(),
      institution: blankToNull(input.institution),
      kind: input.kind,
      onBudget: input.onBudget ?? defaultOnBudget(input.kind),
      openingDate: input.openingDate,
      openingBalance: input.openingBalance,
      archivedAt: null,
      card,
      interestRateMilliPct: rate,
    }),
  };
  write(db, { source: input.source, at: input.at }, (tx) => {
    tx.insert(accounts).values(row).run();
    tx.audit({
      entity: "accounts",
      entityId: id,
      action: "create",
      before: null,
      after: snapshot(row),
    });
  });
  return toAccount(row, row.openingBalance);
}

export function updateAccount(db: Db, id: string, input: AccountUpdate & WriteInput): Account {
  let updated: Account | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(accounts).where(eq(accounts.id, id)).get();
    if (!existing) {
      throw new ServiceError("account_not_found", 404);
    }
    const currentKind = asKind(existing.kind);
    assertSameClass(currentKind, input.kind);
    const card = cardFields(input.kind, input);
    const rate = interestRate(input.kind, input.interestRateMilliPct);
    const next = storedFields({
      name: input.name.trim(),
      institution: blankToNull(input.institution),
      kind: input.kind,
      onBudget: input.onBudget,
      openingDate: input.openingDate,
      openingBalance: input.openingBalance,
      archivedAt: existing.archivedAt,
      card,
      interestRateMilliPct: rate,
    });
    tx.update(accounts).set(next).where(eq(accounts.id, id)).run();
    tx.audit({
      entity: "accounts",
      entityId: id,
      action: "update",
      before: snapshot(existing),
      after: snapshot(next),
    });
    updated = toAccount(
      { id, ...next },
      balanceFor(tx, { id, kind: input.kind, openingBalance: next.openingBalance }),
    );
  });
  if (!updated) {
    throw new Error("Update did not return an account");
  }
  return updated;
}

export function archiveAccount(
  db: Db,
  id: string,
  input: { confirm: boolean } & WriteInput,
): Account {
  const at = input.at ?? utcNow();
  let archived: Account | undefined;
  write(db, { source: input.source, at }, (tx) => {
    const existing = tx.select().from(accounts).where(eq(accounts.id, id)).get();
    if (!existing) {
      throw new ServiceError("account_not_found", 404);
    }
    if (existing.archivedAt) {
      throw new ServiceError("account_archived", 409);
    }
    const kind = asKind(existing.kind);
    const balance = balanceFor(tx, { id, kind, openingBalance: existing.openingBalance });
    assertCanArchive(balance, input.confirm);
    const next = { ...existing, archivedAt: at };
    tx.update(accounts).set({ archivedAt: at }).where(eq(accounts.id, id)).run();
    tx.audit({
      entity: "accounts",
      entityId: id,
      action: "archive",
      before: snapshot(existing),
      after: snapshot(next),
    });
    archived = toAccount(next, balance);
  });
  if (!archived) {
    throw new Error("Archive did not return an account");
  }
  return archived;
}

export function restoreAccount(db: Db, id: string, input: WriteInput): Account {
  let restored: Account | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(accounts).where(eq(accounts.id, id)).get();
    if (!existing) {
      throw new ServiceError("account_not_found", 404);
    }
    if (!existing.archivedAt) {
      throw new ServiceError("account_not_archived", 409);
    }
    const kind = asKind(existing.kind);
    const next = { ...existing, archivedAt: null };
    tx.update(accounts).set({ archivedAt: null }).where(eq(accounts.id, id)).run();
    tx.audit({
      entity: "accounts",
      entityId: id,
      action: "restore",
      before: snapshot(existing),
      after: snapshot(next),
    });
    restored = toAccount(next, balanceFor(tx, { id, kind, openingBalance: existing.openingBalance }));
  });
  if (!restored) {
    throw new Error("Restore did not return an account");
  }
  return restored;
}
