import { Button } from "@/components/ui/button";

type ListPagerProps = {
  page: number;
  lastPage: number;
  onPage: (page: number) => void;
  className?: string;
};

/** The Previous and Next buttons of a list. A list with one page shows no buttons. */
export function ListPager({ page, lastPage, onPage, className = "flex items-center justify-end gap-2" }: ListPagerProps) {
  if (lastPage <= 1) {
    return null;
  }
  return (
    <div className={className}>
      <Button type="button" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <Button type="button" variant="outline" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </div>
  );
}
