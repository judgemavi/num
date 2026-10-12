import { accountClass, type Account, type Category, type Merchant, type ReviewCounts, type TransactionListItem, type TransactionListQuery } from "@num/shared";
import { Fragment } from "react";
import { accountLabelOf, accountLabels } from "@/accounts/label";
import { Amount } from "@/components/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEditors } from "@/editors/editor-api";
import { CategoryCell, type Names } from "@/transactions/category-cell";
import { formatDate, levelLabel, reconciledLabel, refundOfText, refundedText, statusLabel } from "@/transactions/format";
import { hasFilters } from "@/transactions/query";
import { useReviewActions } from "@/transactions/use-review-actions";

type SortColumn = NonNullable<TransactionListQuery["sort"]>;
type GroupKey = "sure" | "likely" | "maybe" | "questions";

const groupOrder: GroupKey[] = ["sure", "likely", "maybe", "questions"];

function groupOf(item: TransactionListItem): GroupKey {
  const review = item.review;
  if (review && review.question === "categorize" && review.level !== "none") {
    return review.level;
  }
  return "questions";
}

type Props = {
  search: TransactionListQuery;
  rows: TransactionListItem[];
  counts: ReviewCounts | null;
  currency: string;
  accounts: Account[];
  categories: Category[];
  merchants: Merchant[];
  showBalance: boolean;
  sortState: (column: SortColumn) => "ascending" | "descending" | "none";
  onSort: (column: SortColumn) => void;
};

function SortHead({ column, label, props, className }: { column: SortColumn; label: string; props: Props; className?: string }) {
  return (
    <TableHead aria-sort={props.sortState(column)} className={className}>
      <Button type="button" variant="ghost" size="sm" onClick={() => props.onSort(column)}>
        {label}
      </Button>
    </TableHead>
  );
}

export function TransactionsTable(props: Props) {
  const { search, rows, counts, currency, accounts, categories, merchants, showBalance } = props;
  const { openEditor } = useEditors();
  const actions = useReviewActions(search);
  const accountNames = accountLabels(accounts);
  const names: Names = {
    categories: new Map(categories.map((category) => [category.id, category.name])),
    accounts: accountNames,
    merchants: new Map(merchants.map((merchant) => [merchant.id, merchant.name])),
  };
  const columns = showBalance ? 7 : 6;
  const grouped = search.needsReview === true && counts !== null;

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
        <TableCell>{formatDate(row.date)}</TableCell>
        <TableCell>{accountLabelOf(accountNames, row.accountId, row.accountName)}</TableCell>
        <TableCell>
          <div>{row.payeeRaw}</div>
          {row.refundOf ? <div className="text-muted-foreground">{refundOfText(currency, row.refundOf.date, row.refundOf.amount)}</div> : null}
          {row.refundedAmount ? <div className="text-muted-foreground">{refundedText(currency, row.refundedAmount)}</div> : null}
        </TableCell>
        <TableCell>
          <CategoryCell row={row} names={names} pending={actions.pending} planById={actions.planById} run={actions.run} />
        </TableCell>
        <TableCell className="text-right">
          <Amount currency={currency} minor={row.amount} />
        </TableCell>
        <TableCell>
          {row.reconciled ? (
            <Badge variant="neutral">{reconciledLabel()}</Badge>
          ) : row.status === "open" ? null : (
            <Badge variant="positive">{statusLabel(row.status)}</Badge>
          )}
        </TableCell>
        {showBalance ? (
          <TableCell className="text-right">
            {row.runningBalance === null ? null : (
              <Amount currency={currency} minor={row.runningBalance} owed={accountClass(row.accountKind) === "liability"} />
            )}
          </TableCell>
        ) : null}
      </TableRow>
    );
  }

  function renderGroups() {
    return groupOrder.map((key) => {
      const group = rows.filter((row) => groupOf(row) === key);
      if (group.length === 0 || counts === null) {
        return null;
      }
      const title = key === "questions" ? "Questions" : levelLabel(key);
      const count = key === "questions" ? counts.questions + counts.none : counts[key];
      return (
        <Fragment key={key}>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableCell colSpan={columns}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{`${title} · ${count}`}</span>
                {key === "sure" || key === "likely" ? (
                  <Button type="button" size="sm" disabled={actions.pending || count === 0} onClick={() => void actions.approve(key, count)}>
                    {`Approve all ${count}`}
                  </Button>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
          {group.map(renderRow)}
        </Fragment>
      );
    });
  }

  return (
    <>
      {actions.error ? <p role="alert">{actions.error}</p> : null}
      <div className="overflow-hidden rounded-[16px] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead column="date" label="Date" props={props} />
              <TableHead>Account</TableHead>
              <SortHead column="payeeRaw" label="Payee" props={props} />
              <TableHead>Category</TableHead>
              <SortHead column="amount" label="Amount" props={props} className="text-right" />
              <TableHead>Status</TableHead>
              {showBalance ? <TableHead className="text-right">Balance</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns} className="text-muted-foreground">
                  {search.needsReview ? "Nothing needs review." : hasFilters(search) ? "No transactions match." : "No transactions yet."}
                </TableCell>
              </TableRow>
            ) : grouped ? (
              renderGroups()
            ) : (
              rows.map(renderRow)
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
