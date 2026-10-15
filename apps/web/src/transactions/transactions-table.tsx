import { accountClass, type TransactionListItem, type TransactionListQuery, type TransactionReviewListQuery } from "@num/shared";
import { Amount } from "@/components/amount";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEditors } from "@/editors/editor-api";
import type { SortChoice } from "@/lists/list-search";
import { useAccountLabels, useBookCurrency } from "@/editors/lookups";
import { CategoryCell, ProposedCategoryCell } from "@/transactions/category-cell";
import { formatDate, refundOfText, refundedText } from "@/transactions/format";
import { ReviewConfidence, ReviewStatus } from "@/transactions/review-status";
import { selectable, useSelection } from "@/transactions/selection-state";
import { useOnReview, useReviewSearch } from "@/transactions/use-transaction-list";

export type TransactionSort = SortChoice<NonNullable<TransactionListQuery["sort"]>>;

/** The sort order of the table. The Needs review page also sorts by confidence. */
type TableSort = SortChoice<NonNullable<TransactionReviewListQuery["sort"]>>;

type Props = {
  rows: TransactionListItem[];
  /** The text of the table when it has no rows. */
  empty: string;
  showBalance: boolean;
  hideAccount?: boolean;
  sort: TableSort;
  onSort: (column: TransactionSort["sort"]) => void;
};

type SortHeadProps<Column extends string> = {
  column: Column;
  label: string;
  sort: TableSort;
  onSort: (column: Column) => void;
  className?: string;
};

/** A column header that sorts the table by its column. */
function SortHead<Column extends string>({ column, label, sort, onSort, className }: SortHeadProps<Column>) {
  const sorted = sort.sort !== column ? "none" : sort.dir === "asc" ? "ascending" : "descending";
  return (
    <TableHead aria-sort={sorted} className={className}>
      <Button type="button" variant="ghost" size="sm" onClick={() => onSort(column)}>
        {label}
      </Button>
    </TableHead>
  );
}

/** The Confidence header of Needs review sorts by confidence. */
function ConfidenceHead() {
  const { sort, sortBy } = useReviewSearch();
  return <SortHead column="confidence" label="Confidence" sort={sort} onSort={sortBy} />;
}

const loanPaymentHint = "Loan payments are changed one at a time.";

/** The checkbox of a row. A click selects the row; Shift and click selects a range. */
function SelectCell({ rows, row }: { rows: TransactionListItem[]; row: TransactionListItem }) {
  const selection = useSelection();
  if (!selection) {
    return null;
  }
  const box = (
    <Checkbox
      aria-label={`Select ${row.payeeRaw}`}
      checked={selection.ids.has(row.id)}
      disabled={!selectable(row)}
      onClick={(event) => {
        event.stopPropagation();
        selection.toggle(rows, row.id, event.shiftKey);
      }}
    />
  );
  return (
    <TableCell className="w-10" onClick={(event) => event.stopPropagation()}>
      {selectable(row) ? (
        box
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex" tabIndex={0} aria-label={loanPaymentHint}>
              {box}
            </span>
          </TooltipTrigger>
          <TooltipContent>{loanPaymentHint}</TooltipContent>
        </Tooltip>
      )}
    </TableCell>
  );
}

/** The header checkbox selects all rows of the page. A selection does not go across pages. */
function SelectAllHead({ rows }: { rows: TransactionListItem[] }) {
  const selection = useSelection();
  if (!selection) {
    return null;
  }
  const open = rows.filter(selectable);
  const count = open.filter((row) => selection.ids.has(row.id)).length;
  return (
    <TableHead className="w-10">
      <Checkbox
        aria-label="Select all transactions on this page"
        checked={open.length > 0 && count === open.length}
        disabled={open.length === 0}
        onCheckedChange={() => selection.setAll(rows, count < open.length)}
      />
    </TableHead>
  );
}

export function TransactionsTable(props: Props) {
  const { rows, empty, showBalance, hideAccount, sort, onSort } = props;
  const { openEditor } = useEditors();
  const currency = useBookCurrency();
  const accountNames = useAccountLabels();
  // The Needs review page shows the proposed label and the confidence.
  const onReview = useOnReview();
  const selecting = useSelection() !== null;
  const columns = 5 + (showBalance ? 1 : 0) + (hideAccount ? 0 : 1) + 1 + (selecting ? 1 : 0);

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
        <SelectCell rows={rows} row={row} />
        <TableCell>{formatDate(row.date)}</TableCell>
        {hideAccount ? null : <TableCell>{accountNames.get(row.accountId) ?? row.accountName}</TableCell>}
        <TableCell>
          <div>{row.payeeRaw}</div>
          {row.refundOf ? <div className="text-muted-foreground">{refundOfText(currency, row.refundOf.date, row.refundOf.amount)}</div> : null}
          {row.refundedAmount ? <div className="text-muted-foreground">{refundedText(currency, row.refundedAmount)}</div> : null}
        </TableCell>
        <TableCell>
          {onReview ? <ProposedCategoryCell row={row} /> : <CategoryCell row={row} />}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-2">
            {row.status === "open" ? (
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
          {onReview ? <ReviewConfidence review={row.review} /> : <ReviewStatus review={row.review} />}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="overflow-hidden rounded-[16px] border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <SelectAllHead rows={rows} />
            <SortHead column="date" label="Date" sort={sort} onSort={onSort} />
            {hideAccount ? null : <TableHead>Account</TableHead>}
            <SortHead column="payeeRaw" label="Payee" sort={sort} onSort={onSort} />
            <TableHead>Category</TableHead>
            <SortHead column="amount" label="Amount" sort={sort} onSort={onSort} className="text-right" />
            {showBalance ? <TableHead className="text-right">Balance</TableHead> : null}
            {onReview ? <ConfidenceHead /> : <TableHead>Status</TableHead>}
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
