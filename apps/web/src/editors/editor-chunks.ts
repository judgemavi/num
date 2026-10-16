import type { ReactNode } from "react";
import { retryLazy } from "@/components/retry-lazy";
import type { EditorInput, EditorKind } from "@/editors/editor-types";

/** The editor component of each kind. The input of the kind is the props of the component. */
export const editors: { [K in EditorKind]: { Component: (input: EditorInput[K]) => ReactNode; preload: () => Promise<unknown>; retry: () => void } } = {
  transaction: retryLazy(() => import("@/transactions/transaction-editor").then((module) => ({ default: module.TransactionEditor }))),
  bulkEdit: retryLazy(() => import("@/transactions/bulk-editor").then((module) => ({ default: module.BulkEditor }))),
  account: retryLazy(() => import("@/editors/account-editors").then((module) => ({ default: module.AccountEditor }))),
  category: retryLazy(() => import("@/editors/settings-editors").then((module) => ({ default: module.CategoryEditor }))),
  group: retryLazy(() => import("@/editors/settings-editors").then((module) => ({ default: module.GroupEditor }))),
  tag: retryLazy(() => import("@/editors/settings-editors").then((module) => ({ default: module.TagEditor }))),
  merchant: retryLazy(() => import("@/editors/settings-editors").then((module) => ({ default: module.MerchantEditor }))),
  bucket: retryLazy(() => import("@/editors/bucket-editors").then((module) => ({ default: module.BucketEditor }))),
  commitment: retryLazy(() => import("@/editors/schedule-editors").then((module) => ({ default: module.CommitmentEditor }))),
  income: retryLazy(() => import("@/editors/schedule-editors").then((module) => ({ default: module.IncomeEditor }))),
  import: retryLazy(() => import("@/accounts/import-dialog").then((module) => ({ default: module.ImportForm }))),
  bankBalance: retryLazy(() => import("@/accounts/bank-balance-editor").then((module) => ({ default: module.BankBalanceEditor }))),
  assignMoney: retryLazy(() => import("@/editors/bucket-editors").then((module) => ({ default: module.AssignEditor }))),
  moveMoney: retryLazy(() => import("@/buckets/move-money").then((module) => ({ default: module.MoveMoney }))),
  importInfo: retryLazy(() => import("@/editors/account-editors").then((module) => ({ default: module.ImportInfoEditor }))),
  mergeMerchant: retryLazy(() => import("@/editors/settings-editors").then((module) => ({ default: module.MergeEditor }))),
  skipNext: retryLazy(() => import("@/schedules/skip-next").then((module) => ({ default: module.SkipNext }))),
  skipOccurrence: retryLazy(() => import("@/editors/schedule-editors").then((module) => ({ default: module.SkipOccurrenceEditor }))),
  linkOccurrence: retryLazy(() => import("@/editors/schedule-editors").then((module) => ({ default: module.LinkOccurrenceEditor }))),
};

export function preloadEditor(kind: EditorKind) {
  return editors[kind].preload();
}
