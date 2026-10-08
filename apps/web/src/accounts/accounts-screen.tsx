import { accountClass, accountListSchema, accountSchema, currencyUpdateSchema, type Account } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AccountForm } from "@/accounts/account-form";
import { AccountIcon } from "@/accounts/account-icon";
import { accountCountLabel, accountDetail, accountError, formatBalance, formatMoney, kindLabel } from "@/accounts/format";
import { groupAccounts, groupHue, groupLabel, worthOf } from "@/accounts/groups";
import { loadAllPages } from "@/settings/load-all-pages";
import { apiRequest } from "@/request";
import { Amount } from "@/components/amount";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { IconTile } from "@/components/icon-tile";
import { BalanceScaleIllustration } from "@/components/illustrations";
import { ListCard, ListGroup, ListRow } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/pill";
import { SidePanel } from "@/components/side-panel";
import { SplitBar } from "@/components/split-bar";
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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { hueColor } from "@/components/hue";

const accountsRoute = getRouteApi("/accounts");

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
    queryKey: ["accounts", search.archived],
    queryFn: () => loadAllPages("/api/accounts", accountListSchema, search.archived),
  });

  async function restore(account: Account) {
    const result = await apiRequest(`/api/accounts/${account.id}/restore`, accountSchema, { method: "POST" });
    if (!result.ok) {
      setActionError(accountError(result.code));
      return;
    }
    setActionError(null);
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
  }

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
    return <p className="muted">Loading accounts.</p>;
  }
  if (currency.isError || accounts.isError || !currency.data) {
    return (
      <div className="stack">
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
  const rows = accounts.data?.items ?? [];
  const groups = groupAccounts(rows);
  const worth = worthOf(rows);
  const cards = rows.filter((account) => account.kind === "credit_card");

  return (
    <>
      <PageHeader
        kicker={search.archived ? "Archived" : accountCountLabel(rows.length)}
        title="Accounts"
        actions={
          <>
            <Chip
              pressed={search.archived}
              onClick={() => {
                void navigate({ search: { ...search, archived: !search.archived, page: 1 } });
              }}
            >
              Show archived
            </Chip>
            <Button type="button" onClick={() => setDraft("new")}>
              <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
              Add account
            </Button>
          </>
        }
      />
      <SummaryStrip
        tint="accounts"
        label={search.archived ? "Archived balances" : "Net worth"}
        amount={<Amount currency={bookCurrency} minor={worth.total} owed hero />}
        hint={search.archived ? "These accounts are not in the active list." : "What you have, minus what you owe."}
        facts={
          <>
            <Fact label="What you have">
              <Amount currency={bookCurrency} minor={worth.have} />
            </Fact>
            <Fact label="What you owe">
              <Amount currency={bookCurrency} minor={worth.owe} />
            </Fact>
          </>
        }
        extra={
          <SplitBar
            label={`You have ${formatMoney(bookCurrency, worth.have)} and owe ${formatMoney(bookCurrency, worth.owe)}`}
            segments={[
              { key: "have", label: "What you have", color: "var(--primary)", value: Math.max(0, worth.have), amount: <Amount currency={bookCurrency} minor={worth.have} /> },
              { key: "owe", label: "What you owe", color: hueColor.sky.glyph, value: worth.owe, amount: <Amount currency={bookCurrency} minor={worth.owe} /> },
            ]}
          />
        }
        illustration={<BalanceScaleIllustration />}
      />
      {actionError ? (
        <p role="alert" className="alert">
          {actionError}
        </p>
      ) : null}
      <div className="cols">
        <ListCard label="All accounts">
          {groups.length === 0 ? (
            <p className="empty">{search.archived ? "No archived accounts." : "No accounts yet."}</p>
          ) : (
            groups.map((group) => (
              <div key={group.id}>
                <ListGroup
                  label={groupLabel[group.id]}
                  aside={<Amount currency={bookCurrency} minor={group.total} owed={group.id === "loans"} />}
                />
                {group.items.map((account) => {
                  const detail = accountDetail(account);
                  return (
                    <ListRow key={account.id}>
                      <IconTile hue={groupHue[group.id]}>
                        <AccountIcon kind={account.kind} />
                      </IconTile>
                      <div className="list-name">
                        {account.name}
                        {account.institution ? <small>{account.institution}</small> : null}
                      </div>
                      <div className="list-meta">
                        {account.archivedAt ? <Pill tone="attention">Archived</Pill> : kindLabel(account.kind)}
                      </div>
                      <div className="list-amt">
                        <Amount currency={bookCurrency} minor={account.balance} owed={accountClass(account.kind) === "liability"} />
                        {detail ? <small>{detail}</small> : null}
                      </div>
                      <div className="list-acts">
                        <Button type="button" variant="outline" onClick={() => setDraft(account)}>
                          Edit
                        </Button>
                        {account.archivedAt ? (
                          <Button type="button" variant="outline" onClick={() => void restore(account)}>
                            Restore
                          </Button>
                        ) : (
                          <Button type="button" variant="destructive" onClick={() => setArchiveTarget(account)}>
                            Archive
                          </Button>
                        )}
                      </div>
                    </ListRow>
                  );
                })}
              </div>
            ))
          )}
        </ListCard>
        <div className="stack">
          {cards.length === 0 ? (
            <SidePanel title="Card statements" text="Add a credit card to see what you owe and the due day." />
          ) : (
            <ListCard label="Card statements" title="Card statements">
              {cards.map((account) => (
                <ListRow key={account.id} simple>
                  <div className="list-name">
                    {account.name}
                    <small>
                      {account.dueDay === null ? "No due day" : `Due day ${account.dueDay}`}
                      {account.paymentPolicy === "full" ? " · pays the full statement" : ""}
                    </small>
                  </div>
                  <div className="list-amt">
                    <Amount currency={bookCurrency} minor={account.balance} owed />
                  </div>
                </ListRow>
              ))}
            </ListCard>
          )}
        </div>
      </div>
      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[min(40rem,calc(100%-2rem))] overflow-y-auto">
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
    </>
  );
}
