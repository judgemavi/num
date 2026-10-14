import { accountClass, type TransactionListItem, type TransactionListQuery } from "@num/shared";
import { Lock } from "lucide-react";
import { Amount } from "@/components/amount";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEditors } from "@/editors/editor-api";
import type { SortChoice } from "@/lists/list-search";
import { useAccountLabels, useBookCurrency } from "@/editors/lookups";
import { CategoryCell } from "@/transactions/category-cell";
import { formatDate, refundOfText, refundedText } from "@/transactions/format";
import { ReviewStatus } from "@/transactions/review-status";

export type TransactionSort = SortChoice<NonNullable<TransactionListQuery["sort"]>>;

export type Selection = {
  ids: string[];
  onToggle: (id: string, on: boolean) => void;
  onTogglePage: (on: boolean) => void;
};

type Props = {
  rows: TransactionListItem[];
  /** The text of the table when it has no rows. */
  empty: string;
  showBalance: boolean;
  hideAccount?: boolean;
  selection?: Selection;
  sort: TransactionSort;
  onSort: (column: TransactionSort["sort"]) => void;
};

function SortHead({ column, label, props, className }: { column: TransactionSort["sort"]; label: string; props: Props; className?: string }) {
  const sorted = props.sort.sort !== column ? "none" : props.sort.dir === "asc" ? "ascending" : "descending";
  return (
    <TableHead aria-sort={sorted} className={className}>
      <Button type="button" variant="ghost" size="sm" onClick={() => props.onSort(column)}>
        {label}
      </Button>
    </TableHead>
  );
}

export function TransactionsTable(props: Props) {
  const { rows, empty, showBalance, hideAccount, selection } = props;
  const { openEditor } = useEditors();
  const currency = useBookCurrency();
  const accountNames = useAccountLabels();
  const columns = 5 + (showBalance ? 1 : 0) + (hideAccount ? 0 : 1) + (selection ? 1 : 0) + 1;
  const selectable = selection ? rows.filter((row) => !row.reconciled) : [];
  const selectedOnPage = selection ? selectable.filter((row) => selection.ids.includes(row.id)) : [];

  function renderRow(row: TransactionListItem) {
    const open = () => void openEditor("transaction", { id: row.id });
    return (
      <TableRow
        key={row.id}
        className="cursor-pointer"
        tabIndex={0}
        onClick={open}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          open();
        }}
      >
        {selection ? (
          <TableCell onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
            {row.reconciled ? null : (
              <Checkbox
                aria-label={`Select ${row.payeeRaw}`}
                checked={selection.ids.includes(row.id)}
                onCheckedChange={(value) => selection.onToggle(row.id, value === true)}
              />
            )}
          </TableCell>
        ) : null}
        <TableCell>{formatDate(row.date)}</TableCell>
        {hideAccount ? null : <TableCell>{accountNames.get(row.accountId) ?? row.accountName}</TableCell>}
        <TableCell>
          <div>{row.payeeRaw}</div>
          {row.refundOf ? <div className="text-muted-foreground">{refundOfText(currency, row.refundOf.date, row.refundOf.amount)}</div> : null}
          {row.refundedAmount ? <div className="text-muted-foreground">{refundedText(currency, row.refundedAmount)}</div> : null}
        </TableCell>
        <TableCell>
          <CategoryCell row={row} />
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-2">
            {row.reconciled ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span role="img" aria-label="Checked against your balance" tabIndex={0}>
                    <Lock className="size-3.5 text-muted-foreground" aria-hidden />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Checked against your balance</TooltipContent>
              </Tooltip>
            ) : row.status === "open" ? (
              <span className="text-sm text-muted-foreground">Pending</span>
            ) : null}
            <Amount value={row.amount} />
          </div>
        </TableCell>
        {showBalance ? (
          <TableCell className="text-right">
            {row.runningBalance === null ? null : (
              <Amount value={row.runningBalance} owed={accountClass(row.accountKind) === "liability"} />
            )}
          </TableCell>
        ) : null}
        <TableCell>
          <ReviewStatus review={row.review} />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="overflow-hidden rounded-[16px] border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {selection ? (
              <TableHead>
                <Checkbox
                  aria-label="Select transactions on this page"
                  disabled={selectable.length === 0}
                  checked={selectedOnPage.length === 0 ? false : selectedOnPage.length === selectable.length ? true : "indeterminate"}
                  onCheckedChange={(value) => selection.onTogglePage(value === true)}
                />
              </TableHead>
            ) : null}
            <SortHead column="date" label="Date" props={props} />
            {hideAccount ? null : <TableHead>Account</TableHead>}
            <SortHead column="payeeRaw" label="Payee" props={props} />
            <TableHead>Category</TableHead>
            <SortHead column="amount" label="Amount" props={props} className="text-right" />
            {showBalance ? <TableHead className="text-right">Balance</TableHead> : null}
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns} className="text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map(renderRow)
          )}
        </TableBody>
      </Table>
    </div>
  );
}
