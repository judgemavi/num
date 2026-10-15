import { Button } from "@/components/ui/button";
import { useSpendingSearch } from "@/home/spending/use-spending";

/**
 * The one "Clear" of Spending on Home. It shows when a month bar, a donut slice or a tag is selected. It clears them.
 * It does not change the period or the list mode.
 */
export function SelectionClear() {
  const { search, patchSearch } = useSpendingSearch();
  if (!search.month && !search.group && !search.category && !search.tagId) {
    return null;
  }
  return (
    <Button type="button" variant="ghost" onClick={() => patchSearch({ month: undefined, group: undefined, category: undefined, tagId: undefined })}>
      Clear
    </Button>
  );
}
