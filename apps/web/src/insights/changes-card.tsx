import type { InsightChanges } from "@num/shared";
import { ListCard, ListGroup, ListRow, listAmt, listName } from "@/components/list-card";
import { useBookCurrency, useCategoryNames, useMerchantNames } from "@/editors/lookups";
import { monthTitle, signedMoney } from "@/insights/format";
import { useInsightsReport } from "@/insights/use-report";

type ChangeRow = InsightChanges["increases"][number];

function CategoryRows({ rows, empty }: { rows: ChangeRow[]; empty: string }) {
  const currency = useBookCurrency();
  const names = useCategoryNames();
  if (rows.length === 0) {
    return <p className="px-5 py-4 text-sm text-muted-foreground">{empty}</p>;
  }
  return rows.map((row) => (
    <ListRow key={row.categoryId} simple>
      <span className={listName}>
        {names.get(row.categoryId) ?? "Category"}
        <small>Median {signedMoney(currency, row.median)}</small>
      </span>
      <span className={listAmt}>{signedMoney(currency, row.delta)}</span>
    </ListRow>
  ));
}

export function ChangesCard() {
  const { changes } = useInsightsReport().data;
  const merchantNames = useMerchantNames();
  const title = `Changes in ${monthTitle(changes.month)}`;
  return (
    <ListCard label={title} title={title}>
      <ListGroup label="Largest increases" />
      <CategoryRows rows={changes.increases} empty="No category went up." />
      <ListGroup label="Largest decreases" />
      <CategoryRows rows={changes.decreases} empty="No category went down." />
      <ListGroup label="New merchants" />
      {changes.newMerchants.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">No new merchant.</p> : null}
      {changes.newMerchants.map((row) => (
        <ListRow key={row.merchantId} simple>
          <span className={listName}>{merchantNames.get(row.merchantId) ?? "Merchant"}</span>
        </ListRow>
      ))}
    </ListCard>
  );
}
