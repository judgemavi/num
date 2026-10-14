import type { TransactionListItem } from "@num/shared";
import { createContext, useContext } from "react";

/** A loan payment (a row with two lines) is changed one at a time. It cannot be selected (decisions 0051, 0053). */
export function selectable(row: Pick<TransactionListItem, "lines">) {
  return row.lines.length === 1;
}

export type Selection = {
  /** The selected rows of the page on the screen. */
  ids: ReadonlySet<string>;
  /** Select or clear one row. With `range`, the rows from the last clicked row to this row take the same state. */
  toggle: (rows: readonly TransactionListItem[], id: string, range: boolean) => void;
  /** Select or clear all rows of the page. */
  setAll: (rows: readonly TransactionListItem[], selected: boolean) => void;
  clear: () => void;
};

export const SelectionContext = createContext<Selection | null>(null);

/** The row selection of the screen. Null where the table has no selection (the page of an account). */
export function useSelection() {
  return useContext(SelectionContext);
}
