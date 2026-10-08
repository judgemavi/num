import type { CategoryKind, ImportBatch } from "@num/shared";
import type { PlanSeed } from "@/recurring/plan-form";
import type { RecordEditorKind } from "@/editors/edit-url";

export type EditorInput = {
  transaction: {
    id: string | null;
    rawLine?: string;
    initialAccountId?: string;
    groupIds?: string[];
  };
  account: { id: string | null; name?: string };
  category: { id: string | null; name?: string; kind?: CategoryKind };
  group: { id: string | null; name?: string };
  tag: { id: string | null; name?: string };
  merchant: { id: string | null; name?: string };
  rule: { id: string | null };
  bucket: { id: string | null };
  plan: { id: string | null; seed?: PlanSeed };
  mortgage: { id: string | null };
  import: { accountId: string | null };
  reconcile: { accountId: string };
  fundPaycheck: { incomeTransactionId?: string };
  assignMoney: { bucketId: string; kind: "fund" | "release" };
  moveMoney: { fromId: string | null };
  importInfo: Pick<ImportBatch, "filename" | "counts" | "unreadable">;
  mergeMerchant: { merchantId: string };
  applyRule: { ruleId: string };
  skipNext: { planId: string; asOf: string };
  skipOccurrence: { planId: string; dueDate: string };
  linkOccurrence: { planId: string; accountId: string; dueDate: string };
};

export type EditorKind = keyof EditorInput;

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
    kind === "plan" ||
    kind === "mortgage"
  );
}
