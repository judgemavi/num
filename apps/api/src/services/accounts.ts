import { accounts, type AccountRow } from "@num/db";
import {
  allowsInterestRate,
  defaultOnBudget,
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
import { hasTerms, resolveTerms, saveTerms } from "./mortgage-terms";
import { automaticOpening, automaticOpenings, effectiveOpeningDate, type AutomaticOpening } from "./opening-date";
import { keepOmitted, write, type WriteInput } from "./write";
import { compareText, pageOf } from "./paging";

function blankToNull(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function toAccount(row: AccountRow, balance: number, automatic: AutomaticOpening): Account {
  const { id, name, institution, kind, onBudget, openingDate, ...rest } = row;
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

function compareName(left: string, right: string) {
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
    .where(query.archived ? isNotNull(accounts.archivedAt) : isNull(accounts.archivedAt))
    .all();
  const openings = automaticOpenings(
    db,
    rows.map((row) => row.id),
  );
  const items = balancesOf(db, rows).map(({ account, balance }) => {
    const automatic = openings.get(account.id);
    if (!automatic) {
      throw new Error("Account has no creation record");
    }
    return toAccount(account, balance, automatic);
  });
  const sort = query.sort ?? "name";
  const dir = query.dir === "desc" ? -1 : 1;
  items.sort((left, right) => {
    const field = sort === "kind" ? compareText(left.kind, right.kind) : compareName(left.name, right.name);
    if (field !== 0) {
      return field * dir;
    }
    return compareText(left.id, right.id);
  });
  return pageOf(items, query);
}

export function createAccount(db: Db, input: AccountCreate & WriteInput): Account {
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

/** A field that the update leaves out keeps its stored value. An explicit null clears a field that can be empty. */
export function updateAccount(db: Db, id: string, input: AccountUpdate & WriteInput): Account {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const existing = tx.select().from(accounts).where(eq(accounts.id, id)).get();
    if (!existing) {
      throw new ServiceError("account_not_found", 404);
    }
    assertSameClass(existing.kind, input.kind);
    // The two card fields go together. A card keeps them when the update leaves out the two.
    const keepsCard = input.kind === "credit_card" && input.paymentPolicy === undefined && input.fixedPayment === undefined;
    const card = cardFields(input.kind, keepsCard ? existing : input);
    const keepsRate = input.interestRateMilliPct === undefined && allowsInterestRate(input.kind);
    const rate = interestRate(input.kind, keepsRate ? existing.interestRateMilliPct : input.interestRateMilliPct);
    const terms = resolveTerms(tx, id, input.kind, input.mortgageTerms);
    const requestedDate = keepOmitted(input.openingDate, existing.openingDate);
    // A mortgage with terms has a fixed opening date (decision 0027).
    const openingDate = terms && requestedDate === null ? effectiveOpeningDate(tx, existing) : requestedDate;
    const next = {
      name: input.name.trim(),
      institution: input.institution === undefined ? existing.institution : blankToNull(input.institution),
      kind: input.kind,
      onBudget: input.onBudget,
      openingDate,
      openingBalance: input.openingBalance ?? existing.openingBalance,
      ...card,
      interestRateMilliPct: rate,
    };
    const saved = { ...existing, ...next };
    tx.update(accounts).set(next).where(eq(accounts.id, id)).run();
    tx.audit({
      entity: "accounts",
      entityId: id,
      action: "update",
      before: accountAuditSnapshot(existing),
      after: accountAuditSnapshot(saved),
    });
    saveTerms(tx, id, { date: openingDate, balance: next.openingBalance }, terms);
    return toAccount(saved, balanceOf(tx, saved), automaticOpening(tx, id));
  });
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
  if (hasTerms(db, id)) {
    throw new ServiceError("opening_date_fixed", 400);
  }
  return updateAccount(db, id, {
    name: existing.name,
    kind: existing.kind,
    onBudget: existing.onBudget,
    openingDate: input.date,
    openingBalance: input.amount,
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
