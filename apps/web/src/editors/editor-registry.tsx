import { createElement, lazy, type ReactNode } from "react";
import { Boundary } from "@/components/boundary";
import type { EditorFrame, EditorInput, EditorKind } from "@/editors/editor-types";

/** The editor component of each kind. The input of the kind is the props of the component. */
const editors: { [K in EditorKind]: (input: EditorInput[K]) => ReactNode } = {
  transaction: lazy(() => import("@/transactions/transaction-editor").then((module) => ({ default: module.TransactionEditor }))),
  bulkEdit: lazy(() => import("@/transactions/bulk-editor").then((module) => ({ default: module.BulkEditor }))),
  account: lazy(() => import("@/editors/account-editors").then((module) => ({ default: module.AccountEditor }))),
  category: lazy(() => import("@/editors/settings-editors").then((module) => ({ default: module.CategoryEditor }))),
  group: lazy(() => import("@/editors/settings-editors").then((module) => ({ default: module.GroupEditor }))),
  tag: lazy(() => import("@/editors/settings-editors").then((module) => ({ default: module.TagEditor }))),
  merchant: lazy(() => import("@/editors/settings-editors").then((module) => ({ default: module.MerchantEditor }))),
  bucket: lazy(() => import("@/editors/bucket-editors").then((module) => ({ default: module.BucketEditor }))),
  commitment: lazy(() => import("@/editors/schedule-editors").then((module) => ({ default: module.CommitmentEditor }))),
  income: lazy(() => import("@/editors/schedule-editors").then((module) => ({ default: module.IncomeEditor }))),
  import: lazy(() => import("@/accounts/import-dialog").then((module) => ({ default: module.ImportForm }))),
  bankBalance: lazy(() => import("@/accounts/bank-balance-editor").then((module) => ({ default: module.BankBalanceEditor }))),
  assignMoney: lazy(() => import("@/editors/bucket-editors").then((module) => ({ default: module.AssignEditor }))),
  moveMoney: lazy(() => import("@/buckets/move-money").then((module) => ({ default: module.MoveMoney }))),
  importInfo: lazy(() => import("@/editors/account-editors").then((module) => ({ default: module.ImportInfoEditor }))),
  mergeMerchant: lazy(() => import("@/editors/settings-editors").then((module) => ({ default: module.MergeEditor }))),
  skipNext: lazy(() => import("@/schedules/skip-next").then((module) => ({ default: module.SkipNext }))),
  skipOccurrence: lazy(() => import("@/editors/schedule-editors").then((module) => ({ default: module.SkipOccurrenceEditor }))),
  linkOccurrence: lazy(() => import("@/editors/schedule-editors").then((module) => ({ default: module.LinkOccurrenceEditor }))),
};

/** The text of each kind while the editor loads its data, and the text after a read fails. */
const loadText: { [K in EditorKind]: { loading: string; failed: string } } = {
  transaction: { loading: "Loading the transaction.", failed: "The transaction did not load." },
  bulkEdit: { loading: "Loading the transactions.", failed: "The transactions did not load." },
  account: { loading: "Loading the account.", failed: "The account did not load." },
  category: { loading: "Loading the category.", failed: "The category did not load." },
  group: { loading: "Loading the group.", failed: "The group did not load." },
  tag: { loading: "Loading the tag.", failed: "The tag did not load." },
  merchant: { loading: "Loading the merchant.", failed: "The merchant did not load." },
  bucket: { loading: "Loading the bucket.", failed: "The bucket did not load." },
  commitment: { loading: "Loading the bill.", failed: "The bill did not load." },
  income: { loading: "Loading the income.", failed: "The income did not load." },
  import: { loading: "Loading the import.", failed: "The import did not load." },
  bankBalance: { loading: "Loading the account.", failed: "The account did not load." },
  assignMoney: { loading: "Loading the bucket.", failed: "The bucket did not load." },
  moveMoney: { loading: "Loading buckets.", failed: "The buckets did not load." },
  importInfo: { loading: "Loading the import.", failed: "The import did not load." },
  mergeMerchant: { loading: "Loading the merchant.", failed: "The merchant did not load." },
  skipNext: { loading: "Loading the schedule.", failed: "The schedule did not load." },
  skipOccurrence: { loading: "Loading the schedule.", failed: "The schedule did not load." },
  linkOccurrence: { loading: "Loading the transactions.", failed: "The transactions did not load." },
};

/** The open editor. Its data loads inside one boundary, thus each editor shows the loading line and the error the same way. */
export function EditorBody<K extends EditorKind>({ kind, input }: EditorFrame<K>) {
  return (
    <Boundary look="dialog" loading={loadText[kind].loading} failed={loadText[kind].failed}>
      {createElement(editors[kind], input)}
    </Boundary>
  );
}
