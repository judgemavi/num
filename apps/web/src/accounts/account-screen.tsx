import { accountClass, accountSchema, currencyUpdateSchema } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AccountForm } from "@/accounts/account-form";
import { AccountImports } from "@/accounts/account-imports";
import { AccountTransactions } from "@/accounts/account-transactions";
import { CheckpointHistory } from "@/accounts/checkpoint-history";
import { accountDetail, kindLabel } from "@/accounts/format";
import { ReconcileDialog } from "@/accounts/reconcile-dialog";
import { Amount } from "@/components/amount";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { apiRequest } from "@/request";

const accountRoute = getRouteApi("/accounts_/$accountId");

export function AccountScreen() {
  const queryClient = useQueryClient();
  const { accountId } = accountRoute.useParams();
  const search = accountRoute.useSearch();
  const navigate = accountRoute.useNavigate();
  const [editing, setEditing] = useState(false);

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

  const account = useQuery({
    queryKey: ["account", accountId],
    queryFn: async () => {
      const result = await apiRequest(`/api/accounts/${accountId}`, accountSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  if (currency.isPending || account.isPending) {
    return <p className="text-muted-foreground">Loading account.</p>;
  }
  if (currency.isError || !currency.data) {
    return <p>The account did not load.</p>;
  }
  if (account.isError || !account.data) {
    return (
      <div className="grid gap-3">
        <p>That account is not in the book.</p>
        <Link to="/accounts" search={{ page: 1, pageSize: 50, archived: false }} className="min-h-11 font-semibold text-primary">
          Accounts
        </Link>
      </div>
    );
  }

  const row = account.data;
  const detail = accountDetail(row);
  const bookCurrency = currency.data;

  return (
    <>
      <PageHeader
        kicker={kindLabel(row.kind)}
        title={row.name}
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              type="button"
              onClick={() => {
                void navigate({ search: { ...search, reconcile: true } });
              }}
            >
              Reconcile
            </Button>
          </>
        }
      />
      <p className="text-sm">
        <Link to="/accounts" search={{ page: 1, pageSize: 50, archived: false }} className="font-semibold text-primary">
          Accounts
        </Link>
        {row.institution ? <span className="text-muted-foreground"> · {row.institution}</span> : null}
        {detail ? <span className="text-muted-foreground"> · {detail}</span> : null}
      </p>
      <p className="text-sm text-muted-foreground">
        Balance <Amount currency={bookCurrency} minor={row.balance} owed={accountClass(row.kind) === "liability"} />
      </p>
      <div className="grid items-start gap-5">
        <AccountTransactions
          accountId={row.id}
          currency={bookCurrency}
          page={search.page}
          onPage={(page) => {
            void navigate({ search: { ...search, page } });
          }}
        />
        <CheckpointHistory accountId={row.id} currency={bookCurrency} owed={accountClass(row.kind) === "liability"} />
        <AccountImports accountId={row.id} accountName={row.name} currency={bookCurrency} />
      </div>
      <Dialog open={search.reconcile} onOpenChange={(open) => !open && void navigate({ search: { ...search, reconcile: false } })}>
        <DialogContent className="max-h-[min(40rem,calc(100%-2rem))] overflow-y-auto">
          {search.reconcile ? (
            <ReconcileDialog
              accountId={row.id}
              currency={bookCurrency}
              kind={row.kind}
              onClose={() => {
                void navigate({ search: { ...search, reconcile: false } });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={editing} onOpenChange={(open) => !open && setEditing(false)}>
        <DialogContent className="max-h-[min(40rem,calc(100%-2rem))] overflow-y-auto">
          {editing ? (
            <AccountForm
              currency={bookCurrency}
              account={row}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                void queryClient.invalidateQueries({ queryKey: ["account", accountId] });
                void queryClient.invalidateQueries({ queryKey: ["accounts"] });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
