import { idIn } from "./list-sql";
import { accounts, bankBalances, importBatches, mortgageTerms, valuations, type AccountRow } from "@num/db";
import { dayBefore, openingFromBankBalance, utcNow, type BankBalance, type BankBalanceInput, type BankStatus } from "@num/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { requireWholeAmounts } from "./book-step";
import { clearedBalancesAt } from "./account-balance";
import { bankOpeningSuggestion } from "./opening-suggestion";
import { withoutId, write, type Reader, type WriteInput, type WriteTx } from "./write";

function requireAccount(db: Reader, id: string): AccountRow {
  const row = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!row) {
    throw new ServiceError("account_not_found", 404);
  }
  return row;
}

function requireBankBalance(db: Reader, accountId: string, id: string): BankBalance {
  const row = db.select().from(bankBalances).where(eq(bankBalances.id, id)).get();
  if (!row || row.accountId !== accountId) {
    throw new ServiceError("bank_balance_not_found", 404);
  }
  return row;
}

function rowsOf(db: Reader, accountId: string): BankBalance[] {
  return db
    .select()
    .from(bankBalances)
    .where(eq(bankBalances.accountId, accountId))
    .orderBy(desc(bankBalances.date))
    .all();
}

function statusOf(db: Reader, account: AccountRow, latest: BankBalance): BankStatus {
  const [cleared] = clearedBalancesAt(db, [{ account, date: latest.date }]);
  if (cleared === undefined) throw new Error("Balance is missing");
  const difference = cleared - latest.balance;
  return {
    accountId: account.id,
    date: latest.date,
    bankBalance: latest.balance,
    clearedBalance: cleared,
    difference,
    openingSuggestion: difference === 0 ? null : bankOpeningSuggestion(db, account, latest, cleared),
  };
}

export function listBankStatuses(db: Db): { items: BankStatus[] } {
  const open = db.select({
    account: accounts,
    firstDate: sql<string | null>`(SELECT t.date FROM transactions t WHERE t.account_id = "accounts"."id" ORDER BY t.date LIMIT 1)`,
  }).from(accounts).where(isNull(accounts.archivedAt)).all();
  const ids = open.map(({ account }) => account.id);
  const rows = db.select().from(bankBalances).where(idIn(bankBalances.accountId, ids)).orderBy(desc(bankBalances.date)).all();
  const byId = new Map(open.map((row) => [row.account.id, row]));
  const points = rows.flatMap((bank) => {
    const found = byId.get(bank.accountId);
    return found ? [{ account: found.account, date: bank.date, bank }] : [];
  });
  const cleared = clearedBalancesAt(db, points);
  const grouped = new Map<string, { bank: BankBalance; cleared: number }[]>();
  for (const [index, point] of points.entries()) {
    const balance = cleared[index];
    if (balance === undefined) throw new Error("Balance is missing");
    const entries = grouped.get(point.account.id) ?? [];
    entries.push({ bank: point.bank, cleared: balance });
    grouped.set(point.account.id, entries);
  }
  const withTerms = new Set(db.select({ accountId: mortgageTerms.accountId }).from(mortgageTerms).all().map((row) => row.accountId));
  const firstValuation = new Map(db.select({ accountId: valuations.accountId, date: sql<string>`min(${valuations.date})` })
    .from(valuations).where(idIn(valuations.accountId, ids)).groupBy(valuations.accountId).all()
    .map((row) => [row.accountId, row.date]));
  const items = open.flatMap(({ account, firstDate }) => {
    const entries = grouped.get(account.id) ?? [];
    const latest = entries[0];
    if (!latest) return [];
    const difference = latest.cleared - latest.bank.balance;
    const valuationDate = firstValuation.get(account.id);
    return [{
      accountId: account.id, date: latest.bank.date, bankBalance: latest.bank.balance,
      clearedBalance: latest.cleared, difference,
      openingSuggestion: difference === 0 || withTerms.has(account.id) || (valuationDate !== undefined && valuationDate <= latest.bank.date) ? null : openingFromBankBalance({
        hasMatchingBankBalance: entries.slice(1).some((row) => row.bank.balance === row.cleared),
        openingBalance: account.openingBalance, clearedBalance: latest.cleared, bankBalance: latest.bank.balance,
        date: firstDate ? dayBefore(firstDate) : account.openingDate ?? account.createdOn,
      }),
    }];
  });
  return { items };
}

export function listBankBalances(db: Db, accountId: string): { items: BankBalance[]; status: BankStatus | null } {
  const account = requireAccount(db, accountId);
  const items = rowsOf(db, accountId);
  const latest = items[0];
  return { items, status: latest ? statusOf(db, account, latest) : null };
}

