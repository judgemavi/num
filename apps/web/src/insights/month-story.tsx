import type { MonthStory } from "@num/shared";
import { Amount } from "@/components/amount";
import { ListCard, ListGroup, ListRow, listAmt, listName } from "@/components/list-card";
import { signedMoney } from "@/insights/format";
import { formatMoney } from "@/money";

type Names = {
  category: Map<string, string>;
  merchant: Map<string, string>;
  plan: Map<string, string>;
  bucket: Map<string, string>;
};

function nameOf(map: Map<string, string>, id: string): string {
  return map.get(id) ?? "Unknown";
}

export function MonthStoryView({ currency, story, names }: { currency: string; story: MonthStory; names: Names }) {
  return (
    <div className="grid gap-5">
      <ListCard label="Uncategorized" title="Uncategorized">
        <ListRow simple>
          <span className={listName}>
            {story.uncategorized.count === 1 ? "1 line" : `${story.uncategorized.count} lines`}
            <small>Needs a category</small>
          </span>
          <span className={listAmt}>
            <Amount currency={currency} minor={story.uncategorized.amount} />
          </span>
        </ListRow>
      </ListCard>
      <ListCard label="Category changes" title="Category changes">
        <ListGroup label="Largest increases" />
        {story.increases.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">No category went up.</p> : null}
        {story.increases.map((row) => (
          <ListRow key={row.categoryId} simple>
            <span className={listName}>
              {nameOf(names.category, row.categoryId)}
              <small>Median {signedMoney(currency, row.median)}</small>
            </span>
            <span className={listAmt}>{signedMoney(currency, row.delta)}</span>
          </ListRow>
        ))}
        <ListGroup label="Largest decreases" />
        {story.decreases.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">No category went down.</p> : null}
        {story.decreases.map((row) => (
          <ListRow key={row.categoryId} simple>
            <span className={listName}>
              {nameOf(names.category, row.categoryId)}
              <small>Median {signedMoney(currency, row.median)}</small>
            </span>
            <span className={listAmt}>{signedMoney(currency, row.delta)}</span>
          </ListRow>
        ))}
      </ListCard>
      <ListCard label="New merchants" title="New merchants">
        {story.newMerchants.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">No new merchant.</p> : null}
        {story.newMerchants.map((row) => (
          <ListRow key={row.merchantId} simple>
            <span className={listName}>{nameOf(names.merchant, row.merchantId)}</span>
          </ListRow>
        ))}
      </ListCard>
      <ListCard label="Recurring changes" title="Recurring changes">
        {story.recurringChanges.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">No recurring amount changed.</p>
        ) : null}
        {story.recurringChanges.map((row) => (
          <ListRow key={`${row.planId}-${row.dueDate}`} simple>
            <span className={listName}>
              {nameOf(names.plan, row.planId)}
              <small>
                Planned {formatMoney(currency, row.expectedAmount)} · Actual {formatMoney(currency, row.actualAmount)}
              </small>
            </span>
          </ListRow>
        ))}
      </ListCard>
      <ListCard label="Buckets" title="Buckets">
        {story.buckets.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">No bucket.</p> : null}
        {story.buckets.map((row) => (
          <ListRow key={row.bucketId} simple>
            <span className={listName}>{nameOf(names.bucket, row.bucketId)}</span>
            <span className={listAmt}>
              <Amount currency={currency} minor={row.balance} />
            </span>
          </ListRow>
        ))}
      </ListCard>
      <ListCard label="Plan and actual" title="Plan and actual">
        {story.plan.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">No plan in this month.</p> : null}
        {story.plan.map((row) => (
          <ListRow key={row.planId} simple>
            <span className={listName}>
              {nameOf(names.plan, row.planId)}
              <small>Planned {formatMoney(currency, row.planned)}</small>
            </span>
            <span className={listAmt}>
              <Amount currency={currency} minor={row.actual} />
            </span>
          </ListRow>
        ))}
      </ListCard>
      <ListCard label="Forecast accuracy" title="Forecast accuracy">
        {story.accuracy === null ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">No forecast was saved for this month.</p>
        ) : (
          <>
            <ListRow simple>
              <span className={listName}>Forecast for the last day</span>
              <span className={listAmt}>
                <Amount currency={currency} minor={story.accuracy.predicted} />
              </span>
            </ListRow>
            <ListRow simple>
              <span className={listName}>Actual</span>
              <span className={listAmt}>
                <Amount currency={currency} minor={story.accuracy.actual} />
              </span>
            </ListRow>
          </>
        )}
      </ListCard>
    </div>
  );
}
