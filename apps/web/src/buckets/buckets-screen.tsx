import type { BucketKind } from "@num/shared";
import { usePrefetchQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { bucketEventsQuery, bucketListQuery, overspentQuery } from "@/api/buckets";
import { fundingPositionQuery, fundingRunsQuery } from "@/api/funding";
import { monthPlanQuery } from "@/api/plan";
import { localAsOf } from "@/as-of";
import { ActivityList } from "@/buckets/activity-list";
import { BucketRow } from "@/buckets/bucket-row";
import { BucketFilterBar } from "@/buckets/filters";
import { FundingHistory } from "@/buckets/funding-history";
import { OverspentPanel } from "@/buckets/overspent-panel";
import { useBucketBoard, useBucketSearch } from "@/buckets/use-board";
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { JarsIllustration } from "@/components/illustrations";
import { ListCard, ListGroup } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { Button } from "@/components/ui/button";
import { useEditors } from "@/editors/editor-api";
import { useBookCurrency } from "@/editors/lookups";
import { formatMoney } from "@/money";
import { GoalFeasibility } from "@/plan/month-board";

const groupOrder: { kind: BucketKind; label: string }[] = [
  { kind: "spending", label: "Spending" },
  { kind: "sinking", label: "Saving for bills" },
  { kind: "goal", label: "Goals" },
];

/** The screen puts the parts in their places and starts their reads together. Each part reads its own data. */
export function BucketsScreen() {
  const asOf = localAsOf();
  usePrefetchQuery(bucketListQuery(useBucketSearch().shown));
  usePrefetchQuery(fundingPositionQuery(asOf));
  usePrefetchQuery(monthPlanQuery(asOf));
  usePrefetchQuery(overspentQuery());
  usePrefetchQuery(fundingRunsQuery());
  usePrefetchQuery(bucketEventsQuery());
  return (
    <Boundary loading="Loading buckets." failed="The buckets did not load.">
      <BucketsHeader />
      <BucketFilterBar />
      <BucketsSummary />
      <GoalFeasibility />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="grid gap-5">
          <BucketList />
          <FundingHistory />
          <ActivityList />
        </div>
        <Boundary loading="Loading the overspent buckets." failed="The overspent buckets did not load.">
          <OverspentPanel />
        </Boundary>
      </div>
    </Boundary>
  );
}

function BucketsHeader() {
  const { openEditor } = useEditors();
  const { shown, board } = useBucketBoard();
  return (
    <PageHeader
      kicker={shown.archived ? "Archived" : `${board.total} buckets`}
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
  );
}

function BucketsSummary() {
  const currency = useBookCurrency();
  const rows = useBucketBoard().board.items;
  const { data: position } = useSuspenseQuery(fundingPositionQuery(localAsOf()));
  const { data: overspent } = useSuspenseQuery(overspentQuery());
  const spending = rows.filter((bucket) => bucket.kind === "spending");
  const spendingLeft = spending.reduce((sum, bucket) => sum + bucket.balance, 0);
  const spendingTarget = spending.reduce((sum, bucket) => sum + (bucket.refillTo ?? 0), 0);
  const allBalances = rows.reduce((sum, bucket) => sum + bucket.balance, 0);
  return (
    <SummaryStrip
      tint="buckets"
      label="Left to spend"
      amount={<Amount value={spendingLeft} hero />}
      hint={`of ${formatMoney(currency, spendingTarget)} across ${spending.length} spending ${spending.length === 1 ? "bucket" : "buckets"}`}
      facts={
        <>
          <Fact label="Unassigned">
            <Amount value={position.unassigned} className="text-lg" />
          </Fact>
          <Fact label="In all buckets">
            <Amount value={allBalances} className="text-lg" />
          </Fact>
          <Fact label="Overspent">
            <span className="text-lg font-semibold tabular-nums">{overspent.length}</span>
          </Fact>
        </>
      }
      illustration={<JarsIllustration />}
    />
  );
}

function BucketList() {
  const { shown, board } = useBucketBoard();
  const rows = board.items;
  return (
    <ListCard label="All buckets">
      {rows.length === 0 ? (
        <p className="px-5 py-5 text-muted-foreground">{shown.archived ? "No archived buckets." : "No buckets yet."}</p>
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
                        Over by <Amount value={-total} />
                      </>
                    ) : (
                      <>
                        <Amount value={total} /> left
                      </>
                    )
                  ) : (
                    <>
                      <Amount value={total} /> saved
                    </>
                  )
                }
              />
              {items.map((bucket) => (
                <BucketRow key={bucket.id} bucket={bucket} />
              ))}
            </div>
          );
        })
      )}
    </ListCard>
  );
}
