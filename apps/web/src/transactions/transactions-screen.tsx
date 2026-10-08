import {
  accountListSchema,
  categoryListSchema,
  currencyUpdateSchema,
  merchantListSchema,
  tagListSchema,
  transactionListSchema,
  type Account,
  type Category,
  type Tag,
  type TransactionListQuery,
  accountClass,
} from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useCallback, useEffect } from "react";
import { apiRequest } from "@/request";
import { loadAllPages } from "@/settings/load-all-pages";
import { Amount } from "@/components/amount";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TransactionFilterBar } from "@/transactions/filters";
import { formatDate, statusLabel } from "@/transactions/format";
import { hasFilters, transactionPath } from "@/transactions/query";
import { useEditors } from "@/editors/editor-api";

const transactionsRoute = getRouteApi("/transactions");

type SortColumn = NonNullable<TransactionListQuery["sort"]>;

async function loadNamed<T extends { id: string }>(
  base: string,
  schema: { parse: (data: unknown) => { items: T[]; page: number; pageSize: number; total: number } },
): Promise<T[]> {
  const active = await loadAllPages(base, schema, { archived: false });
  const archived = await loadAllPages(base, schema, { archived: true });
  return [...active.items, ...archived.items];
}

export function TransactionsScreen() {
  const search = transactionsRoute.useSearch();
  const navigate = transactionsRoute.useNavigate();
  const { openEditor } = useEditors();

  const currency = useQuery({
    queryKey: ["book-currency"],
    queryFn: async () => {
      const result = await apiRequest("/api/settings/currency", currencyUpdateSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.currency;
    },
  });

  const transactions = useQuery({
    queryKey: ["transactions", search],
    queryFn: async () => {
      const result = await apiRequest(transactionPath(search), transactionListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  const accounts = useQuery({
    queryKey: ["accounts", "options"],
    queryFn: () => loadNamed<Account>("/api/accounts", accountListSchema),
  });
  const categories = useQuery({
    queryKey: ["categories", "options"],
    queryFn: () => loadNamed<Category>("/api/categories", categoryListSchema),
  });
  const tags = useQuery({
    queryKey: ["tags", "options"],
    queryFn: () => loadNamed<Tag>("/api/tags", tagListSchema),
  });
  const merchants = useQuery({
    queryKey: ["merchants", "options"],
    queryFn: async () => {
      const page = await loadAllPages("/api/merchants", merchantListSchema, { archived: false });
      return page.items;
    },
  });

  const changeFilters = useCallback(
    (patch: Partial<TransactionListQuery>) => {
      void navigate({ search: { ...search, ...patch, page: 1 } });
    },
    [navigate, search],
  );

  useEffect(() => {
    if (!transactions.data) {
      return;
    }
    const lastPage = Math.max(1, Math.ceil(transactions.data.total / transactions.data.pageSize));
    if (search.page > lastPage) {
      void navigate({ search: { ...search, page: lastPage }, replace: true });
    }
  }, [navigate, search, transactions.data]);

  function sortBy(column: SortColumn) {
    const current = search.sort ?? "date";
    const currentDir = search.dir ?? (search.sort === undefined ? "desc" : "asc");
    const nextDir = current === column ? (currentDir === "asc" ? "desc" : "asc") : column === "date" ? "desc" : "asc";
    const isDefault = column === "date" && nextDir === "desc";
    void navigate({
      search: {
        ...search,
        sort: isDefault ? undefined : column,
        dir: isDefault ? undefined : nextDir,
        page: 1,
      },
    });
  }

  const pending =
    currency.isPending || transactions.isPending || accounts.isPending || categories.isPending || tags.isPending || merchants.isPending;
  if (pending) {
    return <p className="text-muted-foreground">Loading transactions.</p>;
  }
  if (
    currency.isError ||
    transactions.isError ||
    accounts.isError ||
    categories.isError ||
    tags.isError ||
    merchants.isError ||
    !currency.data ||
    !transactions.data ||
    !accounts.data ||
    !categories.data ||
    !tags.data ||
    !merchants.data
  ) {
    return (
      <div className="grid content-start gap-5">
        <p>The transactions did not load.</p>
        <Button
          type="button"
          onClick={() => {
            void currency.refetch();
            void transactions.refetch();
            void accounts.refetch();
            void categories.refetch();
            void tags.refetch();
            void merchants.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const bookCurrency = currency.data;
  const page = transactions.data;
  const rows = page.items;
  const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize));
  const selectedAccount = accounts.data.find((account) => account.id === search.accountId);
  const showBalance =
    selectedAccount !== undefined && selectedAccount.kind !== "investment" && selectedAccount.kind !== "property";
  const sort = search.sort ?? "date";
  const dir = search.dir ?? (search.sort === undefined ? "desc" : "asc");

  function sortState(column: SortColumn): "ascending" | "descending" | "none" {
    if (sort !== column) {
      return "none";
    }
    return dir === "asc" ? "ascending" : "descending";
  }

  return (
    <>
      <PageHeader
        kicker={page.total === 1 ? "1 transaction" : `${page.total} transactions`}
        title="Transactions"
        actions={
          <Button type="button" disabled={accounts.data.every((account) => account.archivedAt)} onClick={() => void openEditor("transaction", { id: null })}>
            <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
            New transaction
          </Button>
        }
      />
      <TransactionFilterBar
        search={search}
        accounts={accounts.data}
        categories={categories.data}
        merchants={merchants.data}
        tags={tags.data}
        onChange={changeFilters}
      />
      <div className="overflow-hidden rounded-[16px] border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead aria-sort={sortState("date")}>
              <Button type="button" variant="ghost" size="sm" onClick={() => sortBy("date")}>
                Date
              </Button>
            </TableHead>
            <TableHead>Account</TableHead>
            <TableHead aria-sort={sortState("payeeRaw")}>
              <Button type="button" variant="ghost" size="sm" onClick={() => sortBy("payeeRaw")}>
                Payee
              </Button>
            </TableHead>
            <TableHead aria-sort={sortState("amount")} className="text-right">
              <Button type="button" variant="ghost" size="sm" onClick={() => sortBy("amount")}>
                Amount
              </Button>
            </TableHead>
            <TableHead>Status</TableHead>
            {showBalance ? <TableHead className="text-right">Balance</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={showBalance ? 6 : 5} className="text-muted-foreground">
                {hasFilters(search) ? "No transactions match." : "No transactions yet."}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                tabIndex={0}
                onClick={() => void openEditor("transaction", { id: row.id })}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                  event.preventDefault();
                  void openEditor("transaction", { id: row.id });
                }}
              >
                <TableCell>{formatDate(row.date)}</TableCell>
                <TableCell>{row.accountName}</TableCell>
                <TableCell>
                  <div>{row.payeeRaw}</div>
                  {row.merchantName ? <div className="text-muted-foreground">{row.merchantName}</div> : null}
                </TableCell>
                <TableCell className="text-right">
                  <Amount currency={bookCurrency} minor={row.amount} />
                </TableCell>
                <TableCell>
                  {row.status === "open" ? null : <Badge variant="positive">{statusLabel(row.status)}</Badge>}
                </TableCell>
                {showBalance ? (
                  <TableCell className="text-right">
                    {row.runningBalance === null ? null : (
                      <Amount currency={bookCurrency} minor={row.runningBalance} owed={accountClass(row.accountKind) === "liability"} />
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      </div>
      {page.total > page.pageSize ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={search.page <= 1}
            onClick={() => {
              void navigate({ search: { ...search, page: search.page - 1 } });
            }}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={search.page >= lastPage}
            onClick={() => {
              void navigate({ search: { ...search, page: search.page + 1 } });
            }}
          >
            Next
          </Button>
        </div>
      ) : null}
    </>
  );
}
