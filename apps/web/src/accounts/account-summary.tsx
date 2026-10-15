import { accountClass } from "@num/shared";
import { useSuspenseQueries } from "@tanstack/react-query";
import { formatImportDate } from "@/accounts/import-format";
import { accountQuery } from "@/api/accounts";
import { bankBalanceListQuery } from "@/api/bank-balances";
import { accountImportsQuery } from "@/api/imports";
import { Amount } from "@/components/amount";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { useBookCurrency } from "@/editors/lookups";
import { formatMoney } from "@/money";
import { formatDate } from "@/transactions/format";

/**
 * The balance of one account, with the last bank balance and the date of the last import. The
 * hint shows the difference only when the account does not match its bank. The loader of the route starts these reads.
 */
export function AccountSummary({ accountId }: { accountId: string }) {
  const currency = useBookCurrency();
  const [{ data: account }, { data: bank }, { data: imports }] = useSuspenseQueries({
    queries: [accountQuery(accountId), bankBalanceListQuery(accountId), accountImportsQuery(accountId)],
  });
  const owed = accountClass(account.kind) === "liability";
  const status = bank.status;
  let lastImport: string | null = null;
  for (const item of imports) {
    if (!item.undoneAt && (lastImport === null || item.createdAt > lastImport)) {
      lastImport = item.createdAt;
    }
  }
  return (
    <SummaryStrip
      label="Balance"
      amount={<Amount value={account.balance} owed={owed} hero />}
      hint={status && status.difference !== 0 ? `${formatMoney(currency, Math.abs(status.difference))} different from your bank` : undefined}
      facts={
        status || lastImport ? (
          <>
            {status ? (
              <Fact label={`Bank balance on ${formatDate(status.date)}`}>
                <Amount value={status.bankBalance} owed={owed} className="text-lg" />
              </Fact>
            ) : null}
            {lastImport ? (
              <Fact label="Last import">
                <span className="text-lg font-semibold">{formatImportDate(lastImport)}</span>
              </Fact>
            ) : null}
          </>
        ) : undefined
      }
    />
  );
}
