import { accountClass, netWorthOf } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Plus, Upload } from "lucide-react";
import { useEditors } from "@/editors/editor-api";
import { useBookCurrency } from "@/editors/lookups";
import { AccountIcon } from "@/accounts/account-icon";
import { accountCountLabel, accountDetail, accountError, formatBalance, formatMoney, kindLabel } from "@/accounts/format";
import { accountLabel } from "@/accounts/label";
import { groupAccounts, groupHue, groupLabel } from "@/accounts/groups";
import { accountListQuery, useArchiveAccount } from "@/api/accounts";
import { errorCode } from "@/api/client";
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { AccountFilterBar } from "@/accounts/filters";
import { useAccountSearch } from "@/accounts/use-account-search";
import { ArchiveMenuItem } from "@/components/archive-menu-item";
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

export function AccountsScreen() {
  return (
    <Boundary loading="Loading accounts." failed="The accounts did not load.">
      <AccountsPage />
    </Boundary>
  );
}

function AccountsPage() {
  const { search, shown } = useAccountSearch();
  const openAccount = useNavigate();
  const { openEditor } = useEditors();
  const bookCurrency = useBookCurrency();
  // The list on the screen stays while the list for a new filter or a new sort order loads.
  const { data: accounts } = useSuspenseQuery(accountListQuery(shown));
  const archive = useArchiveAccount();

  const rows = accounts.items;
  const groups = groupAccounts(rows);
  const worth = netWorthOf(rows);
  const cards = rows.filter((account) => account.kind === "credit_card");

  return (
    <>
      <PageHeader
        kicker={search.archived ? "Archived" : accountCountLabel(rows.length)}
        title="Accounts"
        actions={
          <>
            <Button type="button" variant="secondary" asChild>
              <Link to="/accounts/imports">
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
      <AccountFilterBar />
      <SummaryStrip
        tint="accounts"
        label={search.archived ? "Archived balances" : "Net worth"}
        amount={<Amount value={worth.net} owed hero />}
        hint={search.archived ? "These accounts are not in the active list." : "What you have, minus what you owe."}
        facts={
          <>
            <Fact label="What you have">
              <Amount value={worth.have} className="text-lg" />
            </Fact>
            <Fact label="What you owe">
              <Amount value={worth.owe} className="text-lg" />
            </Fact>
          </>
        }
        extra={
          <SplitBar
            label={`You have ${formatMoney(bookCurrency, worth.have)} and owe ${formatMoney(bookCurrency, worth.owe)}`}
            segments={[
              { key: "have", label: "What you have", color: "var(--primary)", value: Math.max(0, worth.have), amount: <Amount value={worth.have} /> },
              { key: "owe", label: "What you owe", color: hueColor.sky.glyph, value: worth.owe, amount: <Amount value={worth.owe} /> },
            ]}
          />
        }
        illustration={<BalanceScaleIllustration />}
      />
      {archive.error ? (
        <p role="alert" className="text-sm text-attn">
          {accountError(errorCode(archive.error))}
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
                  aside={<Amount value={group.total} owed={group.id === "loans"} />}
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
                        <Amount value={account.balance} owed={accountClass(account.kind) === "liability"} />
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
                              search: { reconcile: true },
                            });
                          }}
                        >
                          Reconcile
                        </DropdownMenuItem>
                        <ArchiveMenuItem
                          archived={account.archivedAt !== null}
                          question={(restore) => ({
                            title: restore ? "Restore this account?" : "Archive this account?",
                            description: restore
                              ? `Restore ${accountLabel(account)}. It returns to the active list.`
                              : account.balance !== 0
                                ? `${accountLabel(account)} has a balance of ${formatBalance(bookCurrency, account.kind, account.balance)}. Archive it only if you mean to.`
                                : `Archive ${accountLabel(account)}. It leaves the active list.`,
                            confirmLabel: restore ? "Restore account" : "Archive account",
                          })}
                          onConfirm={(restore) => archive.mutate({ id: account.id, restore })}
                        />
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
                    <Amount value={account.balance} owed />
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
