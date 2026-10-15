import { accountClass, netWorthOf } from "@num/shared";
import { usePrefetchQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Plus, Upload } from "lucide-react";
import { useEditors } from "@/editors/editor-api";
import { useBookCurrency } from "@/editors/lookups";
import { AccountIcon } from "@/accounts/account-icon";
import { accountCountLabel, formatBalance, kindLabel, owedToYou, owedToYouWarning } from "@/accounts/format";
import { accountLabel } from "@/accounts/label";
import { groupAccounts, groupHue, groupLabel } from "@/accounts/groups";
import { accountListQuery, useArchiveAccount } from "@/api/accounts";
import { BankStatusLine } from "@/accounts/bank-status";
import { bankStatusesQuery } from "@/api/bank-balances";
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { AccountFilterBar } from "@/accounts/filters";
import { useAccountSearch } from "@/accounts/use-account-search";
import { ArchiveMenuItem } from "@/components/archive-menu-item";
import { Button } from "@/components/ui/button";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { IconTile } from "@/components/icon-tile";
import { BalanceScaleIllustration } from "@/components/illustrations";
import { ListCard, ListGroup, ListRow, listAmt, listMid, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RowMenu } from "@/components/row-menu";
import { Badge } from "@/components/ui/badge";

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
  usePrefetchQuery(bankStatusesQuery());
  const archive = useArchiveAccount();

  const rows = accounts.items;
  const groups = groupAccounts(rows);
  const worth = netWorthOf(rows);

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
              New
            </Button>
          </>
        }
      />
      <AccountFilterBar />
      <SummaryStrip
        tint="accounts"
        label={search.archived ? "Archived balances" : "Net worth"}
        amount={<Amount value={worth.net} owed hero />}
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
        illustration={<BalanceScaleIllustration />}
      />
      <div className="grid items-start gap-5">
        <ListCard label="All accounts">
          {groups.length === 0 ? (
            <p className="px-5 py-5 text-muted-foreground">{search.archived ? "No archived accounts." : "No accounts yet."}</p>
          ) : (
            groups.map((group) => (
              <div key={group.id}>
                <ListGroup
                  label={groupLabel[group.id]}
                  aside={<Amount value={group.total} owed={group.id === "liabilities"} />}
                />
                {group.items.map((account) => (
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
                      <div className={listName}>
                        {accountLabel(account)}
                        {owedToYou(account) ? <small className="text-attn">{owedToYouWarning}</small> : null}
                        <BankStatusLine accountId={account.id} />
                      </div>
                      <div className={`${listMid} text-[13px] text-muted-foreground max-md:hidden`}>
                        {account.archivedAt ? <Badge variant="attention">Archived</Badge> : kindLabel(account.kind)}
                      </div>
                      <div className={listAmt}>
                        <Amount value={account.balance} owed={accountClass(account.kind) === "liability"} />
                      </div>
                      <RowMenu label={`Actions for ${accountLabel(account)}`}>
                        <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("account", { id: account.id })}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("import", { accountId: account.id })}>
                          Import a statement
                        </DropdownMenuItem>
                        <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("bankBalance", { accountId: account.id, id: null })}>
                          Add bank balance
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
                            confirmLabel: restore ? "Restore" : "Archive",
                          })}
                          onConfirm={(restore) => archive.mutate({ id: account.id, restore })}
                        />
                      </RowMenu>
                    </ListRow>
                ))}
              </div>
            ))
          )}
        </ListCard>
      </div>
    </>
  );
}