/** The status of the latest bank balance of an account. Null when the account has no bank balance. */
export function latestBankStatus(db: Reader, account: AccountRow): BankStatus | null {
  const latest = rowsOf(db, account.id)[0];
  return latest ? statusOf(db, account, latest) : null;
}

function dateTaken(db: Reader, accountId: string, date: string, exceptId: string | null) {
  const row = db
    .select({ id: bankBalances.id })
    .from(bankBalances)
    .where(and(eq(bankBalances.accountId, accountId), eq(bankBalances.date, date)))
    .get();
  return row !== undefined && row.id !== exceptId;
}

export function createBankBalance(db: Db, accountId: string, input: BankBalanceInput & WriteInput): BankBalance {
  requireWholeAmounts(db, [input.balance]);
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    requireAccount(tx, accountId);
    if (dateTaken(tx, accountId, input.date, null)) {
      throw new ServiceError("bank_balance_exists", 409);
    }
    const row: BankBalance = {
      id: crypto.randomUUID(),
      accountId,
      date: input.date,
      balance: input.balance,
      importBatchId: null,
      createdAt: at,
    };
    tx.insert(bankBalances).values(row).run();
    tx.audit({ entity: "bank_balances", entityId: row.id, action: "create", before: null, after: withoutId(row) });
    return row;
  });
}

export function updateBankBalance(
  db: Db,
  accountId: string,
  id: string,
  input: BankBalanceInput & WriteInput,
): BankBalance {
  requireWholeAmounts(db, [input.balance]);
  return write(db, { source: input.source, at: input.at ?? utcNow() }, (tx) => {
    const before = requireBankBalance(tx, accountId, id);
    if (dateTaken(tx, accountId, input.date, id)) {
      throw new ServiceError("bank_balance_exists", 409);
    }
    const next = { ...before, date: input.date, balance: input.balance };
    tx.update(bankBalances).set({ date: next.date, balance: next.balance }).where(eq(bankBalances.id, id)).run();
    tx.audit({ entity: "bank_balances", entityId: id, action: "update", before: withoutId(before), after: withoutId(next) });
    return next;
  });
}

export function deleteBankBalance(db: Db, accountId: string, id: string, input: WriteInput): BankBalance {
  return write(db, { source: input.source, at: input.at ?? utcNow() }, (tx) => {
    const before = requireBankBalance(tx, accountId, id);
    tx.delete(bankBalances).where(eq(bankBalances.id, id)).run();
    tx.audit({ entity: "bank_balances", entityId: id, action: "delete", before: withoutId(before), after: null });
    return before;
  });
}

/** An import with a closing balance saves the bank balance of its closing date. It replaces one that has the same date. */
export function saveImportBankBalance(
  tx: WriteTx,
  input: { accountId: string; batchId: string; date: string; balance: number; at: string },
): void {
  const existing = tx
    .select()
    .from(bankBalances)
    .where(and(eq(bankBalances.accountId, input.accountId), eq(bankBalances.date, input.date)))
    .get();
  if (existing) {
    tx.update(importBatches).set({ previousBankBalance: existing }).where(eq(importBatches.id, input.batchId)).run();
    tx.delete(bankBalances).where(eq(bankBalances.id, existing.id)).run();
    tx.audit({ entity: "bank_balances", entityId: existing.id, action: "delete", before: withoutId(existing), after: null });
  }
  const row: BankBalance = {
    id: crypto.randomUUID(),
    accountId: input.accountId,
    date: input.date,
    balance: input.balance,
    importBatchId: input.batchId,
    createdAt: input.at,
  };
  tx.insert(bankBalances).values(row).run();
  tx.audit({ entity: "bank_balances", entityId: row.id, action: "create", before: null, after: withoutId(row) });
}

/** Undo restores the replaced balance only if its source batch has not been undone. */
export function restoreImportBankBalance(tx: WriteTx, batchId: string): void {
  const row = tx.select().from(bankBalances).where(eq(bankBalances.importBatchId, batchId)).get();
  if (!row) {
    return;
  }
  tx.delete(bankBalances).where(eq(bankBalances.id, row.id)).run();
  tx.audit({ entity: "bank_balances", entityId: row.id, action: "delete", before: withoutId(row), after: null });
  const previous = tx.select().from(importBatches).where(eq(importBatches.id, batchId)).get()?.previousBankBalance;
  if (previous?.importBatchId) {
    const source = tx.select({ undoneAt: importBatches.undoneAt }).from(importBatches).where(eq(importBatches.id, previous.importBatchId)).get();
    if (source?.undoneAt) {
      return;
    }
  }
  if (previous) {
    tx.insert(bankBalances).values(previous).run();
    tx.audit({ entity: "bank_balances", entityId: previous.id, action: "create", before: null, after: withoutId(previous) });
  }
}
