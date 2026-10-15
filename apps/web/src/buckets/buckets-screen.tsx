import { comparePriority, type BucketKind } from "@num/shared";
import { usePrefetchQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { billNeedsQuery, bucketListQuery, emergencyFundQuery, overspentQuery } from "@/api/buckets";
import { availableQuery, fundingOwedQuery } from "@/api/funding";
import { feasibilityQuery } from "@/api/feasibility";
import { upcomingQuery } from "@/api/schedules";
import { localAsOf } from "@/as-of";
import { BillRow } from "@/buckets/bill-row";
import { BucketRow } from "@/buckets/bucket-row";
import { BucketFilterBar } from "@/buckets/filters";
import { GoalFeasibility } from "@/buckets/goal-feasibility";
import { OverspentPanel } from "@/buckets/overspent-panel";
import { useBucketBoard, useBucketSearch } from "@/buckets/use-board";
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { JarsIllustration } from "@/components/illustrations";
import { ListCard, ListGroup } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useEditors } from "@/editors/editor-api";
import { DetectedList } from "@/schedules/detected-list";
import { IncomeRow } from "@/schedules/schedule-row";
import { UpcomingOccurrences } from "@/schedules/upcoming-list";

const groupOrder: { id: string; kinds: BucketKind[]; label: string }[] = [
  { id: "income", kinds: ["income"], label: "Income" },
  { id: "commitments", kinds: ["commitment"], label: "Bills" },
  { id: "spending", kinds: ["spending"], label: "Spending" },
  { id: "savings", kinds: ["sinking", "emergency", "goal"], label: "Savings" },
];

/** The screen puts the parts in their places and starts their reads together. Each part reads its own data. */
export function BucketsScreen() {
  const asOf = localAsOf();
  usePrefetchQuery(bucketListQuery(useBucketSearch().shown));
  usePrefetchQuery(availableQuery(asOf));
  usePrefetchQuery(feasibilityQuery(asOf));
  usePrefetchQuery(overspentQuery());
  usePrefetchQuery(emergencyFundQuery(asOf));
  usePrefetchQuery(fundingOwedQuery(asOf));
  usePrefetchQuery(billNeedsQuery(asOf));
  return (
    <Boundary loading="Loading buckets." failed="The buckets did not load.">
      <BucketsHeader />
      <BucketFilterBar />
      <BucketsSummary />
      <GoalFeasibility />
      <BucketsBody />
    </Boundary>
  );
}

/**
 * The lists, and the side column: Detected, Upcoming and, while a bucket is overspent, Overspent. The automatic fill
 * links the transactions that match an occurrence, and the reads load again when it links one.
 */
function BucketsBody() {
  const asOf = localAsOf();
  usePrefetchQuery(upcomingQuery(asOf));
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
      <div className="grid gap-5">
        <BucketList />
      </div>
      <div className="grid gap-5">
        <OverspentPanel />
        <DetectedList />
        <UpcomingOccurrences />
      </div>
    </div>
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
          <Button type="button" variant="secondary" onClick={() => void openEditor("moveMoney", { fromId: null })}>
            Move money
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button">
                <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
                New
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("bucket", { id: null })}>
                New bucket
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("commitment", { id: null })}>
                New bill
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("income", { id: null })}>
                New income
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    />
  );
}

/** Unassigned and the money in the savings buckets, on `asOf`, over all buckets. Each spending row shows what is left. */
function BucketsSummary() {
  const { data } = useSuspenseQuery(availableQuery(localAsOf()));
  return (
    <SummaryStrip
      tint="buckets"
      label="Unassigned"
      amount={<Amount value={data.unassigned} hero />}
      facts={
        <Fact label="Saved">
          <Amount value={data.savings} className="text-lg" />
        </Fact>
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
          const kept = rows.filter((bucket) => group.kinds.includes(bucket.kind));
          // The bills show in fill order.
          const items = group.id === "commitments" ? [...kept].sort(comparePriority) : kept;
          if (items.length === 0) {
            return null;
          }
          const total = items.reduce((sum, bucket) => sum + bucket.balance, 0);
          return (
            <div key={group.id}>
              <ListGroup
                label={group.label}
                aside={
                  group.id === "income" || group.id === "spending" ? undefined : (
                    <>
                      <Amount value={total} /> saved
                    </>
                  )
                }
              />
              {items.map((bucket) =>
                bucket.kind === "income" ? (
                  <IncomeRow key={bucket.id} bucket={bucket} />
                ) : bucket.kind === "commitment" ? (
                  <BillRow key={bucket.id} bucket={bucket} />
                ) : (
                  <BucketRow key={bucket.id} bucket={bucket} />
                ),
              )}
            </div>
          );
        })
      )}
    </ListCard>
  );
}
