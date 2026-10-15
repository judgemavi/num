import { defaultInsightWindow, type InsightWindow } from "@num/shared";
import { useQueryClient } from "@tanstack/react-query";
import { insightsQuery } from "@/api/insights";
import { localAsOf } from "@/as-of";
import { ChoiceSelect } from "@/components/choice-select";
import { DateField } from "@/components/date-field";
import { Field, FieldLabel } from "@/components/ui/field";
import { useSpendingSearch } from "@/home/spending/use-spending";

const windows = [
  { value: "1", label: "This month" },
  { value: "3", label: "3 months" },
  { value: "6", label: "6 months" },
  { value: "12", label: "12 months" },
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" },
] as const;

/** The period of Spending on Home. It reads the period from the URL and changes it there. */
export function PeriodSelect() {
  const { search, patchSearch } = useSpendingSearch();
  const queryClient = useQueryClient();
  const current = search.window ?? defaultInsightWindow;
  const { from, to } = search;

  function chooseWindow(window: InsightWindow) {
    if (window === "custom") {
      // The custom period starts with the dates of the report on the screen. With no report, it starts with this month.
      const asOf = localAsOf();
      const report = queryClient.getQueryData(insightsQuery(asOf, search).queryKey);
      patchSearch({ window, from: report?.from ?? `${asOf.slice(0, 7)}-01`, to: report?.to ?? asOf, month: undefined });
      return;
    }
    patchSearch({ window: window === defaultInsightWindow ? undefined : window, from: undefined, to: undefined, month: undefined });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field className="w-44">
        <FieldLabel htmlFor="spending-period">Period</FieldLabel>
        <ChoiceSelect id="spending-period" aria-label="Period" value={current} options={windows} onValueChange={chooseWindow} />
      </Field>
      {current === "custom" ? (
        <>
          <Field className="w-44">
            <FieldLabel htmlFor="spending-from">From</FieldLabel>
            <DateField id="spending-from" value={from ?? ""} required onChange={(value) => patchSearch({ from: value || undefined })} />
          </Field>
          <Field className="w-44">
            <FieldLabel htmlFor="spending-to">To</FieldLabel>
            <DateField id="spending-to" value={to ?? ""} required onChange={(value) => patchSearch({ to: value || undefined })} />
          </Field>
        </>
      ) : null}
    </div>
  );
}
