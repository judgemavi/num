import type { BucketKind } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { ActivityList } from "@/buckets/activity-list";
import { BucketRow } from "@/buckets/bucket-row";
import { useEditors } from "@/editors/editor-api";
import { FundingHistory } from "@/buckets/funding-history";
import { OverspentPanel } from "@/buckets/overspent-panel";
import { GoalFeasibility } from "@/plan/month-board";
import { BucketFilterBar } from "@/buckets/filters";
import { bucketError, today } from "@/buckets/format";
import { formatMoney } from "@/money";
import { bucketListQuery, coverSourcesQuery, overspentQuery, useArchiveBucket, useCoverBucket } from "@/api/buckets";
import { errorCode } from "@/api/client";
import { fundingPositionQuery } from "@/api/funding";
import { monthPlanQuery } from "@/api/plan";
import { bookCurrencyQuery } from "@/api/settings";
import { Amount } from "@/components/amount";
import { JarsIllustration } from "@/components/illustrations";
import { ListCard, ListGroup } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { Button } from "@/components/ui/button";

const bucketsRoute = getRouteApi("/buckets");

const groupOrder: { kind: BucketKind; label: string }[] = [
  { kind: "spending", label: "Spending" },
  { kind: "sinking", label: "Saving for bills" },
  { kind: "goal", label: "Goals" },
];

export function BucketsScreen() {
  const search = bucketsRoute.useSearch();
  const navigate = bucketsRoute.useNavigate();
  const { openEditor, confirm } = useEditors();
  const [coverFrom, setCoverFrom] = useState<Record<string, string>>({});
  const asOf = today();

  const currency = useQuery(bookCurrencyQuery());
  const board = useQuery(bucketListQuery(search));
  const position = useQuery(fundingPositionQuery(asOf));
  const monthPlan = useQuery(monthPlanQuery(asOf));
  const overspent = useQuery(overspentQuery());
  const sources = useQuery(coverSourcesQuery(search.archived));
  const archive = useArchiveBucket();
  const coverBucket = useCoverBucket();
  const actionFailure = archive.error ?? coverBucket.error;

  function cover(id: string) {
    const fromBucketId = coverFrom[id];
    if (!fromBucketId) {
      return;
    }
    archive.reset();
    coverBucket.mutate({ id, body: { fromBucketId, date: today() } });
  }

  if (currency.isPending || board.isPending || overspent.isPending || position.isPending) {
    return <p className="text-muted-foreground">Loading buckets.</p>;
  }
  if (currency.isError || board.isError || overspent.isError || position.isError || !currency.data || !board.data || !overspent.data || !position.data) {
    return (
      <div className="grid content-start gap-5">
        <p>The buckets did not load.</p>
        <Button
          type="button"
          onClick={() => {
            void currency.refetch();
            void board.refetch();
            void overspent.refetch();
            void position.refetch();
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
  return (
    <>
      <PageHeader
        kicker={search.archived ? "Archived" : `${board.data.total} buckets`}
        title="Buckets"
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => void openEditor("fundPaycheck", {})}>
              Fund this paycheck
            </Button>
            <Button type="button" variant="secondary" onClick={() => void openEditor("moveMoney", { fromId: null })}>
              Move money
            </Button>
            <Button type="button" onClick={() => void openEditor("bucket", { id: null })}>
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
            <Fact label="Unassigned">
              <Amount currency={bookCurrency} minor={position.data.unassigned} className="text-lg" />
            </Fact>
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
      {actionFailure ? (
        <p role="alert" className="text-sm text-attn">
          {bucketError(errorCode(actionFailure))}
        </p>
      ) : null}
      {monthPlan.data ? <GoalFeasibility plan={monthPlan.data} currency={bookCurrency} /> : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="grid gap-5">
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
                    <BucketRow
                      key={bucket.id}
                      bucket={bucket}
                      currency={bookCurrency}
                      onOpen={() => void openEditor("bucket", { id: bucket.id })}
                      onMove={() => void openEditor("moveMoney", { fromId: bucket.id })}
                      onFund={() => void openEditor("assignMoney", { bucketId: bucket.id, kind: "fund" })}
                      onRelease={() => void openEditor("assignMoney", { bucketId: bucket.id, kind: "release" })}
                      onArchive={() => {
                        const restore = bucket.archivedAt !== null;
                        void confirm({
                          title: restore ? "Restore this bucket?" : "Archive this bucket?",
                          description: restore
                            ? "The bucket returns to the active list. Its categories are not put back."
                            : "The balance must be zero. Categories leave this bucket. You can restore the bucket later.",
                          confirmLabel: restore ? "Restore" : "Archive",
                        }).then((ok) => {
                          if (ok) {
                            coverBucket.reset();
                            archive.mutate({ id: bucket.id, restore });
                          }
                        });
                      }}
                    />
                  ))}
                </div>
              );
            })
          )}
        </ListCard>
        <FundingHistory currency={bookCurrency} />
        <ActivityList currency={bookCurrency} buckets={search.archived ? [...(sources.data?.items ?? []), ...rows] : rows} />
        </div>
        <OverspentPanel
          currency={bookCurrency}
          items={overspent.data}
          pool={pool}
          coverFrom={coverFrom}
          onCoverFrom={(id, bucketId) => setCoverFrom((current) => ({ ...current, [id]: bucketId }))}
          onCover={cover}
        />
      </div>
    </>
  );
}
