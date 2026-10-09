import { accountClass, accountListSchema, accountSchema, currencyUpdateSchema, type Account } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Upload } from "lucide-react";
import { useState } from "react";
import { useEditors } from "@/editors/editor-api";
import { AccountIcon } from "@/accounts/account-icon";
import { accountCountLabel, accountDetail, accountError, formatBalance, formatMoney, kindLabel } from "@/accounts/format";
import { accountLabel } from "@/accounts/label";
import { groupAccounts, groupHue, groupLabel, worthOf } from "@/accounts/groups";
import { loadAllPages } from "@/settings/load-all-pages";
import { apiRequest } from "@/request";
import { Amount } from "@/components/amount";
import { AccountFilterBar } from "@/accounts/filters";
import { Button } from "@/components/ui/button";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { IconTile } from "@/components/icon-tile";
import { BalanceScaleIllustration } from "@/components/illustrations";
import { ListCard, ListGroup, ListRow } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RowMenu } from "@/components/row-menu";
import { Badge } from "@/components/ui/badge";
import { SidePanel } from "@/components/side-panel";
import { SplitBar } from "@/components/split-bar";
import { hueColor } from "@/components/hue";

const accountsRoute = getRouteApi("/accounts");

export function AccountsScreen() {
  const queryClient = useQueryClient();
  const search = accountsRoute.useSearch();
  const navigate = accountsRoute.useNavigate();
  const openAccount = useNavigate();
  const { openEditor, confirm } = useEditors();
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
    queryFn: () =>
      loadAllPages("/api/accounts", accountListSchema, {
        archived: search.archived,
        sort: search.sort,
        dir: search.dir,
      }),
  });

  async function archiveAccount(account: Account) {
    const restoring = account.archivedAt !== null;
    const result = await apiRequest(
      `/api/accounts/${account.id}/${restoring ? "restore" : "archive"}`,
      accountSchema,
      restoring
        ? { method: "POST" }
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ confirm: true }),
          },
    );
    if (!result.ok) {
      setActionError(accountError(result.code));
      return;
    }
    setActionError(null);
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
  }

  if (currency.isPending || accounts.isPending) {
    return <p className="text-muted-foreground">Loading accounts.</p>;
  }
  if (currency.isError || accounts.isError || !currency.data) {
    return (
      <div className="grid content-start gap-5">
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
            <Button type="button" variant="secondary" asChild>
              <Link to="/accounts/imports" search={{ page: 1, pageSize: 50 }}>
                Imports
              </Link>
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void openEditor("import", { accountId: null })}
            >
              <Upload size={20} strokeWidth={1.8} aria-hidden="true" />
              Import a statement
            </Button>
            <Button type="button" onClick={() => void openEditor("account", { id: null })}>
              <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
              Add account
            </Button>
          </>
        }
      />
      <AccountFilterBar
        search={search}
        onChange={(patch) => {
          void navigate({ search: { ...search, ...patch, page: 1 } });
        }}
      />
      <SummaryStrip
        tint="accounts"
        label={search.archived ? "Archived balances" : "Net worth"}
        amount={<Amount currency={bookCurrency} minor={worth.total} owed hero />}
        hint={search.archived ? "These accounts are not in the active list." : "What you have, minus what you owe."}
        facts={
          <>
            <Fact label="What you have">
              <Amount currency={bookCurrency} minor={worth.have} className="text-lg" />
            </Fact>
            <Fact label="What you owe">
              <Amount currency={bookCurrency} minor={worth.owe} className="text-lg" />
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
        <p role="alert" className="text-sm text-attn">
          {actionError}
        </p>
      ) : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <ListCard label="All accounts">
          {groups.length === 0 ? (
            <p className="px-5 py-5 text-muted-foreground">{search.archived ? "No archived accounts." : "No accounts yet."}</p>
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
                    <ListRow
                      key={account.id}
                      onOpen={() => {
                        void openAccount({
                          to: "/accounts/$accountId",
                          params: { accountId: account.id },
                          search: { page: 1, reconcile: false },
                        });
                      }}
                    >
                      <IconTile hue={groupHue[group.id]}>
                        <AccountIcon kind={account.kind} />
                      </IconTile>
                      <div className="list-name min-w-0 flex-1 font-semibold [&_small]:block [&_small]:text-[13px] [&_small]:font-normal [&_small]:text-muted-foreground">
                        {accountLabel(account)}
                      </div>
                      <div className="hidden w-40 shrink-0 text-[13px] text-muted-foreground md:block">
                        {account.archivedAt ? <Badge variant="attention">Archived</Badge> : kindLabel(account.kind)}
                      </div>
                      <div className="ml-auto text-right text-base max-md:ml-0 max-md:basis-full [&_small]:block [&_small]:text-[13px] [&_small]:font-normal [&_small]:text-muted-foreground">
                        <Amount currency={bookCurrency} minor={account.balance} owed={accountClass(account.kind) === "liability"} />
                        {detail ? <small>{detail}</small> : null}
                      </div>
                      <RowMenu label={`Actions for ${accountLabel(account)}`}>
                        <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("account", { id: account.id })}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("import", { accountId: account.id })}>
                          Import a statement
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="min-h-11"
                          onSelect={() => {
                            void openAccount({
                              to: "/accounts/$accountId",
                              params: { accountId: account.id },
                              search: { page: 1, reconcile: true },
                            });
                          }}
                        >
                          Reconcile
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="min-h-11"
                          onSelect={() => {
                            const restore = account.archivedAt !== null;
                            void confirm({
                              title: restore ? "Restore this account?" : "Archive this account?",
                              description: restore
                                ? `Restore ${accountLabel(account)}. It returns to the active list.`
                                : account.balance !== 0
                                  ? `${accountLabel(account)} has a balance of ${formatBalance(bookCurrency, account.kind, account.balance)}. Archive it only if you mean to.`
                                  : `Archive ${accountLabel(account)}. It leaves the active list.`,
                              confirmLabel: restore ? "Restore account" : "Archive account",
                            }).then((ok) => {
                              if (ok) {
                                void archiveAccount(account);
                              }
                            });
                          }}
                        >
                          {account.archivedAt ? "Restore" : "Archive"}
                        </DropdownMenuItem>
                      </RowMenu>
                    </ListRow>
                  );
                })}
              </div>
            ))
          )}
        </ListCard>
        <div className="grid content-start gap-5">
          {cards.length === 0 ? (
            <SidePanel title="Card statements" text="Add a credit card to see what you owe and the due day." />
          ) : (
            <ListCard label="Card statements" title="Card statements">
              {cards.map((account) => (
                <ListRow key={account.id} simple>
                  <div className="list-name min-w-0 flex-1 font-semibold [&_small]:block [&_small]:text-[13px] [&_small]:font-normal [&_small]:text-muted-foreground">
                    {accountLabel(account)}
                    <small>{account.paymentPolicy === "full" ? "Pays the full statement" : ""}</small>
                  </div>
                  <div className="ml-auto text-right text-base max-md:ml-0 max-md:basis-full [&_small]:block [&_small]:text-[13px] [&_small]:font-normal [&_small]:text-muted-foreground">
                    <Amount currency={bookCurrency} minor={account.balance} owed />
                  </div>
                </ListRow>
              ))}
            </ListCard>
          )}
        </div>
      </div>
    </>
  );
}
