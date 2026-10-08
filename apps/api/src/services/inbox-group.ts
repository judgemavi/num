import { normalizePayee, utcNow, type InboxGroupApply, type PayeeRuleCreate, type Transaction } from "@num/shared";
import { sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { insertRule } from "./rules";
import { readTransaction, type TransactionBody } from "./transaction-record";
import { applyTransactionUpdate } from "./transactions";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function statusOf(transaction: Transaction): "open" | "cleared" {
  return transaction.status === "cleared" ? "cleared" : "open";
}

function bodyFor(transaction: Transaction, input: Pick<InboxGroupApply, "categoryId" | "transferAccountId" | "merchantId">): TransactionBody {
  const transferAccountId = input.transferAccountId;
  const merchantId = transferAccountId ? null : input.merchantId;
  if (transferAccountId) {
    if (transaction.lines.length !== 1 || transaction.accountId === transferAccountId) {
      throw new ServiceError("invalid_body", 400);
    }
    const line = transaction.lines[0];
    return {
      accountId: transaction.accountId,
      date: transaction.date,
      amount: transaction.amount,
      payeeRaw: transaction.payeeRaw,
      merchantId,
      notes: transaction.notes,
      status: statusOf(transaction),
      lines: [
        {
          amount: transaction.amount,
          memo: line?.memo ?? null,
          categoryId: null,
          transferAccountId,
          tagIds: line?.tagIds ?? [],
        },
      ],
    };
  }
  return {
    accountId: transaction.accountId,
    date: transaction.date,
    amount: transaction.amount,
    payeeRaw: transaction.payeeRaw,
    merchantId,
    notes: transaction.notes,
    status: statusOf(transaction),
    lines: transaction.lines.map((line) => ({
      amount: line.amount,
      memo: line.memo,
      categoryId: line.categoryId === null && line.transferAccountId === null ? input.categoryId : line.categoryId,
      transferAccountId: line.transferAccountId,
      tagIds: line.tagIds,
    })),
  };
}

function applyIds(tx: WriteTx, ids: readonly string[], patch: Pick<InboxGroupApply, "categoryId" | "transferAccountId" | "merchantId">, at: string): number {
  let applied = 0;
  for (const id of ids) {
    const transaction = readTransaction(tx, id);
    if (transaction.deletedAt) {
      throw new ServiceError("transaction_not_found", 404);
    }
    applyTransactionUpdate(tx, id, bodyFor(transaction, patch), at);
    applied += 1;
  }
  return applied;
}

export function applyInboxGroup(db: Db, input: InboxGroupApply & WriteInput): { applied: number } {
  const ids = uniqueIds(input.transactionIds);
  const at = input.at ?? utcNow();
  let applied = 0;
  write(db, { source: input.source, at }, (tx) => {
    applied = applyIds(tx, ids, input, at);
  });
  return { applied };
}

type OpenRow = { id: string; payee: string };

function otherUncategorized(reader: { all<T>(query: ReturnType<typeof sql>): T[] }, payee: string, except: ReadonlySet<string>): string[] {
  const rows = reader.all<OpenRow>(sql`
    select t.id as id, t.payee_normalized as payee
    from transactions t
    where t.deleted_at is null
      and t.payee_normalized = ${payee}
      and exists (
        select 1 from transaction_lines l
        where l.transaction_id = t.id
          and l.category_id is null
          and l.transfer_account_id is null
      )
    order by t.date desc, t.id desc
  `);
  return rows.map((row) => row.id).filter((id) => !except.has(id));
}

export function countOtherUncategorized(db: Db, payeeRaw: string, exceptIds: readonly string[]): number {
  const payee = normalizePayee(payeeRaw);
  if (payee.length === 0) {
    return 0;
  }
  return otherUncategorized(db, payee, new Set(exceptIds)).length;
}

export function createPayeeRule(db: Db, input: PayeeRuleCreate & WriteInput): { ruleId: string; applied: number } {
  const payee = normalizePayee(input.payee);
  if (payee.length === 0) {
    throw new ServiceError("invalid_body", 400);
  }
  const at = input.at ?? utcNow();
  let ruleId = "";
  let applied = 0;
  const merchantId = input.transferAccountId ? null : input.merchantId;
  write(db, { source: input.source, at }, (tx) => {
    const rule = insertRule(tx, {
      match: input.match,
      pattern: input.pattern,
      merchantId,
      categoryId: input.categoryId,
      transferAccountId: input.transferAccountId,
      priority: 0,
    });
    ruleId = rule.id;
    const ids = otherUncategorized(tx, payee, new Set(input.exceptIds));
    applied = applyIds(tx, ids, { categoryId: input.categoryId, transferAccountId: input.transferAccountId, merchantId }, at);
  });
  return { ruleId, applied };
}
