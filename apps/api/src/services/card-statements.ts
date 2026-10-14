import { accounts, checkpoints, transactions } from "@num/db";
import { cardStatements, type CardStatement } from "@num/shared";
import { and, eq, gt, isNotNull, isNull, or } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { hasTransferLine, literal } from "./transaction-sql";

export function listCardStatements(db: Db, accountId: string): { items: CardStatement[] } {
  const ledger = cardLedger(db, accountId);
  return {
    items: cardStatements({
      statements: ledger.statements,
      paymentDates: ledger.payments.map((row) => row.date),
    }),
  };
}

export function cardLedger(db: Db, accountId: string): {
  statements: { date: string; balance: number; createdAt: string }[];
  payments: { date: string; amount: number }[];
} {
  const account = db.select({ id: accounts.id, kind: accounts.kind }).from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) {
    throw new ServiceError("account_not_found", 404);
  }
  if (account.kind !== "credit_card") {
    throw new ServiceError("not_credit_card", 400);
  }
  const statements = db
    .select({ date: checkpoints.date, balance: checkpoints.statementBalance, createdAt: checkpoints.createdAt })
    .from(checkpoints)
    .where(and(eq(checkpoints.accountId, accountId), isNull(checkpoints.unlockedAt)))
    .all();
  const payments = db
    .select({ date: transactions.date, amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        gt(transactions.amount, literal(0)),
        or(isNotNull(transactions.transferPeerId), hasTransferLine(transactions.id)),
      ),
    )
    .all();
  return { statements, payments };
}
