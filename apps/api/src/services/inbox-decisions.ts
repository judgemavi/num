import { inboxDecisions } from "@num/db";
import { planProposalKey, utcNow, type InboxDecision, type InboxDecisionCode } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { openUnreadableKeys } from "./book-settings";
import { keepPrefix } from "./decision-keep";
import { decidedKeys, pairKey } from "./decision-keys";
import { isUncategorized } from "./decision-keep";
import { openFundingPaychecks } from "./funding-paychecks";
import { refundQuestions } from "./refund-auto";
import { recurringSignals } from "./recurring-view";
import { listTransferPairs } from "./suggestions";
import { write, type AuditSource } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

const codeForKind: Record<string, InboxDecisionCode | undefined> = {
  transfer_pair: "not_transfer",
  recurring_changed: "keep_plan_amount",
  plan_proposal: "not_recurring",
  paycheck_funding: "keep_unassigned",
  import_unreadable: "not_a_transaction",
  refund_link: "not_linked",
  uncategorized: "keep_uncategorized",
};

export function decisionRows(db: Db): InboxDecision[] {
  return db
    .select()
    .from(inboxDecisions)
    .all()
    .map((row) => ({
      itemKey: row.itemKey,
      decision: row.decision as InboxDecisionCode,
      reason: row.reason,
      decidedAt: row.decidedAt,
    }));
}

function itemKind(itemKey: string): string {
  const split = itemKey.indexOf(":");
  return split === -1 ? itemKey : itemKey.slice(0, split);
}

function isOpen(db: Db, asOf: string, itemKey: string): boolean {
  if (decidedKeys(db).has(itemKey)) {
    return false;
  }
  switch (itemKind(itemKey)) {
    case "transfer_pair":
      return listTransferPairs(db, asOf).items.some((pair) => pairKey(pair.leftId, pair.rightId) === itemKey);
    case "recurring_changed":
      return recurringSignals(db, asOf).changed.some((item) => `recurring_changed:${item.planId}:${item.dueDate}` === itemKey);
    case "plan_proposal":
      return recurringSignals(db, asOf).proposals.some((item) => planProposalKey(item) === itemKey);
    case "paycheck_funding":
      return openFundingPaychecks(db).some((item) => `paycheck_funding:${item.incomeTransactionId}` === itemKey);
    case "import_unreadable":
      return openUnreadableKeys(db).includes(itemKey);
    case "refund_link":
      return [...refundQuestions(db, new Set()).values()].some((ask) => ask.itemKey === itemKey);
    case "uncategorized":
      return isUncategorized(db, itemKey.slice(keepPrefix.length));
    default:
      return false;
  }
}

export function decideInboxItem(
  db: Db,
  asOf: string,
  itemKey: string,
  decision: InboxDecisionCode,
  input: WriteInput,
): InboxDecision {
  const kind = itemKind(itemKey);
  if (codeForKind[kind] !== decision) {
    throw new ServiceError("invalid_body", 400, { field: "decision" });
  }
  if (!isOpen(db, asOf, itemKey)) {
    throw new ServiceError("inbox_item_not_found", 404);
  }
  const at = input.at ?? utcNow();
  const row = { itemKey, decision, reason: null, decidedAt: at };
  write(db, { source: input.source, at }, (tx) => {
    tx.insert(inboxDecisions).values(row).run();
    tx.audit({
      entity: "inbox_decisions",
      entityId: itemKey,
      action: "create",
      before: null,
      after: row,
    });
  });
  return row;
}

export function undoInboxDecision(db: Db, itemKey: string, input: WriteInput): { itemKey: string } {
  const row = db.select().from(inboxDecisions).where(eq(inboxDecisions.itemKey, itemKey)).get();
  if (!row) {
    throw new ServiceError("decision_not_found", 404);
  }
  write(db, { source: input.source, at: input.at }, (tx) => {
    tx.delete(inboxDecisions).where(eq(inboxDecisions.itemKey, itemKey)).run();
    tx.audit({
      entity: "inbox_decisions",
      entityId: itemKey,
      action: "delete",
      before: row,
      after: null,
    });
  });
  return { itemKey };
}
