import type { BucketEventKind, CategoryKind, ImportBatch, PlanKind } from "@num/shared";
import type { PlanSeed } from "@/recurring/plan-values";

/** The input of each editor. `openEditor(kind, input)` and the editor component of that kind use the same type. */
export type EditorInput = {
  transaction: {
    id: string | null;
    rawLine?: string;
    initialAccountId?: string;
    unreadableItemKey?: string;
  };
  /** The bulk editor of the selected rows (decision 0051). It is not in the URL. */
  bulkEdit: { ids: string[] };
  account: { id: string | null; name?: string };
  category: { id: string | null; name?: string; kind?: CategoryKind };
  group: { id: string | null; name?: string };
  tag: { id: string | null; name?: string };
  merchant: { id: string | null; name?: string };
  bucket: { id: string | null };
  plan: { id: string | null; seed?: PlanSeed; kind?: PlanKind };
  import: { accountId: string | null };
  reconcile: { accountId: string };
  fundPaycheck: { incomeTransactionId?: string };
  assignMoney: { bucketId: string; kind: Extract<BucketEventKind, "fund" | "release"> };
  moveMoney: { fromId: string | null };
  importInfo: Pick<ImportBatch, "filename" | "counts" | "unreadable">;
  mergeMerchant: { merchantId: string };
  skipNext: { planId: string };
  skipOccurrence: { planId: string; dueDate: string };
  linkOccurrence: { planId: string; accountId: string; dueDate: string };
};

export type EditorKind = keyof EditorInput;

/**
 * An editor to open: the kind and the input of that kind. With no type argument it is the union of all kinds, and a
 * check of `kind` gives the type of `input`. With a generic kind it keeps the kind and the input together.
 */
export type EditorFrame<K extends EditorKind = EditorKind> = { [P in K]: { kind: P; input: EditorInput[P] } }[K];
