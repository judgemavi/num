import { accounts, transactions } from "@num/db";
import {
  accountKinds,
  dayBefore,
  defaultOnBudget,
  paymentPolicies,
  Temporal,
  type Account,
  type AccountCreate,
  type AccountKind,
  type AccountListQuery,
  type AccountUpdate,
  type PaymentPolicy,
  utcNow,
} from "@num/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { balanceOf, latestValuations, transactionTotals } from "./account-balance";
import { assertCanArchive, assertSameClass, cardFields, interestRate, type CardFields } from "./account-rules";
import { accountAuditSnapshot, readColumnMap } from "./account-snapshot";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

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

function creationDate(at: string): string {
  return Temporal.Instant.from(at).toZonedDateTimeISO("UTC").toPlainDate().toString();
}

function earliestTransactionDate(db: Db | WriteTx, accountId: string): string | null {
  const rows = db
    .select({ date: transactions.date })
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), isNull(transactions.deletedAt)))
    .all();
  let earliest: string | null = null;
  for (const row of rows) {
    if (earliest === null || row.date < earliest) {
      earliest = row.date;
    }
  }
  return earliest;
}

function resolveOpening(db: Db | WriteTx, accountId: string | null, input: { openingDate?: string; openingBalance?: number }, at: string, storedDate: string | null) {
  const openingBalance = input.openingBalance ?? 0;
  if (input.openingDate) {
    return { openingDate: input.openingDate, openingBalance };
  }
  const first = accountId === null ? null : earliestTransactionDate(db, accountId);
  const openingDate = first ? dayBefore(first) : (storedDate ?? creationDate(at));
  return { openingDate, openingBalance };
}

function blankToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
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
    paymentPolicy: asPolicy(row.paymentPolicy),
    fixedPayment: row.fixedPayment,
    interestRateMilliPct: row.interestRateMilliPct,
    importPreset: row.importPreset,
    columnMap: readColumnMap(row.columnMap),
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
  const items = rows.map((row) => toAccount(row, balanceOf(db, { ...row, kind: asKind(row.kind) }, totals, latest)));
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
  const at = input.at ?? utcNow();
  const opening = resolveOpening(db, null, input, at, null);
  const id = crypto.randomUUID();
  const row = {
    id,
    ...storedFields({
      name: input.name.trim(),
      institution: blankToNull(input.institution),
      kind: input.kind,
      onBudget: input.onBudget ?? defaultOnBudget(input.kind),
      openingDate: opening.openingDate,
      openingBalance: opening.openingBalance,
      archivedAt: null,
      card,
      interestRateMilliPct: rate,
    }),
    importPreset: null,
    columnMap: null,
  };
  write(db, { source: input.source, at }, (tx) => {
    tx.insert(accounts).values(row).run();
    tx.audit({
      entity: "accounts",
      entityId: id,
      action: "create",
      before: null,
      after: accountAuditSnapshot(row),
    });
  });
  return toAccount(row, row.openingBalance);
}

export function updateAccount(db: Db, id: string, input: AccountUpdate & WriteInput): Account {
  const at = input.at ?? utcNow();
  let updated: Account | undefined;
  write(db, { source: input.source, at }, (tx) => {
    const existing = tx.select().from(accounts).where(eq(accounts.id, id)).get();
    if (!existing) {
      throw new ServiceError("account_not_found", 404);
    }
    const currentKind = asKind(existing.kind);
    assertSameClass(currentKind, input.kind);
    const card = cardFields(input.kind, input);
    const rate = interestRate(input.kind, input.interestRateMilliPct);
    const opening = resolveOpening(tx, id, input, at, existing.openingDate);
    const next = storedFields({
      name: input.name.trim(),
      institution: blankToNull(input.institution),
      kind: input.kind,
      onBudget: input.onBudget,
      openingDate: opening.openingDate,
      openingBalance: opening.openingBalance,
      archivedAt: existing.archivedAt,
      card,
      interestRateMilliPct: rate,
    });
    tx.update(accounts).set(next).where(eq(accounts.id, id)).run();
    tx.audit({
      entity: "accounts",
      entityId: id,
      action: "update",
      before: accountAuditSnapshot(existing),
      after: accountAuditSnapshot({ ...existing, ...next }),
    });
    updated = toAccount(
      { ...existing, ...next },
      balanceOf(tx, { id, kind: input.kind, openingBalance: next.openingBalance }),
    );
  });
  if (!updated) {
    throw new Error("Update did not return an account");
  }
  return updated;
}

export function applyOpeningSuggestion(
  db: Db,
  id: string,
  input: { amount: number; date: string } & WriteInput,
): Account {
  const existing = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!existing) {
    throw new ServiceError("account_not_found", 404);
  }
  return updateAccount(db, id, {
    name: existing.name,
    institution: existing.institution,
    kind: asKind(existing.kind),
    onBudget: existing.onBudget,
    openingDate: input.date,
    openingBalance: input.amount,
    paymentPolicy: asPolicy(existing.paymentPolicy),
    fixedPayment: existing.fixedPayment,
    interestRateMilliPct: existing.interestRateMilliPct,
    source: input.source,
    at: input.at,
  });
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
    const balance = balanceOf(tx, { id, kind, openingBalance: existing.openingBalance });
    assertCanArchive(balance, input.confirm);
    const next = { ...existing, archivedAt: at };
    tx.update(accounts).set({ archivedAt: at }).where(eq(accounts.id, id)).run();
    tx.audit({
      entity: "accounts",
      entityId: id,
      action: "archive",
      before: accountAuditSnapshot(existing),
      after: accountAuditSnapshot(next),
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
      before: accountAuditSnapshot(existing),
      after: accountAuditSnapshot(next),
    });
    restored = toAccount(next, balanceOf(tx, { id, kind, openingBalance: existing.openingBalance }));
  });
  if (!restored) {
    throw new Error("Restore did not return an account");
  }
  return restored;
}

export function getAccount(db: Db, id: string): Account {
  const row = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!row) {
    throw new ServiceError("account_not_found", 404);
  }
  return toAccount(row, balanceOf(db, { id: row.id, kind: asKind(row.kind), openingBalance: row.openingBalance }));
}
