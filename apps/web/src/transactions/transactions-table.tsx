import { accountClass, type TransactionListItem, type TransactionListQuery, type TransactionReviewListQuery } from "@num/shared";
import { Amount } from "@/components/amount";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEditors } from "@/editors/editor-api";
import type { SortChoice } from "@/lists/list-search";
import { useAccountLabels, useBookCurrency } from "@/editors/lookups";
import { CategoryCell } from "@/transactions/category-cell";
import { useRowLabel } from "@/transactions/row-label";
import { formatDate, refundOfText, refundedText } from "@/transactions/format";
import { ReviewConfidence, ReviewStatus } from "@/transactions/review-status";
import { selectable, useSelection } from "@/transactions/selection-state";
import { useOnReview, useReviewSearch } from "@/transactions/use-transaction-list";

export type TransactionSort = SortChoice<NonNullable<TransactionListQuery["sort"]>>;

/** The sort order of the table. The Needs review page also sorts by confidence. */
type TableSort = SortChoice<NonNullable<TransactionReviewListQuery["sort"]>>;

type Props = {
  rows: TransactionListItem[];
  showBalance: boolean;
  hideAccount?: boolean;
  sort: TableSort;
  onSort: (column: TransactionSort["sort"]) => void;
};

/**
 * The table follows the width of its container, not of the screen (design §6a). A narrow table (less than 48rem)
 * shows the checkbox and one cell with two lines. A wide table shows the columns. The Account column shows only when
 * the table has 56rem.
 */
const wide = "@max-3xl:hidden";
const narrow = "@3xl:hidden";
const account = "@max-4xl:hidden";

type SortHeadProps<Column extends string> = {
  column: Column;
  label: string;
  sort: TableSort;
  onSort: (column: Column) => void;
  className?: string;
};

/** The button of a header that sorts the table by its column. */
function SortButton<Column extends string>({ column, label, onSort }: { column: Column; label: string; onSort: (column: Column) => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="-mx-2 px-2 text-xs font-bold tracking-wider uppercase" onClick={() => onSort(column)}>
      {label}
    </Button>
  );
}

/** A column header that sorts the table by its column. */
function SortHead<Column extends string>({ column, label, sort, onSort, className }: SortHeadProps<Column>) {
  const sorted = sort.sort !== column ? "none" : sort.dir === "asc" ? "ascending" : "descending";
  return (
    <TableHead aria-sort={sorted} className={className}>
      <SortButton column={column} label={label} onSort={onSort} />
    </TableHead>
  );
}

/** The Confidence header of Needs review sorts by confidence. */
function ConfidenceHead() {
  const { sort, sortBy } = useReviewSearch();
  return <SortHead column="confidence" label="Confidence" sort={sort} onSort={sortBy} className={wide} />;
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
  const { rows, showBalance, hideAccount, sort, onSort } = props;
  const { openEditor } = useEditors();
  const currency = useBookCurrency();
  const accountNames = useAccountLabels();
  // The Needs review page shows the proposed label and the confidence.
  const onReview = useOnReview();
  const rowLabel = useRowLabel(onReview);

  function renderRow(row: TransactionListItem) {
    const open = () => void openEditor("transaction", { id: row.id });
    const { label, merchant } = rowLabel(row);
    const balance =
      showBalance && row.runningBalance !== null ? <Amount value={row.runningBalance} owed={accountClass(row.accountKind) === "liability"} /> : null;
    const status = onReview ? <ReviewConfidence review={row.review} /> : <ReviewStatus review={row.review} />;
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
        {/* A narrow table: line 1 is the payee and the amount; line 2 is the date and the label. */}
        <TableCell className={`w-full max-w-0 ${narrow}`}>
          <div className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 truncate font-semibold">{row.payeeRaw}</span>
            <Amount value={row.amount} className="shrink-0" />
          </div>
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">
              {[formatDate(row.date), label, row.status === "open" ? "Pending" : null].filter(Boolean).join(" · ")}
            </span>
            {status}
            {balance ? <small className="shrink-0 text-[13px]">{balance}</small> : null}
          </div>
        </TableCell>
        <TableCell className={wide}>{formatDate(row.date)}</TableCell>
        {hideAccount ? null : <TableCell className={`${wide} ${account}`}>{accountNames.get(row.accountId) ?? row.accountName}</TableCell>}
        <TableCell className={`w-full max-w-0 ${wide}`}>
          <div className="truncate">{row.payeeRaw}</div>
          {row.refundOf ? <div className="truncate text-muted-foreground">{refundOfText(currency, row.refundOf.date, row.refundOf.amount)}</div> : null}
          {row.refundedAmount ? <div className="truncate text-muted-foreground">{refundedText(currency, row.refundedAmount)}</div> : null}
        </TableCell>
        <TableCell className={`max-w-48 [&>div]:truncate ${wide}`}>
          <CategoryCell label={label} merchant={merchant} />
        </TableCell>
        <TableCell className={`text-right ${wide}`}>
          <div className="flex items-center justify-end gap-2">
            {row.status === "open" ? (
              <span className="text-sm text-muted-foreground">Pending</span>
            ) : null}
            <Amount value={row.amount} />
          </div>
        </TableCell>
        {showBalance ? <TableCell className={`text-right ${wide}`}>{balance}</TableCell> : null}
        <TableCell className={wide}>{status}</TableCell>
      </TableRow>
    );
  }

  return (
    <div className="@container">
      <Table>
        <TableHeader>
          <TableRow>
            <SelectAllHead rows={rows} />
            {/* A narrow table has one header cell with the sort buttons of its two lines. */}
            <TableHead className={narrow}>
              <div className="flex items-center gap-4">
                <SortButton column="payeeRaw" label="Payee" onSort={onSort} />
                <SortButton column="date" label="Date" onSort={onSort} />
                <span className="ml-auto">
                  <SortButton column="amount" label="Amount" onSort={onSort} />
                </span>
              </div>
            </TableHead>
            <SortHead column="date" label="Date" sort={sort} onSort={onSort} className={wide} />
            {hideAccount ? null : <TableHead className={`${wide} ${account}`}>Account</TableHead>}
            <SortHead column="payeeRaw" label="Payee" sort={sort} onSort={onSort} className={wide} />
            <TableHead className={wide}>Category</TableHead>
            <SortHead column="amount" label="Amount" sort={sort} onSort={onSort} className={`text-right ${wide}`} />
            {showBalance ? <TableHead className={`text-right ${wide}`}>Balance</TableHead> : null}
            {onReview ? <ConfidenceHead /> : <TableHead className={wide}>Status</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>{rows.map(renderRow)}</TableBody>
      </Table>
    </div>
  );
}
