import {
  accountListSchema,
  categoryListSchema,
  merchantListSchema,
  merchantSchema,
  ruleListSchema,
  ruleSchema,
  type Merchant,
  type MerchantListQuery,
  type Rule,
} from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { FilterBar } from "@/components/filter-bar";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import { sortChoice } from "@/components/sort-choice";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/request";
import { merchantError, ruleError } from "@/settings/format";
import { loadAllPages } from "@/settings/load-all-pages";
import { MerchantForm } from "@/settings/merchant-form";
import { MergeDialog } from "@/settings/merge-dialog";
import { RuleApplyDialog } from "@/settings/rule-apply-dialog";
import { RuleForm } from "@/settings/rule-form";
import { SettingsBack } from "@/settings/settings-nav";

const merchantsRoute = getRouteApi("/settings/merchants");

const sortOptions = [
  { value: "name:asc", label: "Name, A to Z" },
  { value: "name:desc", label: "Name, Z to A" },
];

const matchLabels = { exact: "Exact", prefix: "Starts with", contains: "Contains" };

function applySort(value: string): Partial<MerchantListQuery> {
  if (value === "name:asc") {
    return { sort: undefined, dir: undefined };
  }
  return { sort: "name", dir: "desc" };
}

export function MerchantsPage() {
  const queryClient = useQueryClient();
  const search = merchantsRoute.useSearch();
  const navigate = merchantsRoute.useNavigate();
  const [archived, setArchived] = useState(search.archived);
  const [merchantDraft, setMerchantDraft] = useState<Merchant | "new" | null>(null);
  const [ruleDraft, setRuleDraft] = useState<Rule | "new" | null>(null);
  const [pending, setPending] = useState<{ kind: "merchant" | "rule"; row: Merchant | Rule } | null>(null);
  const [mergeSource, setMergeSource] = useState<Merchant | null>(null);
  const [applyTarget, setApplyTarget] = useState<Rule | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const merchants = useQuery({
    queryKey: ["merchants", search],
    queryFn: () => loadAllPages("/api/merchants", merchantListSchema, { archived: search.archived, sort: search.sort, dir: search.dir }),
  });
  const activeMerchants = useQuery({
    queryKey: ["merchants", "active-options"],
    queryFn: () => loadAllPages("/api/merchants", merchantListSchema, { archived: false }),
  });
  const rules = useQuery({
    queryKey: ["rules", search.archived],
    queryFn: () => loadAllPages("/api/rules", ruleListSchema, { archived: search.archived }),
  });
  const categories = useQuery({
    queryKey: ["categories", "merchant-rules"],
    queryFn: () => loadAllPages("/api/categories", categoryListSchema, { archived: false }),
  });
  const accounts = useQuery({
    queryKey: ["accounts", "merchant-rules"],
    queryFn: () => loadAllPages("/api/accounts", accountListSchema, { archived: false }),
  });

  function changeFilters(patch: Partial<MerchantListQuery>) {
    void navigate({ search: { ...search, ...patch, page: 1 } });
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["merchants"] });
    await queryClient.invalidateQueries({ queryKey: ["rules"] });
    await queryClient.invalidateQueries({ queryKey: ["suggestion"] });
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }

  async function confirmPending() {
    if (!pending) {
      return;
    }
    const path = pending.row.archivedAt ? "restore" : "archive";
    const result =
      pending.kind === "merchant"
        ? await apiRequest(`/api/merchants/${pending.row.id}/${path}`, merchantSchema, { method: "POST" })
        : await apiRequest(`/api/rules/${pending.row.id}/${path}`, ruleSchema, { method: "POST" });
    if (!result.ok) {
      setActionError(pending.kind === "merchant" ? merchantError(result.code) : ruleError(result.code));
      return;
    }
    setActionError(null);
    setPending(null);
    await refresh();
  }

  if (merchants.isPending || rules.isPending || categories.isPending || accounts.isPending || activeMerchants.isPending) {
    return <p className="text-muted-foreground">Loading merchants and rules.</p>;
  }
  if (merchants.isError || rules.isError || categories.isError || accounts.isError || activeMerchants.isError) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p>Merchants and rules did not load.</p>
        <Button
          type="button"
          onClick={() => {
            void merchants.refetch();
            void rules.refetch();
            void categories.refetch();
            void accounts.refetch();
            void activeMerchants.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const categoryName = new Map(categories.data.items.map((category) => [category.id, category.name]));
  const accountName = new Map(accounts.data.items.map((account) => [account.id, account.name]));
  const merchantRows = merchants.data.items;
  const ruleRows = rules.data.items;

  return (
    <>
      <SettingsBack />
      <PageHeader
        kicker="Settings"
        title="Merchants and rules"
        actions={
          <Button type="button" onClick={() => setMerchantDraft("new")}>
            New merchant
          </Button>
        }
      />
      <FilterBar
        activeCount={search.archived ? 1 : 0}
        badges={search.archived ? [{ key: "archived", label: "Archived", onRemove: () => changeFilters({ archived: false }) }] : []}
        onOpenChange={(open) => {
          if (open) {
            setArchived(search.archived);
          }
        }}
        onApply={() => changeFilters({ archived })}
        onClear={() => setArchived(false)}
        onClearAll={() => changeFilters({ archived: false })}
        sort={{
          id: "merchant-sort",
          label: "Sort merchants",
          value: sortChoice(search.sort, search.dir, "name", "asc"),
          options: sortOptions,
          onChange: (value) => changeFilters(applySort(value)),
        }}
        fields={
          <Field orientation="horizontal">
            <Switch id="filter-archived-merchants" checked={archived} onCheckedChange={setArchived} />
            <FieldLabel htmlFor="filter-archived-merchants">Show archived</FieldLabel>
          </Field>
        }
      />
      {actionError ? (
        <p role="alert" className="text-sm text-attn">
          {actionError}
        </p>
      ) : null}
      <MerchantList
        rows={merchantRows}
        archived={search.archived}
        categoryName={categoryName}
        onOpen={setMerchantDraft}
        onArchive={(row) => setPending({ kind: "merchant", row })}
        onMerge={setMergeSource}
      />
      <RuleList
        rows={ruleRows}
        archived={search.archived}
        accountName={accountName}
        onOpen={setRuleDraft}
        onArchive={(row) => setPending({ kind: "rule", row })}
        onApply={setApplyTarget}
        onCreate={() => setRuleDraft("new")}
      />
      <Dialog open={merchantDraft !== null} onOpenChange={(open) => !open && setMerchantDraft(null)}>
        <DialogContent>
          {merchantDraft ? (
            <MerchantForm
              key={merchantDraft === "new" ? "new-merchant" : merchantDraft.id}
              merchant={merchantDraft === "new" ? null : merchantDraft}
              categories={categories.data.items}
              onClose={() => setMerchantDraft(null)}
              onSaved={() => {
                setMerchantDraft(null);
                void refresh();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={ruleDraft !== null} onOpenChange={(open) => !open && setRuleDraft(null)}>
        <DialogContent className="max-h-[min(40rem,calc(100%-2rem))] overflow-y-auto">
          {ruleDraft ? (
            <RuleForm
              key={ruleDraft === "new" ? "new-rule" : ruleDraft.id}
              rule={ruleDraft === "new" ? null : ruleDraft}
              accounts={accounts.data.items}
              categories={categories.data.items}
              merchants={activeMerchants.data.items}
              onClose={() => setRuleDraft(null)}
              onSaved={() => {
                setRuleDraft(null);
                void refresh();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={mergeSource !== null} onOpenChange={(open) => !open && setMergeSource(null)}>
        <DialogContent>
          {mergeSource ? (
            <MergeDialog
              source={mergeSource}
              merchants={activeMerchants.data.items}
              onClose={() => setMergeSource(null)}
              onMerged={() => {
                setMergeSource(null);
                void refresh();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={applyTarget !== null} onOpenChange={(open) => !open && setApplyTarget(null)}>
        <DialogContent>
          {applyTarget ? (
            <RuleApplyDialog
              rule={applyTarget}
              onClose={() => setApplyTarget(null)}
              onApplied={() => {
                setApplyTarget(null);
                void refresh();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.row.archivedAt ? "Restore this record?" : "Archive this record?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.row.archivedAt
                ? "It returns to the active list."
                : "It leaves the active list. You can restore it later."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmPending()}>
              {pending?.row.archivedAt ? "Restore" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MerchantList({
  rows,
  archived,
  categoryName,
  onOpen,
  onArchive,
  onMerge,
}: {
  rows: Merchant[];
  archived: boolean;
  categoryName: Map<string, string>;
  onOpen: (merchant: Merchant) => void;
  onArchive: (merchant: Merchant) => void;
  onMerge: (merchant: Merchant) => void;
}) {
  return (
    <ListCard label="Merchants">
      {rows.length === 0 ? (
        <p className="px-5 py-5 text-muted-foreground">{archived ? "No archived merchants." : "No merchants yet."}</p>
      ) : (
        rows.map((merchant) => (
          <ListRow key={merchant.id} simple onOpen={() => onOpen(merchant)}>
            <div className={listName}>
              {merchant.name}
              {merchant.defaultCategoryId ? <small>{categoryName.get(merchant.defaultCategoryId) ?? "Category"}</small> : null}
            </div>
            <RowMenu label={`Actions for ${merchant.name}`}>
              <DropdownMenuItem className="min-h-11" onSelect={() => onMerge(merchant)}>
                Merge
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={() => onArchive(merchant)}>
                {merchant.archivedAt ? "Restore" : "Archive"}
              </DropdownMenuItem>
            </RowMenu>
          </ListRow>
        ))
      )}
    </ListCard>
  );
}

function RuleList({
  rows,
  archived,
  accountName,
  onOpen,
  onArchive,
  onApply,
  onCreate,
}: {
  rows: Rule[];
  archived: boolean;
  accountName: Map<string, string>;
  onOpen: (rule: Rule) => void;
  onArchive: (rule: Rule) => void;
  onApply: (rule: Rule) => void;
  onCreate: () => void;
}) {
  return (
    <ListCard
      label="Rules"
      title="Rules"
      actions={
        <Button type="button" variant="secondary" onClick={onCreate}>
          New rule
        </Button>
      }
    >
      {rows.length === 0 ? (
        <p className="px-5 py-5 text-muted-foreground">{archived ? "No archived rules." : "No rules yet."}</p>
      ) : (
        rows.map((rule) => (
          <ListRow key={rule.id} simple onOpen={() => onOpen(rule)}>
            <div className={listName}>
              {rule.pattern}
              <small>
                {matchLabels[rule.match]}
                {rule.accountId ? ` · ${accountName.get(rule.accountId) ?? "One account"}` : ""}
                {` · Priority ${rule.priority}`}
              </small>
            </div>
            {rule.origin === "promoted" ? <Badge variant="neutral">Promoted</Badge> : null}
            <RowMenu label={`Actions for ${rule.pattern}`}>
              {rule.archivedAt ? null : (
                <DropdownMenuItem className="min-h-11" onSelect={() => onApply(rule)}>
                  Apply to existing
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="min-h-11" onSelect={() => onArchive(rule)}>
                {rule.archivedAt ? "Restore" : "Archive"}
              </DropdownMenuItem>
            </RowMenu>
          </ListRow>
        ))
      )}
    </ListCard>
  );
}
