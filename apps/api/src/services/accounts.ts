import { accounts, type AccountRow } from "@num/db";
import {
  accountCreateSchema,
  defaultOnBudget,
  foldName,
  type Account,
  type AccountCreate,
  type AccountListQuery,
  type AccountUpdate,
  utcNow,
} from "@num/shared";
import { eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { balanceOf, balancesOf } from "./account-balance";
import { assertCanArchive, assertSameClass, cardFields, interestRate } from "./account-rules";
import { accountAuditSnapshot } from "./account-snapshot";
import { readTerms, resolveTerms, saveTerms } from "./mortgage-terms";
import { automaticOpening, automaticOpenings, type AutomaticOpening } from "./opening-date";
import { mergedWrite } from "./patch";
import { write, type WriteInput } from "./write";
import { byColumn, byName, pagedOf, totalOf, windowOf, withoutSortKey } from "./list-sql";
import { requireWholeAmounts } from "./book-step";

function blankToNull(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function toAccount(row: AccountRow, balance: number, automatic: AutomaticOpening): Account {
  const { id, name, institution, kind, onBudget, openingDate, createdAt, ...rest } = withoutSortKey(row);
  return {
    id,
    name,
    institution,
    kind,
    onBudget,
    openingDate: openingDate ?? automatic.date,
    openingAutomatic: openingDate === null,
    automaticOpeningDate: automatic.date,
    automaticFollowsTransactions: automatic.followsTransactions,
    ...rest,
    balance,
  };
}

export function listAccounts(db: Db, query: AccountListQuery) {
  const where = query.archived ? isNotNull(accounts.archivedAt) : isNull(accounts.archivedAt);
  const order = query.sort === "kind" ? byColumn(accounts.kind, accounts.id, query.dir) : byName(accounts, query.dir);
  const { limit, offset } = windowOf(query);
  const rows = db.select().from(accounts).where(where).orderBy(...order).limit(limit).offset(offset).all();
  const openings = automaticOpenings(
    db,
    rows.map((row) => row.id),
  );
  const items = balancesOf(db, rows).map(({ account, balance }) => {
    const automatic = openings.get(account.id);
    if (!automatic) {
      throw new ServiceError("account_not_found", 404);
    }
    return toAccount(account, balance, automatic);
  });
  return pagedOf(items, totalOf(db, accounts, where), query);
}

export function createAccount(db: Db, input: AccountCreate & WriteInput): Account {
  requireWholeAmounts(db, [input.openingBalance, input.fixedPayment, input.mortgageTerms?.paymentAmount]);
  const card = cardFields(input.kind, input);
  const rate = interestRate(input.kind, input.interestRateMilliPct);
  const at = input.at ?? utcNow();
  const id = crypto.randomUUID();
  const terms = resolveTerms(db, id, input.kind, input.mortgageTerms);
  const row: AccountRow = {
    id,
    name: input.name.trim(),
    institution: blankToNull(input.institution),
    kind: input.kind,
    onBudget: input.onBudget ?? defaultOnBudget(input.kind),
    openingDate: input.openingDate ?? null,
    openingBalance: input.openingBalance ?? 0,
    archivedAt: null,
    ...card,
    interestRateMilliPct: rate,
    importPreset: null,
    columnMap: null,
    createdAt: at,
    sortKey: foldName(input.name.trim()),
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
    saveTerms(tx, id, { date: row.openingDate, balance: row.openingBalance }, terms);
  });
  return toAccount(row, row.openingBalance, automaticOpening(db, id));
}

/**
 * A PATCH: a field that the patch leaves out keeps its stored value. An explicit null clears a field that can be empty.
 * The checks that use more than one field run on the stored account with the patch.
 */
export function updateAccount(db: Db, id: string, input: AccountUpdate & WriteInput): Account {
  requireWholeAmounts(db, [input.openingBalance, input.fixedPayment, input.mortgageTerms?.paymentAmount]);
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const existing = tx.select().from(accounts).where(eq(accounts.id, id)).get();
    if (!existing) {
      throw new ServiceError("account_not_found", 404);
    }
    const storedTerms = readTerms(tx, id) ?? null;
    const next = mergedWrite(accountCreateSchema, { ...existing, mortgageTerms: storedTerms }, input);
    assertSameClass(existing.kind, next.kind);
    const openingDate = next.openingDate ?? null;
    const openingBalance = next.openingBalance ?? existing.openingBalance;
    // A mortgage with terms has a fixed opening date and balance (decision 0027). Only a write with the terms changes them.
    const keepsTerms = storedTerms !== null && input.mortgageTerms === undefined;
    if (keepsTerms && (openingDate !== existing.openingDate || openingBalance !== existing.openingBalance)) {
      throw new ServiceError("opening_date_fixed", 400);
    }
    const values = {
      name: next.name,
      institution: blankToNull(next.institution),
      kind: next.kind,
      onBudget: next.onBudget ?? existing.onBudget,
      openingDate,
      openingBalance,
      ...cardFields(next.kind, next),
      interestRateMilliPct: interestRate(next.kind, next.interestRateMilliPct),
    };
    const saved = { ...existing, ...values, sortKey: foldName(values.name) };
    tx.update(accounts).set({ ...values, sortKey: saved.sortKey }).where(eq(accounts.id, id)).run();
    tx.audit({
      entity: "accounts",
      entityId: id,
      action: "update",
      before: accountAuditSnapshot(existing),
      after: accountAuditSnapshot(saved),
    });
    saveTerms(tx, id, { date: openingDate, balance: openingBalance }, next.mortgageTerms ?? null);
    return toAccount(saved, balanceOf(tx, saved), automaticOpening(tx, id));
  });
}

export function archiveAccount(
  db: Db,
  id: string,
  input: { confirm: boolean } & WriteInput,
): Account {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const existing = tx.select().from(accounts).where(eq(accounts.id, id)).get();
    if (!existing) {
      throw new ServiceError("account_not_found", 404);
    }
    if (existing.archivedAt) {
      throw new ServiceError("account_archived", 409);
    }
    const balance = balanceOf(tx, existing);
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
    return toAccount(next, balance, automaticOpening(tx, id));
  });
}

export function restoreAccount(db: Db, id: string, input: WriteInput): Account {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(accounts).where(eq(accounts.id, id)).get();
    if (!existing) {
      throw new ServiceError("account_not_found", 404);
    }
    if (!existing.archivedAt) {
      throw new ServiceError("account_not_archived", 409);
    }
    const next = { ...existing, archivedAt: null };
    tx.update(accounts).set({ archivedAt: null }).where(eq(accounts.id, id)).run();
    tx.audit({
      entity: "accounts",
      entityId: id,
      action: "restore",
      before: accountAuditSnapshot(existing),
      after: accountAuditSnapshot(next),
    });
    return toAccount(next, balanceOf(tx, existing), automaticOpening(tx, id));
  });
}

export function getAccount(db: Db, id: string): Account {
  const row = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!row) {
    throw new ServiceError("account_not_found", 404);
  }
  return toAccount(row, balanceOf(db, row), automaticOpening(db, id));
}
