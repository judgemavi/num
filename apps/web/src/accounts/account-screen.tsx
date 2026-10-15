import { accountClass } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { accountQuery } from "@/api/accounts";
import { errorCode } from "@/api/client";
import { AccountImports } from "@/accounts/account-imports";
import { MortgagePanel } from "@/accounts/mortgage-panel";
import { AccountTransactions } from "@/accounts/account-transactions";
import { BankBalanceHistory } from "@/accounts/bank-balance-history";
import { accountDetail, kindLabel } from "@/accounts/format";
import { accountLabel } from "@/accounts/label";
import { useEditors } from "@/editors/editor-api";
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

const accountRoute = getRouteApi("/accounts_/$accountId");

/**
 * The page of one account. When the API says that it has no such account, the page shows the way back to the list.
 */
export function AccountScreen() {
  return (
    <Boundary
      loading="Loading account."
      failed={({ error }) =>
        errorCode(error) === undefined ? (
          "The account did not load."
        ) : (
          <div className="grid gap-3">
            <p>That account is not in the book.</p>
            <Link to="/accounts" className="min-h-11 font-semibold text-primary">
              Accounts
            </Link>
          </div>
        )
      }
    >
      <AccountPage />
    </Boundary>
  );
}

function AccountPage() {
  const { accountId } = accountRoute.useParams();
  const { openEditor } = useEditors();

  const { data: row } = useSuspenseQuery(accountQuery(accountId));

  const detail = accountDetail(row);

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
          </>
        }
      />
      <p className="text-sm">
        <Link to="/accounts" className="font-semibold text-primary">
          Accounts
        </Link>
        {detail ? <span className="text-muted-foreground"> · {detail}</span> : null}
      </p>
      <p className="text-sm text-muted-foreground">
        Balance <Amount value={row.balance} owed={accountClass(row.kind) === "liability"} />
      </p>
      <div className="grid items-start gap-5">
        {row.kind === "mortgage" ? <MortgagePanel accountId={row.id} /> : null}
        <AccountTransactions />
        <BankBalanceHistory accountId={row.id} />
        <AccountImports accountId={row.id} />
      </div>
    </>
  );
}
