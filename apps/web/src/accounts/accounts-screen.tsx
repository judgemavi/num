import {
  accountListSchema,
  accountSchema,
  currencyUpdateSchema,
  type Account,
  type AccountListQuery,
} from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AccountForm } from "@/accounts/account-form";
import { accountError, formatBalance, kindLabel } from "@/accounts/format";
import { apiRequest } from "@/request";
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const accountsRoute = getRouteApi("/accounts");

function accountPath(search: AccountListQuery): string {
  const params = new URLSearchParams();
  if (search.page !== 1) {
    params.set("page", String(search.page));
  }
  if (search.pageSize !== 50) {
    params.set("pageSize", String(search.pageSize));
  }
  if (search.sort) {
    params.set("sort", search.sort);
  }
  if (search.dir) {
    params.set("dir", search.dir);
  }
  if (search.archived) {
    params.set("archived", "true");
  }
  const text = params.toString();
  return text.length === 0 ? "/api/accounts" : `/api/accounts?${text}`;
}

export function AccountsScreen() {
  const queryClient = useQueryClient();
  const search = accountsRoute.useSearch();
  const navigate = accountsRoute.useNavigate();
  const [draft, setDraft] = useState<Account | "new" | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Account | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const accounts = useQuery({
    queryKey: ["accounts", search],
    queryFn: async () => {
      const result = await apiRequest(accountPath(search), accountListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  useEffect(() => {
    if (!accounts.data) {
      return;
    }
    const lastPage = Math.max(1, Math.ceil(accounts.data.total / accounts.data.pageSize));
    if (search.page > lastPage) {
      void navigate({ search: { ...search, page: lastPage }, replace: true });
    }
  }, [accounts.data, navigate, search]);

  async function confirmArchive() {
    if (!archiveTarget) {
      return;
    }
    const result = await apiRequest(`/api/accounts/${archiveTarget.id}/archive`, accountSchema, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    if (!result.ok) {
      setActionError(accountError(result.code));
      return;
    }
    setActionError(null);
    setArchiveTarget(null);
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
  }

  if (currency.isPending || accounts.isPending) {
    return <p className="text-muted-foreground">Loading accounts.</p>;
  }
  if (currency.isError || accounts.isError || !currency.data) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p>The accounts did not load.</p>
        <Button
          type="button"
          onClick={() => {
            void currency.refetch();
            void accounts.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const bookCurrency = currency.data;
  const page = accounts.data;
  const rows = page?.items ?? [];
  const lastPage = page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Field orientation="horizontal" className="w-auto">
          <Switch
            id="show-archived"
            checked={search.archived}
            onCheckedChange={(checked) => {
              void navigate({
                search: { ...search, archived: checked === true, page: 1 },
              });
            }}
          />
          <FieldLabel htmlFor="show-archived">Show archived</FieldLabel>
        </Field>
        <Button type="button" onClick={() => setDraft("new")}>
          New account
        </Button>
      </div>
      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead>State</TableHead>
            <TableHead className="sr-only">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                {search.archived ? "No archived accounts." : "No accounts yet."}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((account) => (
              <TableRow key={account.id}>
                <TableCell>{account.name}</TableCell>
                <TableCell>{kindLabel(account.kind)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatBalance(bookCurrency, account.kind, account.balance)}
                </TableCell>
                <TableCell>{account.archivedAt ? "Archived" : "Active"}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="outline" size="sm" onClick={() => setDraft(account)}>
                    Edit
                  </Button>
                  {account.archivedAt ? null : (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="ml-2"
                      onClick={() => setArchiveTarget(account)}
                    >
                      Archive
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {page && page.total > page.pageSize ? (
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
      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[min(40rem,calc(100%-2rem))] overflow-y-auto sm:max-w-md">
          {draft !== null ? (
            <AccountForm
              key={draft === "new" ? "new" : draft.id}
              currency={bookCurrency}
              account={draft === "new" ? null : draft}
              onClose={() => setDraft(null)}
              onSaved={() => {
                setDraft(null);
                setActionError(null);
                void queryClient.invalidateQueries({ queryKey: ["accounts"] });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog open={archiveTarget !== null} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this account?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget && archiveTarget.balance !== 0
                ? `${archiveTarget.name} has a balance of ${formatBalance(bookCurrency, archiveTarget.kind, archiveTarget.balance)}. Archive it only if you mean to.`
                : `Archive ${archiveTarget?.name ?? "this account"}. It leaves the active list.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmArchive()}>
              Archive account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
