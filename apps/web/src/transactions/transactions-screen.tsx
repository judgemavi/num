import {
  accountListSchema,
  categoryListSchema,
  currencyUpdateSchema,
  tagListSchema,
  transactionListSchema,
  type Account,
  type Category,
  type Tag,
  type TransactionListQuery,
} from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useCallback, useEffect } from "react";
import { localAsOf } from "@/as-of";
import { apiRequest } from "@/request";
import { loadAllPages } from "@/settings/load-all-pages";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { TransactionFilterBar } from "@/transactions/filters";
import { transactionPath } from "@/transactions/query";
import { TransactionsTable } from "@/transactions/transactions-table";
import { useEditors } from "@/editors/editor-api";
import { useGroups, useMerchants } from "@/editors/lookups";

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
  const groups = useGroups();
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
    queryKey: ["transactions", search, search.needsReview ? localAsOf() : null],
    queryFn: async () => {
      const result = await apiRequest(transactionPath(search, localAsOf()), transactionListSchema);
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
  const merchants = useMerchants();

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
          <>
            <Button
              type="button"
              variant={search.needsReview ? "default" : "secondary"}
              onClick={() => {
                void navigate({
                  search: { ...search, needsReview: !search.needsReview, page: 1 },
                });
              }}
            >
              Needs review
            </Button>
            <Button type="button" disabled={accounts.data.every((account) => account.archivedAt)} onClick={() => void openEditor("transaction", { id: null })}>
              <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
              New transaction
            </Button>
          </>
        }
      />
      <TransactionFilterBar
        search={search}
        accounts={accounts.data}
        categories={categories.data}
        groups={groups.data ?? []}
        merchants={merchants.data.filter((merchant) => !merchant.archivedAt)}
        tags={tags.data}
        onChange={changeFilters}
      />
      <TransactionsTable
        search={search}
        rows={rows}
        counts={page.reviewCounts}
        currency={bookCurrency}
        accounts={accounts.data}
        categories={categories.data}
        merchants={merchants.data}
        showBalance={showBalance}
        sortState={sortState}
        onSort={sortBy}
      />
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
