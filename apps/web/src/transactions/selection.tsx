import type { TransactionListItem } from "@num/shared";
import { useState, type ReactNode } from "react";
import { selectable, SelectionContext, type Selection } from "@/transactions/selection-state";
import { useTransactionSearch } from "@/transactions/use-transaction-list";

/** The rows between two rows of the page, the two rows included. */
function rangeOf(rows: readonly TransactionListItem[], from: string, to: string) {
  const start = rows.findIndex((row) => row.id === from);
  const end = rows.findIndex((row) => row.id === to);
  if (start < 0 || end < 0) {
    return [to];
  }
  return rows.slice(Math.min(start, end), Math.max(start, end) + 1).filter(selectable).map((row) => row.id);
}

/**
 * The row selection of the transaction table on `/transactions` and `/transactions/review` (decision 0051). The
 * selection is state of the screen. It belongs to the page, the filters and the sort order on the screen, thus it
 * clears when one of them changes.
 */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const pageKey = JSON.stringify(useTransactionSearch().shown);
  const [state, setState] = useState({ pageKey, ids: new Set<string>(), anchor: "" });
  const current = state.pageKey === pageKey ? state : { pageKey, ids: new Set<string>(), anchor: "" };

  const value: Selection = {
    ids: current.ids,
    toggle(rows, id, range) {
      const on = !current.ids.has(id);
      const changed = range && current.anchor ? rangeOf(rows, current.anchor, id) : [id];
      const ids = new Set(current.ids);
      for (const rowId of changed) {
        if (on) {
          ids.add(rowId);
        } else {
          ids.delete(rowId);
        }
      }
      setState({ pageKey, ids, anchor: id });
    },
    setAll(rows, selected) {
      setState({ pageKey, ids: new Set(selected ? rows.filter(selectable).map((row) => row.id) : []), anchor: "" });
    },
    clear() {
      setState({ pageKey, ids: new Set(), anchor: "" });
    },
  };

  return <SelectionContext value={value}>{children}</SelectionContext>;
}
