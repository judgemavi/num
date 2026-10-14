import { accountClass } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { accountQuery } from "@/api/accounts";
import { AccountImports } from "@/accounts/account-imports";
import { MortgagePanel } from "@/accounts/mortgage-panel";
import { AccountTransactions } from "@/accounts/account-transactions";
import { CheckpointHistory } from "@/accounts/checkpoint-history";
import { accountDetail, kindLabel } from "@/accounts/format";
import { accountLabel } from "@/accounts/label";
import { useEditors } from "@/editors/editor-api";
import { useBookCurrency } from "@/editors/lookups";
import { Amount } from "@/components/amount";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

const accountRoute = getRouteApi("/accounts_/$accountId");

export function AccountScreen() {
  const { accountId } = accountRoute.useParams();
  const search = accountRoute.useSearch();
  const navigate = accountRoute.useNavigate();
  const { openEditor, dismissKind } = useEditors();

  const currency = useBookCurrency();
  const account = useQuery(accountQuery(accountId));

  useEffect(() => {
    if (!search.reconcile) {
      dismissKind("reconcile");
      return;
    }
    void openEditor("reconcile", { accountId }).then(() => {
      if (new URLSearchParams(window.location.search).get("reconcile") === "true") {
        void navigate({ search: { ...search, reconcile: false } });
      }
    });
  }, [search.reconcile, accountId, dismissKind, openEditor, navigate, search]);

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
        title={accountLabel(row)}
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => void openEditor("account", { id: accountId })}>
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
        {detail ? <span className="text-muted-foreground"> · {detail}</span> : null}
      </p>
      <p className="text-sm text-muted-foreground">
        Balance <Amount currency={bookCurrency} minor={row.balance} owed={accountClass(row.kind) === "liability"} />
      </p>
      <div className="grid items-start gap-5">
        {row.kind === "mortgage" ? <MortgagePanel accountId={row.id} currency={bookCurrency} /> : null}
        <AccountTransactions
          accountId={row.id}
          currency={bookCurrency}
          showBalance={row.kind !== "investment" && row.kind !== "property"}
          page={search.page}
          onPage={(page) => {
            void navigate({ search: { ...search, page } });
          }}
        />
        <CheckpointHistory accountId={row.id} currency={bookCurrency} owed={accountClass(row.kind) === "liability"} />
        <AccountImports accountId={row.id} accountName={accountLabel(row)} currency={bookCurrency} />
      </div>
    </>
  );
}
