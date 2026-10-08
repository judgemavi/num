import { accounts, checkpoints } from "@num/db";
import { accountKinds, cardStatements, type AccountKind, type CardStatement } from "@num/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";

function asKind(value: string): AccountKind {
  if (!(accountKinds as readonly string[]).includes(value)) {
    throw new Error("Unknown account kind");
  }
  return value as AccountKind;
}

export function listCardStatements(db: Db, accountId: string): { items: CardStatement[] } {
  const account = db.select({ id: accounts.id, kind: accounts.kind }).from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) {
    throw new ServiceError("account_not_found", 404);
  }
  if (asKind(account.kind) !== "credit_card") {
    throw new ServiceError("not_credit_card", 400);
  }
  const statements = db
    .select({ date: checkpoints.date })
    .from(checkpoints)
    .where(and(eq(checkpoints.accountId, accountId), isNull(checkpoints.unlockedAt)))
    .all();
  const payments = db.all<{ date: string }>(sql`
    select t.date as date
    from transactions t
    where t.account_id = ${accountId}
      and t.deleted_at is null
      and t.amount > 0
      and (
        t.transfer_peer_id is not null
        or exists (
          select 1 from transaction_lines l
          where l.transaction_id = t.id and l.transfer_account_id is not null
        )
      )
  `);
  return { items: cardStatements({ statements, paymentDates: payments.map((row) => row.date) }) };
}
