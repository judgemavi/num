import {
  accountListSchema,
  accountSchema,
  currencyUpdateSchema,
  type Account,
} from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

async function loadAccounts(): Promise<Account[]> {
  const items: Account[] = [];
  let page = 1;
  let total = 0;
  do {
    const result = await apiRequest(`/api/accounts?page=${page}&pageSize=200`, accountListSchema);
    if (!result.ok) {
      throw new Error(result.code);
    }
    items.push(...result.data.items);
    total = result.data.total;
    if (result.data.items.length === 0) {
      break;
    }
    page += 1;
  } while (items.length < total);
  return items;
}

export function AccountsScreen() {
  const queryClient = useQueryClient();
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
    queryKey: ["accounts"],
    queryFn: loadAccounts,
  });

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
  const rows = accounts.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
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
                No accounts yet.
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
                : `Archive ${archiveTarget?.name ?? "this account"}. It stays in the list.`}
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
