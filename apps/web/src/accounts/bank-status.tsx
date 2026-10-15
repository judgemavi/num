import { Link } from "@tanstack/react-router";
import type { AccountKind, BankStatus } from "@num/shared";
import { useBankStatus, useBankStatusText } from "@/accounts/bank-status-reads";
import { useSetOpeningBalance } from "@/api/accounts";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/editors/lookups";

/**
 * One line under an account in a list. It shows only an account that does not match its bank: a match is the default
 * and shows nothing. It shows nothing for an account with no bank balance.
 */
export function BankStatusLine({ accountId }: { accountId: string }) {
  const kind = useAccounts().find((account) => account.id === accountId)?.kind;
  const status = useBankStatus(accountId);
  if (!status || !kind || status.difference === 0) {
    return null;
  }
  return <BankStatusText kind={kind} status={status} />;
}

export function BankStatusText({ kind, status }: { kind: AccountKind; status: BankStatus }) {
  const text = useBankStatusText(kind, status);
  return <small className={status.difference === 0 ? "text-pos" : "text-attn"}>{text}</small>;
}

/** The two actions of an account that does not match its bank. */
export function BankStatusActions({ status }: { status: BankStatus }) {
  const opening = useSetOpeningBalance();
  const suggestion = status.openingSuggestion;
  if (status.difference === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2 px-5 pb-3">
      <Button type="button" variant="outline" asChild>
        <Link to="/transactions" search={{ accountId: status.accountId, to: status.date }}>
          Compare transactions
        </Link>
      </Button>
      {suggestion ? (
        <Button
          type="button"
          variant="outline"
          disabled={opening.isPending}
          onClick={() => opening.mutate({ accountId: status.accountId, suggestion })}
        >
          Start this account from the bank&apos;s balance
        </Button>
      ) : null}
    </div>
  );
}
