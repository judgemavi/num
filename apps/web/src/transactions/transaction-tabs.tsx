import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { reviewSummaryQuery } from "@/api/review";
import { localAsOf } from "@/as-of";
import { Boundary } from "@/components/boundary";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOnReview } from "@/transactions/use-transaction-list";

const tabClass = "min-h-11 flex-none px-3 text-[15px] font-semibold";

/** The number of all rows that need review, with no filter. */
function ReviewTotal() {
  const { data: review } = useSuspenseQuery(reviewSummaryQuery(localAsOf()));
  return ` · ${review.total}`;
}

/**
 * The two views of Transactions: All and Needs review. Each tab is a link. A link does not keep the
 * search and the filters: each page starts with its defaults.
 */
export function TransactionTabs() {
  return (
    <Tabs value={useOnReview() ? "review" : "all"}>
      <TabsList variant="line" className="h-auto">
        <TabsTrigger value="all" className={tabClass} asChild>
          <Link to="/transactions">All</Link>
        </TabsTrigger>
        <TabsTrigger value="review" className={tabClass} asChild>
          <Link to="/transactions/review">
            Needs review
            <Boundary loading={null} failed={() => null}>
              <ReviewTotal />
            </Boundary>
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
