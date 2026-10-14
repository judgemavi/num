import type { ImportViewItem, ImportViewQuery, ImportViewStatus } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { ImportFilterBar } from "@/accounts/import-filters";
import { accountLabelOf, accountLabels } from "@/accounts/label";
import { formatImportDate, formatImportPeriod, importCountText, importStatusLabel } from "@/accounts/import-format";
import { activeAccountsQuery } from "@/api/accounts";
import { importViewQuery } from "@/api/imports";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";

const importsRoute = getRouteApi("/accounts_/imports");

function statusVariant(status: ImportViewStatus): "neutral" | "attention" | "positive" {
  if (status === "needs_you") {
    return "attention";
  }
  if (status === "undone") {
    return "neutral";
  }
  return "positive";
}

export function ImportViewScreen() {
  const search = importsRoute.useSearch();
  const navigate = importsRoute.useNavigate();

  const accounts = useQuery(activeAccountsQuery());
  const imports = useQuery(importViewQuery(search));

  const changeFilters = useCallback(
    (patch: Partial<ImportViewQuery>) => {
      void navigate({ search: { ...search, ...patch, page: 1 } });
    },
    [navigate, search],
  );

  useEffect(() => {
    if (!imports.data) {
      return;
    }
    const lastPage = Math.max(1, Math.ceil(imports.data.total / imports.data.pageSize));
    if (search.page > lastPage) {
      void navigate({ search: { ...search, page: lastPage }, replace: true });
    }
  }, [imports.data, navigate, search]);

  if (imports.isPending || accounts.isPending) {
    return <p className="text-muted-foreground">Loading imports.</p>;
  }
  if (imports.isError || accounts.isError || !imports.data || !accounts.data) {
    return (
      <div className="grid gap-3">
        <p>The imports did not load.</p>
        <Button
          type="button"
          onClick={() => {
            void imports.refetch();
            void accounts.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const page = imports.data;
  const accountNames = accountLabels(accounts.data.items);
  const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize));
  const filtered = Boolean(search.accountId || search.status || search.from || search.to);

  return (
    <>
      <PageHeader
        kicker={page.total === 1 ? "1 import" : `${page.total} imports`}
        title="Imports"
        actions={
          <Button type="button" variant="secondary" asChild>
            <Link to="/accounts" search={{ page: 1, pageSize: 50, archived: false }}>
              Accounts
            </Link>
          </Button>
        }
      />
      <ImportFilterBar search={search} accounts={accounts.data.items} onChange={changeFilters} />
      <ListCard label="Imports">
        {page.items.length === 0 ? (
          <p className="px-5 py-4 text-muted-foreground">{filtered ? "No imports match." : "No imports yet."}</p>
        ) : (
          page.items.map((item) => (
            <ImportListRow
              key={item.id}
              item={item}
              accountName={accountLabelOf(accountNames, item.accountId, item.accountName)}
            />
          ))
        )}
      </ListCard>
      {page.total > page.pageSize ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={search.page <= 1}
            onClick={() => {
              void navigate({ search: { ...search, page: search.page - 1 } });
            }}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={search.page >= lastPage}
            onClick={() => {
              void navigate({ search: { ...search, page: search.page + 1 } });
            }}
          >
            Next
          </Button>
        </div>
      ) : null}
    </>
  );
}

function ImportListRow({ item, accountName }: { item: ImportViewItem; accountName: string }) {
  const navigate = importsRoute.useNavigate();
  return (
    <ListRow onOpen={() => void navigate({ to: "/accounts/imports/$importId", params: { importId: item.id } })}>
      <div className={listName}>
        <p>{item.filename ?? "Statement"}</p>
        <small>
          {formatImportDate(item.createdAt)} · {accountName} · {formatImportPeriod(item.periodStart, item.periodEnd)}
        </small>
        <small>{importCountText(item.counts)}</small>
      </div>
      <Badge variant={statusVariant(item.status)}>{importStatusLabel(item.status)}</Badge>
    </ListRow>
  );
}
