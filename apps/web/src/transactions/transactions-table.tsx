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
  showBalance: boolean;
  hideAccount?: boolean;
  sort: TableSort;
  onSort: (column: TransactionSort["sort"]) => void;
};

/** A column that shows only from `md`. On a phone the table shows the checkbox, Date, Payee and Amount (design §6a). */
const wide = "max-md:hidden";

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
      <Button type="button" variant="ghost" size="sm" className="-mx-2 px-2 text-xs font-bold tracking-wider uppercase" onClick={() => onSort(column)}>
        {label}
      </Button>
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

  function renderRow(row: TransactionListItem) {
    const open = () => void openEditor("transaction", { id: row.id });
    const category = onReview ? <ProposedCategoryCell row={row} /> : <CategoryCell row={row} />;
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
        <TableCell>{formatDate(row.date)}</TableCell>
        {hideAccount ? null : <TableCell className={wide}>{accountNames.get(row.accountId) ?? row.accountName}</TableCell>}
        <TableCell className="max-md:whitespace-normal">
          <div>{row.payeeRaw}</div>
          {row.refundOf ? <div className="text-muted-foreground">{refundOfText(currency, row.refundOf.date, row.refundOf.amount)}</div> : null}
          {row.refundedAmount ? <div className="text-muted-foreground">{refundedText(currency, row.refundedAmount)}</div> : null}
          {/* On a phone the Category and Status columns do not show. Their text goes under the payee. */}
          <div className="grid justify-items-start gap-1 text-[13px] text-muted-foreground md:hidden">
            {category}
            {status}
          </div>
        </TableCell>
        <TableCell className={wide}>{category}</TableCell>
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
        <TableCell className={wide}>{status}</TableCell>
      </TableRow>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SelectAllHead rows={rows} />
          <SortHead column="date" label="Date" sort={sort} onSort={onSort} />
          {hideAccount ? null : <TableHead className={wide}>Account</TableHead>}
          <SortHead column="payeeRaw" label="Payee" sort={sort} onSort={onSort} />
          <TableHead className={wide}>Category</TableHead>
          <SortHead column="amount" label="Amount" sort={sort} onSort={onSort} className="text-right" />
          {showBalance ? <TableHead className="text-right">Balance</TableHead> : null}
          {onReview ? <ConfidenceHead /> : <TableHead className={wide}>Status</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>{rows.map(renderRow)}</TableBody>
    </Table>
  );
}
