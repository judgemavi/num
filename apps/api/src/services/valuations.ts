import { accounts, valuations } from "@num/db";
import { balanceFromEntry, entryFromBalance, usesValuation, utcNow, valuationInputSchema, type ValuationInput, type ValuationUpdate } from "@num/shared";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { requireWholeAmounts } from "./book-step";
import { mergedWrite } from "./patch";
import { blankToNull } from "./text";
import { withoutId, write, type Reader, type WriteInput } from "./write";

function requireAccount(db: Reader, id: string) {
  const row = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!row) throw new ServiceError("account_not_found", 404);
  if (!usesValuation(row.kind)) throw new ServiceError("account_kind_no_valuations", 400);
  return row;
}

function requireValuation(db: Reader, accountId: string, id: string) {
  const row = db.select().from(valuations).where(and(eq(valuations.accountId, accountId), eq(valuations.id, id))).get();
  if (!row) throw new ServiceError("valuation_not_found", 404);
  return row;
}

function requireFreeDate(db: Reader, accountId: string, date: string, exceptId?: string) {
  const row = db.select({ id: valuations.id }).from(valuations)
    .where(and(eq(valuations.accountId, accountId), eq(valuations.date, date))).get();
  if (row && row.id !== exceptId) throw new ServiceError("valuation_exists", 409);
}

export function listValuations(db: Db, accountId: string) {
  requireAccount(db, accountId);
  return { items: db.select().from(valuations).where(eq(valuations.accountId, accountId)).orderBy(desc(valuations.date)).all() };
}

export function createValuation(db: Db, accountId: string, input: ValuationInput & WriteInput) {
  requireWholeAmounts(db, [input.balance]);
  return write(db, { source: input.source, at: input.at ?? utcNow() }, (tx) => {
    const account = requireAccount(tx, accountId);
    requireFreeDate(tx, accountId, input.date);
    const row = {
      id: crypto.randomUUID(), accountId, date: input.date,
      balance: balanceFromEntry(account.kind, input.balance), note: blankToNull(input.note),
    };
    tx.insert(valuations).values(row).run();
    tx.audit({ entity: "valuations", entityId: row.id, action: "create", before: null, after: withoutId(row) });
    return row;
  });
}

export function updateValuation(db: Db, accountId: string, id: string, input: ValuationUpdate & WriteInput) {
  requireWholeAmounts(db, [input.balance]);
  return write(db, { source: input.source, at: input.at ?? utcNow() }, (tx) => {
    const account = requireAccount(tx, accountId);
    const before = requireValuation(tx, accountId, id);
    const next = mergedWrite(valuationInputSchema, { ...before, balance: entryFromBalance(account.kind, before.balance) }, input);
    requireFreeDate(tx, accountId, next.date, id);
    const row = { ...before, ...next, balance: balanceFromEntry(account.kind, next.balance), note: blankToNull(next.note) };
    tx.update(valuations).set({ date: row.date, balance: row.balance, note: row.note }).where(eq(valuations.id, id)).run();
    tx.audit({ entity: "valuations", entityId: id, action: "update", before: withoutId(before), after: withoutId(row) });
    return row;
  });
}

export function deleteValuation(db: Db, accountId: string, id: string, input: WriteInput) {
  return write(db, { source: input.source, at: input.at ?? utcNow() }, (tx) => {
    requireAccount(tx, accountId);
    const before = requireValuation(tx, accountId, id);
    tx.delete(valuations).where(eq(valuations.id, id)).run();
    tx.audit({ entity: "valuations", entityId: id, action: "delete", before: withoutId(before), after: null });
    return before;
  });
}
