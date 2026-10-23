import type { ImportViewItem } from "@num/shared";
import { usePrefetchQuery, useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ImportFilterBar } from "@/accounts/import-filters";
import { useImportSearch } from "@/accounts/use-import-search";
import { ImportBalanceProblem } from "@/accounts/import-balance-problem";
import { brokenMatch, formatImportDate, formatImportPeriod, importCountText, importStatusLabel } from "@/accounts/import-format";
import { useUndoImportFlow } from "@/accounts/use-undo-import-flow";
import { activeAccountsQuery } from "@/api/accounts";
import { importViewQuery } from "@/api/imports";
import { Boundary } from "@/components/boundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import { useAccountLabels } from "@/editors/lookups";
import { ListPager } from "@/lists/list-pager";
import { useLastPage } from "@/lists/use-list-search";

const importsRoute = getRouteApi("/accounts_/imports");

function statusVariant(status: ImportViewItem["status"]) {
  if (status === "needs_you") {
    return "attention";
  }
  if (status === "undone" || status === "partly_undone") {
    return "neutral";
  }
  return "positive";
}

export function ImportViewScreen() {
  return (
    <Boundary loading="Loading imports." failed="The imports did not load.">
      <ImportViewPage />
    </Boundary>
  );
}

function ImportViewPage() {
  const list = useImportSearch();
  // The list on the screen stays while the list for a new filter or a new page loads.
  const { search, shown } = list;
  // The filter bar reads the active accounts. That read starts here, together with the read of the list.
  usePrefetchQuery(activeAccountsQuery());
  const { data: page } = useSuspenseQuery(importViewQuery(shown));

  const lastPage = useLastPage(list, page);

  const filtered = Boolean(search.accountId || search.status || search.from || search.to);

  return (
    <>
      <PageHeader
        kicker={page.total === 1 ? "1 import" : `${page.total} imports`}
        title="Imports"
        actions={
          <Button type="button" variant="secondary" asChild>
            <Link to="/accounts">Accounts</Link>
          </Button>
        }
      />
      <ImportFilterBar />
      <ListCard label="Imports">
        {page.items.length === 0 ? (
          <p className="px-5 py-4 text-muted-foreground">{filtered ? "No imports match." : "No imports yet."}</p>
        ) : (
          page.items.map((item) => <ImportListRow key={item.id} item={item} />)
        )}
      </ListCard>
      <ListPager page={search.page} lastPage={lastPage} onPage={list.setPage} />
    </>
  );
}

function ImportListRow({ item }: { item: ImportViewItem }) {
  const navigate = importsRoute.useNavigate();
  const accountName = useAccountLabels().get(item.accountId) ?? item.accountName;
  const undo = useUndoImportFlow();
  const difference = brokenMatch(item.balanceCheck);
  return (
    <ListRow
      label={item.filename}
      onOpen={() => void navigate({ to: "/accounts/imports/$importId", params: { importId: item.id } })}
      menu={
        difference !== null ? (
          <RowMenu label={`Actions for ${item.filename}`}>
            <DropdownMenuItem className="min-h-11" onSelect={() => void undo(item)}>
              Undo this import
            </DropdownMenuItem>
          </RowMenu>
        ) : null
      }
    >
      <div className={listName}>
        <p>{item.filename}</p>
        <small>
          {formatImportDate(item.createdAt)} · {accountName} · {formatImportPeriod(item.periodStart, item.periodEnd)}
        </small>
        <small>{importCountText(item.counts)}</small>
        {difference !== null ? <ImportBalanceProblem difference={difference} /> : null}
      </div>
      <Badge variant={statusVariant(item.status)}>{importStatusLabel(item.status)}</Badge>
    </ListRow>
  );
}
