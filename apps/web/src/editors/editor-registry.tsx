import { createElement } from "react";
import { editors } from "@/editors/editor-chunks";
import { Boundary } from "@/components/boundary";
import type { EditorFrame, EditorKind } from "@/editors/editor-types";

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
  valuation: { loading: "Loading the valuation.", failed: "The valuation did not load." },
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
    <Boundary onRetry={editors[kind].retry} look="dialog" loading={loadText[kind].loading} failed={loadText[kind].failed}>
      {createElement(editors[kind].Component, input)}
    </Boundary>
  );
}
