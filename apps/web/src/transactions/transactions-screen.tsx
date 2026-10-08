import {
  accountListSchema,
  categoryListSchema,
  currencyUpdateSchema,
  merchantListSchema,
  tagListSchema,
  transactionListSchema,
  transactionSchema,
  type Account,
  type Category,
  type Tag,
  type Transaction,
  type TransactionListQuery,
  accountClass,
} from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { apiRequest } from "@/request";
import { loadAllPages } from "@/settings/load-all-pages";
import { Amount } from "@/components/amount";
import { Button } from "@/components/button";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/pill";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TransactionFilters } from "@/transactions/filters";
import { formatDate, statusLabel, transactionError } from "@/transactions/format";
import { hasFilters, transactionPath } from "@/transactions/query";
import { TransactionDialog } from "@/transactions/transaction-dialog";

const transactionsRoute = getRouteApi("/transactions");

type SortColumn = NonNullable<TransactionListQuery["sort"]>;

async function loadNamed<T extends { id: string }>(
  base: string,
  schema: { parse: (data: unknown) => { items: T[]; page: number; pageSize: number; total: number } },
): Promise<T[]> {
  const active = await loadAllPages(base, schema, false);
  const archived = await loadAllPages(base, schema, true);
  return [...active.items, ...archived.items];
}

export function TransactionsScreen() {
  const queryClient = useQueryClient();
  const search = transactionsRoute.useSearch();
  const navigate = transactionsRoute.useNavigate();
  const [text, setText] = useState(search.q ?? "");
  const [seenQuery, setSeenQuery] = useState(search.q);
  const [draft, setDraft] = useState<string | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (search.q !== seenQuery) {
    setSeenQuery(search.q);
    setText(search.q ?? "");
  }

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
      const page = await loadAllPages("/api/merchants", merchantListSchema, false);
      return page.items;
    },
  });

  useEffect(() => {
    const next = text.trim();
    const current = search.q ?? "";
    if (next === current) {
      return;
    }
    const handle = window.setTimeout(() => {
      void navigate({
        search: { ...search, q: next.length === 0 ? undefined : next, page: 1 },
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [navigate, search, text]);

  useEffect(() => {
    if (!transactions.data) {
      return;
    }
    const lastPage = Math.max(1, Math.ceil(transactions.data.total / transactions.data.pageSize));
    if (search.page > lastPage) {
      void navigate({ search: { ...search, page: lastPage }, replace: true });
    }
  }, [navigate, search, transactions.data]);

  function changeFilters(patch: Partial<TransactionListQuery>) {
    void navigate({ search: { ...search, ...patch, page: 1 } });
  }

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

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }
    const result = await apiRequest(`/api/transactions/${deleteTarget.id}`, transactionSchema, { method: "DELETE" });
    if (!result.ok) {
      setActionError(transactionError(result.code));
      return;
    }
    setActionError(null);
    setDeleteTarget(null);
    setDraft(null);
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }

  const pending =
    currency.isPending || transactions.isPending || accounts.isPending || categories.isPending || tags.isPending || merchants.isPending;
  if (pending) {
    return <p className="muted">Loading transactions.</p>;
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
      <div className="stack">
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
          <Button type="button" disabled={accounts.data.every((account) => account.archivedAt)} onClick={() => setDraft("new")}>
            <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
            New transaction
          </Button>
        }
      />
      <Field className="max-w-sm">
        <FieldLabel htmlFor="transaction-search">Search</FieldLabel>
        <Input id="transaction-search" value={text} placeholder="Payee, notes or merchant" onChange={(event) => setText(event.target.value)} />
      </Field>
      <TransactionFilters
        search={search}
        accounts={accounts.data}
        categories={categories.data}
        merchants={merchants.data}
        tags={tags.data}
        onChange={changeFilters}
        onClear={() =>
          changeFilters({
            q: undefined,
            accountId: undefined,
            categoryId: undefined,
            merchantId: undefined,
            tagId: undefined,
            from: undefined,
            to: undefined,
            uncategorized: false,
          })
        }
      />
      {actionError ? (
        <p role="alert" className="alert">
          {actionError}
        </p>
      ) : null}
      <div className="card txn-table">
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
            <TableHead className="sr-only">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={showBalance ? 7 : 6} className="muted">
                {hasFilters(search) ? "No transactions match." : "No transactions yet."}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{formatDate(row.date)}</TableCell>
                <TableCell>{row.accountName}</TableCell>
                <TableCell>
                  <div>{row.payeeRaw}</div>
                  {row.merchantName ? <div className="muted">{row.merchantName}</div> : null}
                </TableCell>
                <TableCell className="text-right">
                  <Amount currency={bookCurrency} minor={row.amount} />
                </TableCell>
                <TableCell>
                  <Pill tone={row.status === "open" ? "neutral" : "positive"}>{statusLabel(row.status)}</Pill>
                </TableCell>
                {showBalance ? (
                  <TableCell className="text-right">
                    {row.runningBalance === null ? null : (
                      <Amount currency={bookCurrency} minor={row.runningBalance} owed={accountClass(row.accountKind) === "liability"} />
                    )}
                  </TableCell>
                ) : null}
                <TableCell className="text-right">
                  <Button type="button" variant="outline" size="sm" onClick={() => setDraft(row.id)}>
                    Edit
                  </Button>
                </TableCell>
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
      {draft ? (
        <TransactionDialog
          draft={draft}
          currency={bookCurrency}
          accounts={accounts.data}
          categories={categories.data}
          tags={tags.data}
          merchants={merchants.data}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            setActionError(null);
            void queryClient.invalidateQueries({ queryKey: ["transactions"] });
          }}
          onDelete={(transaction) => setDeleteTarget(transaction)}
        />
      ) : null}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.transferPeerId
                ? "This also deletes the other side of the transfer."
                : "The transaction leaves the list."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmDelete()}>
              Delete transaction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
