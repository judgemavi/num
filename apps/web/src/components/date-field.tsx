import { Temporal } from "@num/shared";
import { CalendarIcon } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { fieldControl, fieldControlIcon } from "@/components/field-control";
import { Button } from "@/components/ui/button";
import { Boundary } from "@/components/boundary";
import { retryLazy } from "@/components/retry-lazy";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";

const calendar = retryLazy<ComponentProps<typeof import("@/components/ui/calendar").Calendar>>(() => import("@/components/ui/calendar").then((module) => ({ default: module.Calendar })));

function preloadCalendar() {
  void calendar.preload().catch(() => undefined);
}

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
  const calendarFrame = useRef<HTMLDivElement>(null);
  useEffect(preloadCalendar, []);
  const selected = toCalendarDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-required={required}
          onFocus={preloadCalendar}
          onPointerEnter={preloadCalendar}
          className={cn(fieldControl, selected ? "" : "text-muted-foreground", className)}
        >
          <span className="truncate">{selected ? showDate(selected) : placeholder}</span>
          <CalendarIcon className={fieldControlIcon} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (!calendarFrame.current?.contains(document.activeElement)) calendarFrame.current?.focus();
        }}
      >
        <div ref={calendarFrame} tabIndex={-1} className="h-84 w-64 outline-none">
          <Boundary
            look="panel"
            loading="Loading calendar."
            failed="The calendar did not load."
            onRetry={calendar.retry}
          >
            <calendar.Component
              mode="single"
              autoFocus
              fixedWeeks
              classNames={{ root: "size-full" }}
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
          </Boundary>
        </div>
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
