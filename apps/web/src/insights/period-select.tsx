import { defaultInsightWindow, type InsightWindow } from "@num/shared";
import { DateField } from "@/components/date-field";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const windows: { id: InsightWindow; label: string }[] = [
  { id: "1", label: "This month" },
  { id: "3", label: "3 months" },
  { id: "6", label: "6 months" },
  { id: "12", label: "12 months" },
  { id: "all", label: "All" },
  { id: "custom", label: "Custom" },
];

type PeriodSelectProps = {
  window: InsightWindow | undefined;
  from: string | undefined;
  to: string | undefined;
  onWindow: (window: InsightWindow) => void;
  onRange: (range: { from?: string; to?: string }) => void;
};

export function PeriodSelect({ window, from, to, onWindow, onRange }: PeriodSelectProps) {
  const current = window ?? defaultInsightWindow;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field className="w-44">
        <FieldLabel htmlFor="insights-period">Period</FieldLabel>
        <Select value={current} onValueChange={(value) => onWindow(value as InsightWindow)}>
          <SelectTrigger id="insights-period" aria-label="Period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {windows.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {current === "custom" ? (
        <>
          <Field className="w-44">
            <FieldLabel htmlFor="insights-from">From</FieldLabel>
            <DateField id="insights-from" value={from ?? ""} required onChange={(value) => onRange({ from: value || undefined })} />
          </Field>
          <Field className="w-44">
            <FieldLabel htmlFor="insights-to">To</FieldLabel>
            <DateField id="insights-to" value={to ?? ""} required onChange={(value) => onRange({ to: value || undefined })} />
          </Field>
        </>
      ) : null}
    </div>
  );
}
