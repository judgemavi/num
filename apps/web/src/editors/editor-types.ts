import type { ImportBatch } from "@num/shared";
import type { PlanSeed } from "@/recurring/plan-form";
import type { RecordEditorKind } from "@/editors/edit-url";

export type EditorInput = {
  transaction: { id: string | null; rawLine?: string; initialAccountId?: string };
  account: { id: string | null };
  category: { id: string | null };
  group: { id: string | null };
  tag: { id: string | null };
  merchant: { id: string | null };
  rule: { id: string | null };
  bucket: { id: string | null };
  plan: { id: string | null; seed?: PlanSeed };
  import: { accountId: string | null };
  reconcile: { accountId: string };
  fundPaycheck: { incomeTransactionId?: string };
  assignMoney: { bucketId: string; kind: "fund" | "release" };
  moveMoney: { fromId: string | null };
  inboxReason:
    | { mode: "dismiss"; itemKey: string; asOf: string }
    | { mode: "skip"; planId: string; dueDate: string; asOf: string };
  importInfo: Pick<ImportBatch, "filename" | "counts" | "unreadable">;
  mergeMerchant: { merchantId: string };
  applyRule: { ruleId: string };
  skipNext: { planId: string; asOf: string };
  skipOccurrence: { planId: string; dueDate: string };
  linkOccurrence: { planId: string; accountId: string; dueDate: string };
};

export type EditorKind = keyof EditorInput;

export function recordId(kind: EditorKind, props: EditorInput[EditorKind]): string | null {
  if (!("id" in props)) {
    return null;
  }
  return props.id ?? null;
}

export function isRecordKind(kind: EditorKind): kind is RecordEditorKind {
  return (
    kind === "transaction" ||
    kind === "account" ||
    kind === "category" ||
    kind === "group" ||
    kind === "tag" ||
    kind === "merchant" ||
    kind === "rule" ||
    kind === "bucket" ||
    kind === "plan"
  );
}
