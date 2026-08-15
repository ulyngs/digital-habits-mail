"use client";

/**
 * A month calendar, and the date field that drops it down.
 *
 * `<input type="date">` renders the platform's own calendar, which no CSS can
 * reach. This replaces the field so the calendar is ours and matches the rest
 * of the app.
 *
 * Dates cross this boundary as `yyyy-mm-dd` strings, never as Date objects.
 * That is the shape the forms and the API already hold, it sorts and compares
 * as text, and it carries no time or zone to go wrong.
 *
 * Weeks start on Monday.
 */

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  MONTHS,
  WEEKDAYS,
  formatDateKey,
  monthCells,
  parseDateKey,
  stepMonth,
  toDateKey,
  todayDateKey,
} from "@/components/ui/calendar-dates";
import { cn } from "@/lib/utils";

export function Calendar({
  value,
  onSelect,
  min,
  max,
  className,
}: {
  /** `yyyy-mm-dd`, or "" for nothing chosen. */
  value: string;
  onSelect: (key: string) => void;
  min?: string;
  max?: string;
  className?: string;
}) {
  const today = todayDateKey();
  const selected = parseDateKey(value);
  const anchor = selected ?? parseDateKey(today)!;

  const [view, setView] = React.useState({
    year: anchor.year,
    month: anchor.month,
  });

  // Follow the value when it changes from outside (a Today button, or the
  // other end of a range pushing this one along).
  React.useEffect(() => {
    const next = parseDateKey(value);
    if (next) setView({ year: next.year, month: next.month });
  }, [value]);

  const step = (by: number) => {
    setView((prev) => stepMonth(prev.year, prev.month, by));
  };

  const cells = monthCells(view.year, view.month);

  return (
    <div className={cn("w-[15rem] select-none", className)}>
      <div className="flex items-center justify-between px-1 pb-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => step(-1)}
          className="rounded p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-stone-900">
          {MONTHS[view.month]} {view.year}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => step(1)}
          className="rounded p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((label) => (
          <span
            key={label}
            className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-stone-400"
          >
            {label}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`blank-${i}`} />;
          const key = toDateKey(view.year, view.month, day);
          const isSelected = key === value;
          const isToday = key === today;
          const disabled = (min && key < min) || (max && key > max);
          return (
            <button
              key={key}
              type="button"
              disabled={Boolean(disabled)}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isSelected}
              onClick={() => onSelect(key)}
              className={cn(
                "h-7 rounded text-center text-[13px] tabular-nums",
                disabled
                  ? "cursor-not-allowed text-stone-300"
                  : "text-stone-700 hover:bg-stone-100",
                // Today is a ring, so it still reads when it is also selected.
                isToday && !isSelected && "ring-1 ring-inset ring-stone-300",
                isSelected &&
                  "bg-stone-900 font-semibold text-white hover:bg-stone-900"
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateField({
  value,
  onChange,
  min,
  max,
  placeholder = "Pick a date",
  ariaLabel,
  /** Offers a Clear action — for a date that is allowed to be unset. */
  clearable = false,
  className,
  align = "start",
}: {
  value: string;
  onChange: (key: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  ariaLabel?: string;
  clearable?: boolean;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = React.useState(false);
  const label = value ? formatDateKey(value) : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-left text-sm tabular-nums outline-none hover:border-stone-300 focus:border-stone-400 focus:ring-2 focus:ring-stone-200",
            value ? "text-stone-900" : "text-stone-400",
            className
          )}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-2">
        <Calendar
          value={value}
          min={min}
          max={max}
          onSelect={(key) => {
            onChange(key);
            setOpen(false);
          }}
        />
        {clearable && value ? (
          <div className="mt-2 border-t border-stone-100 pt-2">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="w-full rounded px-2 py-1 text-left text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            >
              Clear
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
