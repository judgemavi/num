import { Temporal } from "@num/shared";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";

type DateFieldProps = {
  id: string;
  /** ISO YYYY-MM-DD, or "" for no date. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** When false, the person can clear the date. */
  required?: boolean;
  placeholder?: string;
  className?: string;
};

function toCalendarDate(value: string) {
  if (value.length === 0) {
    return undefined;
  }
  try {
    const date = Temporal.PlainDate.from(value);
    return new Date(date.year, date.month - 1, date.day);
  } catch {
    return undefined;
  }
}

function fromCalendarDate(date: Date) {
  return Temporal.PlainDate.from({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }).toString();
}

function showDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

const captionFormat = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const dayLabelFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });

const calendarFormatters = {
  formatCaption: (month: Date) => captionFormat.format(month),
  formatWeekdayName: (weekday: Date) => weekdayFormat.format(weekday),
};

const calendarLabels = {
  labelDayButton: (day: Date) => dayLabelFormat.format(day),
};

export function DateField({ id, value, onChange, disabled, required, placeholder = "Pick a date", className }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = toCalendarDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-required={required}
          className={cn(
            "flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-input bg-card px-3.5 text-left text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
            selected ? "" : "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selected ? showDate(selected) : placeholder}</span>
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          formatters={calendarFormatters}
          labels={calendarLabels}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (date) {
              onChange(fromCalendarDate(date));
              setOpen(false);
            }
          }}
        />
        {!required && selected ? (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
