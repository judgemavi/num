import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategoryNames, useTagNames } from "@/editors/lookups";
import { SelectedSpendList, SpendDonutCard } from "@/home/spending/spending-breakdown";
import { TimelineChart } from "@/home/spending/timeline-chart";
import { useSpendingReport } from "@/home/spending/use-spending";

function TimelineCard() {
  const { data, search } = useSpendingReport();
  const categoryName = useCategoryNames().get(search.category ?? "");
  const tagName = useTagNames().get(data.tagId ?? "");
  const scope = categoryName ?? tagName;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 px-5 pt-5 md:px-6">
        <CardTitle className="text-base font-bold">{scope ? `${scope} spending` : "Income and spending"}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 px-5 pb-5 md:px-6">
        <TimelineChart />
      </CardContent>
    </Card>
  );
}

export function SpendingContent() {
  return <>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <TimelineCard />
      <SpendDonutCard />
    </div>
    <SelectedSpendList />
  </>;
}
