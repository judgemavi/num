import {
  normalizePayee,
  utcNow,
  type CategorizationRule,
  type GroupSkip,
  type GroupSkipReason,
  type InboxGroupApply,
  type Transaction,
} from "@num/shared";
import { sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { insertRule } from "./rules";
import { readTransaction, type TransactionBody } from "./transaction-record";
import { applyTransactionUpdate, insertTransaction } from "./transactions";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

type Patch = Pick<InboxGroupApply, "categoryId" | "transferAccountId" | "merchantId" | "accountId">;

function statusOf(transaction: Transaction): "open" | "cleared" {
  return transaction.status === "cleared" ? "cleared" : "open";
}

function skipReason(transaction: Transaction, patch: Patch): GroupSkipReason | null {
  if (transaction.accountId !== patch.accountId) {
    return "other_account";
  }
  if (transaction.lines.length !== 1) {
    return "split";
  }
  const line = transaction.lines[0];
  if (!line || line.categoryId !== null || line.transferAccountId !== null) {
    return "categorized";
  }
  if (patch.transferAccountId && transaction.status === "reconciled") {
    return "reconciled";
  }
  return null;
}

function bodyFor(transaction: Transaction, patch: Patch): TransactionBody {
  const transferAccountId = patch.transferAccountId;
  const merchantId = transferAccountId ? null : (patch.merchantId ?? transaction.merchantId);
  if (transferAccountId) {
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
      categoryId: line.categoryId === null && line.transferAccountId === null ? patch.categoryId : line.categoryId,
      transferAccountId: line.transferAccountId,
      tagIds: line.tagIds,
    })),
  };
}

function applyOne(tx: WriteTx, id: string, patch: Patch, at: string): GroupSkip | null {
  let transaction: Transaction;
  try {
    transaction = readTransaction(tx, id);
  } catch {
    return { id, reason: "categorized" };
  }
  if (transaction.deletedAt) {
    return { id, reason: "categorized" };
  }
  const reason = skipReason(transaction, patch);
  if (reason) {
    return { id, reason };
  }
  applyTransactionUpdate(tx, id, bodyFor(transaction, patch), at);
  return null;
}

type OpenRow = { id: string };

function otherIds(reader: { all<T>(query: ReturnType<typeof sql>): T[] }, payee: string, accountId: string, except: ReadonlySet<string>): string[] {
  const rows = reader.all<OpenRow>(sql`
    select t.id as id
    from transactions t
    where t.deleted_at is null
      and t.payee_normalized = ${payee}
      and t.account_id = ${accountId}
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

function applyRule(
  tx: WriteTx,
  rule: CategorizationRule,
  patch: Patch,
  except: ReadonlySet<string>,
  at: string,
): { ruleId: string; applied: number; skipped: GroupSkip[] } {
  const payee = normalizePayee(rule.payee);
  if (payee.length === 0) {
    throw new ServiceError("invalid_body", 400);
  }
  const saved = insertRule(tx, {
    match: rule.match,
    pattern: rule.pattern,
    merchantId: patch.transferAccountId ? null : patch.merchantId,
    categoryId: patch.categoryId,
    transferAccountId: patch.transferAccountId,
    priority: 0,
  });
  const skipped: GroupSkip[] = [];
  let applied = 0;
  for (const id of otherIds(tx, payee, patch.accountId, except)) {
    const skip = applyOne(tx, id, patch, at);
    if (skip) {
      skipped.push(skip);
    } else {
      applied += 1;
    }
  }
  return { ruleId: saved.id, applied, skipped };
}

export function applyInboxGroup(db: Db, input: InboxGroupApply & WriteInput): { applied: number; skipped: GroupSkip[]; ruleId: string | null } {
  const at = input.at ?? utcNow();
  const excluded = new Set(input.excludedIds);
  const groupIds = [...new Set(input.transactionIds)];
  const targets = groupIds.filter((id) => !excluded.has(id));
  let applied = 0;
  let skipped: GroupSkip[] = [];
  let ruleId: string | null = null;
  write(db, { source: input.source, at }, (tx) => {
    for (const id of targets) {
      const skip = applyOne(tx, id, input, at);
      if (skip) {
        skipped.push(skip);
      } else {
        applied += 1;
      }
    }
    if (input.rule) {
      const rule = applyRule(tx, input.rule, input, new Set(groupIds), at);
      ruleId = rule.ruleId;
      applied += rule.applied;
      skipped = [...skipped, ...rule.skipped];
    }
  });
  return { applied, skipped, ruleId };
}

export function countOtherUncategorized(db: Db, payeeRaw: string, accountId: string, exceptIds: readonly string[]): number {
  const payee = normalizePayee(payeeRaw);
  if (payee.length === 0) {
    return 0;
  }
  return otherIds(db, payee, accountId, new Set(exceptIds)).filter((id) => {
    const transaction = readTransaction(db, id);
    return transaction.lines.length === 1 && transaction.lines[0]?.categoryId === null && transaction.lines[0]?.transferAccountId === null;
  }).length;
}

type Saved = { id: string; applied: number; skipped: GroupSkip[] };

function withRule(db: Db, at: string, source: AuditSource, rule: CategorizationRule | undefined, accountId: string, except: string[], patch: Patch, run: (tx: WriteTx) => string): Saved {
  let id = "";
  let applied = 0;
  let skipped: GroupSkip[] = [];
  write(db, { source, at }, (tx) => {
    id = run(tx);
    if (!rule) {
      return;
    }
    const result = applyRule(tx, rule, { ...patch, accountId }, new Set([...except, id]), at);
    applied = result.applied;
    skipped = result.skipped;
  });
  return { id, applied, skipped };
}

export function saveTransactionWithRule(
  db: Db,
  id: string | null,
  input: TransactionBody & WriteInput & { rule?: CategorizationRule },
): Transaction & { applied: number; skipped: GroupSkip[] } {
  const at = input.at ?? utcNow();
  const patch: Patch = {
    accountId: input.accountId,
    categoryId: input.lines.find((line) => line.categoryId)?.categoryId ?? null,
    transferAccountId: input.lines.find((line) => line.transferAccountId)?.transferAccountId ?? null,
    merchantId: input.merchantId ?? null,
  };
  if (input.rule && patch.categoryId !== null && patch.transferAccountId !== null) {
    throw new ServiceError("invalid_body", 400);
  }
  if (input.rule && patch.categoryId === null && patch.transferAccountId === null) {
    throw new ServiceError("invalid_body", 400);
  }
  const saved = withRule(db, at, input.source, input.rule, input.accountId, [], patch, (tx) => {
    if (id) {
      return applyTransactionUpdate(tx, id, input, at).id;
    }
    return insertTransaction(tx, input, input.source).id;
  });
  const transaction = readTransaction(db, saved.id);
  return { ...transaction, applied: saved.applied, skipped: saved.skipped };
}
