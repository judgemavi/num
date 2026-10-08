import {
  bucketEventSchema,
  bucketSchema,
  currencyUpdateSchema,
  overspentListSchema,
  type Bucket,
  type BucketKind,
} from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { BucketForm } from "@/buckets/bucket-form";
import { BucketBar } from "@/buckets/bucket-bar";
import { BucketFilterBar } from "@/buckets/filters";
import { barLabel, bucketDetail, bucketError, bucketTarget, today } from "@/buckets/format";
import { formatMoney } from "@/money";
import { BucketGlyph } from "@/buckets/icons";
import { MoveMoney } from "@/buckets/move-money";
import { loadBuckets } from "@/buckets/query";
import { apiRequest } from "@/request";
import { Amount } from "@/components/amount";
import { type Hue } from "@/components/hue";
import { IconTile } from "@/components/icon-tile";
import { JarsIllustration } from "@/components/illustrations";
import { ListCard, ListGroup, ListRow, listAmt, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { SidePanel } from "@/components/side-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const bucketsRoute = getRouteApi("/buckets");

const groupOrder: { kind: BucketKind; label: string }[] = [
  { kind: "spending", label: "Spending" },
  { kind: "sinking", label: "Saving for bills" },
  { kind: "goal", label: "Goals" },
];

export function BucketsScreen() {
  const queryClient = useQueryClient();
  const search = bucketsRoute.useSearch();
  const navigate = bucketsRoute.useNavigate();
  const [draft, setDraft] = useState<Bucket | "new" | null>(null);
  const [moveFrom, setMoveFrom] = useState<string | null | false>(false);
  const [pending, setPending] = useState<Bucket | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [coverFrom, setCoverFrom] = useState<Record<string, string>>({});

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
  const board = useQuery({
    queryKey: ["buckets", search],
    queryFn: () => loadBuckets(search),
  });
  const overspent = useQuery({
    queryKey: ["buckets", "overspent"],
    queryFn: async () => {
      const result = await apiRequest("/api/buckets/overspent", overspentListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.items;
    },
  });
  const sources = useQuery({
    queryKey: ["buckets", "cover-sources"],
    queryFn: () => loadBuckets({ archived: false }),
    enabled: search.archived,
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["buckets"] });
  }

  async function confirmPending() {
    if (!pending) {
      return;
    }
    const restoring = pending.archivedAt !== null;
    const result = await apiRequest(`/api/buckets/${pending.id}/${restoring ? "restore" : "archive"}`, bucketSchema, {
      method: "POST",
    });
    if (!result.ok) {
      setActionError(bucketError(result.code));
      return;
    }
    setActionError(null);
    setPending(null);
    await refresh();
  }

  async function cover(id: string) {
    const fromBucketId = coverFrom[id];
    if (!fromBucketId) {
      return;
    }
    const result = await apiRequest(`/api/buckets/${id}/cover`, bucketEventSchema, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromBucketId, date: today() }),
    });
    if (!result.ok) {
      setActionError(bucketError(result.code));
      return;
    }
    setActionError(null);
    await refresh();
  }

  if (currency.isPending || board.isPending || overspent.isPending) {
    return <p className="text-muted-foreground">Loading buckets.</p>;
  }
  if (currency.isError || board.isError || overspent.isError || !currency.data || !board.data || !overspent.data) {
    return (
      <div className="grid content-start gap-5">
        <p>The buckets did not load.</p>
        <Button
          type="button"
          onClick={() => {
            void currency.refetch();
            void board.refetch();
            void overspent.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const bookCurrency = currency.data;
  const rows = board.data.items;
  const pool = search.archived ? (sources.data?.items ?? []) : rows;
  const spending = rows.filter((bucket) => bucket.kind === "spending");
  const spendingLeft = spending.reduce((sum, bucket) => sum + bucket.balance, 0);
  const spendingTarget = spending.reduce((sum, bucket) => sum + (bucket.refillTo ?? 0), 0);
  const allBalances = rows.reduce((sum, bucket) => sum + bucket.balance, 0);
  const suggestedPriority = rows.reduce((max, bucket) => Math.max(max, bucket.priority), 0) + 1;

  return (
    <>
      <PageHeader
        kicker={search.archived ? "Archived" : `${board.data.total} buckets`}
        title="Buckets"
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setMoveFrom(null)}>
              Move money
            </Button>
            <Button type="button" onClick={() => setDraft("new")}>
              <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
              New bucket
            </Button>
          </>
        }
      />
      <BucketFilterBar
        search={search}
        onChange={(patch) => {
          void navigate({ search: { ...search, ...patch, page: 1 } });
        }}
      />
      <SummaryStrip
        tint="buckets"
        label="Left to spend"
        amount={<Amount currency={bookCurrency} minor={spendingLeft} hero />}
        hint={`of ${formatMoney(bookCurrency, spendingTarget)} across ${spending.length} spending ${spending.length === 1 ? "bucket" : "buckets"}`}
        facts={
          <>
            <Fact label="In all buckets">
              <Amount currency={bookCurrency} minor={allBalances} className="text-lg" />
            </Fact>
            <Fact label="Overspent">
              <span className="text-lg font-semibold tabular-nums">{overspent.data.length}</span>
            </Fact>
          </>
        }
        illustration={<JarsIllustration />}
      />
      {actionError ? (
        <p role="alert" className="text-sm text-attn">
          {actionError}
        </p>
      ) : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <ListCard label="All buckets">
          {rows.length === 0 ? (
            <p className="px-5 py-5 text-muted-foreground">{search.archived ? "No archived buckets." : "No buckets yet."}</p>
          ) : (
            groupOrder.map((group) => {
              const items = rows.filter((bucket) => bucket.kind === group.kind);
              if (items.length === 0) {
                return null;
              }
              const total = items.reduce((sum, bucket) => sum + bucket.balance, 0);
              return (
                <div key={group.kind}>
                  <ListGroup
                    label={group.label}
                    aside={
                      group.kind === "spending" ? (
                        total < 0 ? (
                          <>
                            Over by <Amount currency={bookCurrency} minor={-total} />
                          </>
                        ) : (
                          <>
                            <Amount currency={bookCurrency} minor={total} /> left
                          </>
                        )
                      ) : (
                        <>
                          <Amount currency={bookCurrency} minor={total} /> saved
                        </>
                      )
                    }
                  />
                  {items.map((bucket) => (
                    <BucketRow key={bucket.id} bucket={bucket} currency={bookCurrency} onOpen={() => setDraft(bucket)} onMove={() => setMoveFrom(bucket.id)} onArchive={() => setPending(bucket)} />
                  ))}
                </div>
              );
            })
          )}
        </ListCard>
        <SidePanel title="Overspent" text="Move money from another bucket to cover it.">
          {overspent.data.length === 0 ? <p className="text-sm text-muted-foreground">No bucket is overspent.</p> : null}
          {overspent.data.map((item) => {
            const need = -item.balance;
            const options = pool.filter((bucket) => bucket.id !== item.id && bucket.balance >= need);
            return (
              <div key={item.id} className="grid gap-2 border-t pt-3 first:border-t-0 first:pt-0">
                <p className="font-semibold">
                  {item.name}
                  <span className="mt-0.5 block text-sm font-normal text-attn">Over by <Amount currency={bookCurrency} minor={need} /></span>
                </p>
                {options.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No other bucket can cover this.</p>
                ) : (
                  <div className="grid gap-2">
                    <Select value={coverFrom[item.id]} onValueChange={(value) => setCoverFrom((current) => ({ ...current, [item.id]: value }))}>
                      <SelectTrigger aria-label={`Cover ${item.name} from`} className="w-full">
                        <SelectValue placeholder="Cover from" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((bucket) => (
                          <SelectItem key={bucket.id} value={bucket.id}>
                            {bucket.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" disabled={!coverFrom[item.id]} onClick={() => void cover(item.id)}>
                      Cover
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </SidePanel>
      </div>
      <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) setDraft(null); }}>
        <DialogContent className="max-h-[min(40rem,calc(100%-2rem))] overflow-y-auto">
          {draft ? (
            <BucketForm
              currency={bookCurrency}
              draft={draft}
              nextColor={board.data.nextColor}
              suggestedPriority={suggestedPriority}
              onClose={() => setDraft(null)}
              onSaved={() => {
                setDraft(null);
                void refresh();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={moveFrom !== false} onOpenChange={(open) => { if (!open) setMoveFrom(false); }}>
        <DialogContent>
          <MoveMoney
            currency={bookCurrency}
            buckets={pool}
            fromId={moveFrom === false ? null : moveFrom}
            onClose={() => setMoveFrom(false)}
            onSaved={() => {
              setMoveFrom(false);
              void refresh();
            }}
          />
        </DialogContent>
      </Dialog>
      <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.archivedAt ? "Restore this bucket?" : "Archive this bucket?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.archivedAt
                ? "The bucket returns to the active list. Its balance stays the same."
                : "The bucket leaves the active list. You can restore it later. Its balance stays the same."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmPending()}>{pending?.archivedAt ? "Restore" : "Archive"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function BucketRow({
  bucket,
  currency,
  onOpen,
  onMove,
  onArchive,
}: {
  bucket: Bucket;
  currency: string;
  onOpen: () => void;
  onMove: () => void;
  onArchive: () => void;
}) {
  const over = bucket.balance < 0;
  const target = bucketTarget(bucket);
  return (
    <ListRow onOpen={onOpen}>
      <IconTile hue={bucket.color as Hue}>
        <BucketGlyph name={bucket.icon} />
      </IconTile>
      <div className={listName}>
        {bucket.name}
        {bucket.essential ? <Badge variant="neutral">Essential</Badge> : null}
        <small>{bucketDetail(bucket, currency)}</small>
      </div>
      <div className="w-36 shrink-0 max-md:basis-full">
        <BucketBar hue={bucket.color as Hue} balance={bucket.balance} target={target} label={barLabel(bucket, currency)} />
      </div>
      <div className={`${listAmt} ${over ? "text-attn" : ""}`}>
        {over ? (
          <>
            Over by <Amount currency={currency} minor={-bucket.balance} />
          </>
        ) : bucket.kind === "spending" ? (
          <>
            <Amount currency={currency} minor={bucket.balance} /> left
            <small>of <Amount currency={currency} minor={target} /></small>
          </>
        ) : (
          <>
            <Amount currency={currency} minor={bucket.balance} />
            <small>of <Amount currency={currency} minor={target} /></small>
          </>
        )}
      </div>
      <RowMenu label={`Actions for ${bucket.name}`}>
        <DropdownMenuItem className="min-h-11" onSelect={onMove}>
          Move money
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11" onSelect={onArchive}>
          {bucket.archivedAt ? "Restore" : "Archive"}
        </DropdownMenuItem>
      </RowMenu>
    </ListRow>
  );
}
