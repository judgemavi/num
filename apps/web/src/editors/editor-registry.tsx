import { createElement, type ReactNode } from "react";
import { Boundary } from "@/components/boundary";
import { BankBalanceEditor } from "@/accounts/bank-balance-editor";
import { ImportForm } from "@/accounts/import-dialog";
import { AccountEditor, ImportInfoEditor } from "@/editors/account-editors";
import { MoveMoney } from "@/buckets/move-money";
import { AssignEditor, BucketEditor } from "@/editors/bucket-editors";
import type { EditorFrame, EditorInput, EditorKind } from "@/editors/editor-types";
import { LinkOccurrenceEditor, PlanEditor, SkipOccurrenceEditor } from "@/editors/recurring-editors";
import { SkipNext } from "@/recurring/skip-next";
import { CategoryEditor, GroupEditor, MergeEditor, MerchantEditor, TagEditor } from "@/editors/settings-editors";
import { BulkEditor } from "@/transactions/bulk-editor";
import { TransactionEditor } from "@/transactions/transaction-editor";

/** The editor component of each kind. The input of the kind is the props of the component. */
const editors: { [K in EditorKind]: (input: EditorInput[K]) => ReactNode } = {
  transaction: TransactionEditor,
  bulkEdit: BulkEditor,
  account: AccountEditor,
  category: CategoryEditor,
  group: GroupEditor,
  tag: TagEditor,
  merchant: MerchantEditor,
  bucket: BucketEditor,
  plan: PlanEditor,
  import: ImportForm,
  bankBalance: BankBalanceEditor,
  assignMoney: AssignEditor,
  moveMoney: MoveMoney,
  importInfo: ImportInfoEditor,
  mergeMerchant: MergeEditor,
  skipNext: SkipNext,
  skipOccurrence: SkipOccurrenceEditor,
  linkOccurrence: LinkOccurrenceEditor,
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
  plan: { loading: "Loading recurring.", failed: "Recurring did not load." },
  import: { loading: "Loading the import.", failed: "The import did not load." },
  bankBalance: { loading: "Loading the account.", failed: "The account did not load." },
  assignMoney: { loading: "Loading the bucket.", failed: "The bucket did not load." },
  moveMoney: { loading: "Loading buckets.", failed: "The buckets did not load." },
  importInfo: { loading: "Loading the import.", failed: "The import did not load." },
  mergeMerchant: { loading: "Loading the merchant.", failed: "The merchant did not load." },
  skipNext: { loading: "Loading recurring.", failed: "Recurring did not load." },
  skipOccurrence: { loading: "Loading recurring.", failed: "Recurring did not load." },
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
