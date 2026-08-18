"use client";

/**
 * Picking when a thread should come back.
 *
 * The offered times are worked out from the current time — "this evening" is
 * gone by 9pm, "tomorrow" starts at 8am — so the list changes through the day
 * and an option that has passed is never shown.
 */

import * as React from "react";
import { ChevronLeft, ChevronRight, RotateCwFadingClock } from "lucide-react";
import { toast } from "sonner";

import { THREAD_ACTION_CLASS } from "@/components/mail/thread-actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { MailPopoverContent } from "@/components/mail/MailPopoverContent";
import { currentMailLocale, mailSay, useMailT } from "@/lib/mail/i18n";
import { cn } from "@/lib/utils";

/** One offered time: what it is called, when it is, and the time itself. */
export type SnoozeOption = {
  id: string;
  label: string;
  detail: string;
  iso: string;
};
const SNOOZE_TIME_CHIPS = ["08:00", "09:00", "13:00", "17:00"] as const;
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
/** 24h clock matching the snooze menu mockups, e.g. "15:00". */
export function formatSnoozeClock(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
/** Weekday + clock, e.g. "Thu 08:00". */
export function formatSnoozeDayTime(d: Date): string {
  const day = d.toLocaleDateString(currentMailLocale(), { weekday: "short" });
  return `${day} ${formatSnoozeClock(d)}`;
}
/** Full commit label, e.g. "Tue 4 Aug, 09:00". */
function formatSnoozeCommitLabel(d: Date): string {
  const day = d.toLocaleDateString(currentMailLocale(), { weekday: "short" });
  const date = d.toLocaleDateString(currentMailLocale(), { day: "numeric", month: "short" });
  return `${day} ${date}, ${formatSnoozeClock(d)}`;
}
/** Toast / wake label — time only when still today. */
export function formatSnoozeWakeLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const now = new Date();
  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    return formatSnoozeClock(d);
  }
  return formatSnoozeDayTime(d);
}
function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
/** Calendar-day Date (midnight local) — distinct from list helper `startOfDay` (epoch ms). */
function snoozeDayStart(d: Date): Date {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}
/** Monday-start month grid (6 weeks) for the custom snooze calendar. */
function snoozeMonthGrid(month: Date): { date: Date; inMonth: boolean }[] {
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, m, 1 - mondayOffset);
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    cells.push({ date, inMonth: date.getMonth() === m });
  }
  return cells;
}
function combineSnoozeDateTime(date: Date, hm: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}
/** Presets: in 1 hour, later today, tomorrow 8am, Sat 10am, next Mon 8am. */
/**
 * The times on offer, worked out from now.
 *
 * Send later shows the same list, so the two menus cannot drift into
 * offering different hours for the same words.
 */
export function snoozeOptions(): SnoozeOption[] {
  const now = new Date();
  const options: SnoozeOption[] = [];

  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  options.push({
    id: "1h",
    label: mailSay("snoozeInOneHour"),
    detail: formatSnoozeClock(inOneHour),
    iso: inOneHour.toISOString(),
  });

  const laterToday = new Date(now);
  // Morning → 15:00; once past noon, evening 21:00.
  laterToday.setHours(now.getHours() < 12 ? 15 : 21, 0, 0, 0);
  if (laterToday.getTime() > now.getTime()) {
    options.push({
      id: "later",
      label: mailSay("snoozeLaterToday"),
      detail: formatSnoozeClock(laterToday),
      iso: laterToday.toISOString(),
    });
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);
  options.push({
    id: "tomorrow",
    label: mailSay("snoozeTomorrow"),
    detail: formatSnoozeDayTime(tomorrow),
    iso: tomorrow.toISOString(),
  });

  const weekend = new Date(now);
  weekend.setHours(10, 0, 0, 0);
  // Days until Saturday (6); on Sat after 10am or Sun, jump to next Saturday.
  const untilSat = (6 - weekend.getDay() + 7) % 7;
  weekend.setDate(weekend.getDate() + untilSat);
  if (weekend.getTime() <= now.getTime()) weekend.setDate(weekend.getDate() + 7);
  options.push({
    id: "weekend",
    label: mailSay("snoozeThisWeekend"),
    detail: formatSnoozeDayTime(weekend),
    iso: weekend.toISOString(),
  });

  const nextWeek = new Date(now);
  nextWeek.setHours(8, 0, 0, 0);
  const day = nextWeek.getDay() === 0 ? 7 : nextWeek.getDay();
  nextWeek.setDate(nextWeek.getDate() + (8 - day));
  options.push({
    id: "nextweek",
    label: mailSay("snoozeNextWeek"),
    detail: formatSnoozeDayTime(nextWeek),
    iso: nextWeek.toISOString(),
  });

  return options;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
/** Click-a-row presets; custom is a second step with calendar + time chips. */
export function SnoozeMenu({
  onSnooze,
  onCancelSnooze,
  currentUntil,
  trigger,
  openSignal,
  onOpenChange,
  title = "Snooze",
}: {
  onSnooze: (untilIso: string) => void;
  onCancelSnooze?: () => void;
  currentUntil?: string;
  trigger?: React.ReactNode;
  /** Bump to open the menu from elsewhere — the keyboard shortcut does. */
  openSignal?: number;
  /**
   * Told when the menu opens and closes. A trigger that only exists on hover
   * needs this: it must stay on screen while the menu is open, or the pointer
   * moving to the menu unmounts the trigger under it.
   */
  onOpenChange?: (open: boolean) => void;
  /**
   * What the trigger says on hover. Given by the caller, because the key
   * that opens this is the caller's to know and the reader's to be told.
   */
  title?: string;
}) {
  const t = useMailT();
  const [open, setOpen] = React.useState(false);
  // One report for every path that opens or closes the menu — the trigger, the
  // keyboard signal, and each row that commits a time.
  React.useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  React.useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);
  const [step, setStep] = React.useState<"presets" | "custom">("presets");
  const [viewMonth, setViewMonth] = React.useState(() => snoozeDayStart(new Date()));
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);
  const [timeHm, setTimeHm] = React.useState("09:00");
  const [customTimeOpen, setCustomTimeOpen] = React.useState(false);

  const listRef = React.useRef<HTMLDivElement | null>(null);

  /** The rows of the presets step, in the order they are read. */
  const presetButtons = React.useCallback(
    () =>
      Array.from(
        listRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not([disabled])"
        ) ?? []
      ),
    []
  );

  /**
   * Up and Down walk the times; Enter takes the one you are on.
   *
   * A popover is not a menu — Radix moves no focus between its children —
   * so the keys were leaving the menu entirely and reaching the window
   * handler that moves the selected thread. Opening the snooze menu with
   * the keyboard and then pressing Down changed which conversation you
   * were about to snooze, silently.
   *
   * `stopPropagation` is the half that fixes that: whatever this does or
   * does not do with the key, it does not travel on to the list.
   */
  const onListKeyDown = (event: React.KeyboardEvent) => {
    // The custom step has a calendar and a time box of its own, where an
    // arrow key means something else and the caret needs its own.
    if (step !== "presets") return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    event.stopPropagation();
    const buttons = presetButtons();
    if (!buttons.length) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "ArrowDown"
        ? at < 0
          ? 0
          : (at + 1) % buttons.length
        : at < 0
          ? buttons.length - 1
          : (at - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  // Recompute times each time the menu opens.
  const options = React.useMemo(() => snoozeOptions(), [open]);
  const today = snoozeDayStart(new Date());
  const monthCells = React.useMemo(() => snoozeMonthGrid(viewMonth), [viewMonth]);
  const monthLabel = viewMonth.toLocaleDateString(currentMailLocale(), {
    month: "long",
    year: "numeric",
  });

  const resetCustom = () => {
    const now = new Date();
    setStep("presets");
    setViewMonth(snoozeDayStart(now));
    setSelectedDate(null);
    setTimeHm("09:00");
    setCustomTimeOpen(false);
  };

  const choose = (iso: string) => {
    setOpen(false);
    resetCustom();
    onSnooze(iso);
  };

  const customUntil = selectedDate
    ? combineSnoozeDateTime(selectedDate, timeHm)
    : null;
  const customValid =
    customUntil != null && customUntil.getTime() > Date.now();

  const submitCustom = () => {
    if (!customValid || !customUntil) {
      toast.error(mailSay("pickTimeInFuture"));
      return;
    }
    choose(customUntil.toISOString());
  };

  const chipActive = (chip: string) => !customTimeOpen && timeHm === chip;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetCustom();
      }}
    >
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("snooze")}
            title={title}
            className={THREAD_ACTION_CLASS}
          >
            <RotateCwFadingClock />
          </Button>
        )}
      </PopoverTrigger>
      <MailPopoverContent
        /* Named, so a menu this one opens out of can tell a press in here
           from a press outside itself — see ThreadToolbarOverflow. */
        data-mail-snooze-menu
        align="start"
        className={cn(
          step === "presets" ? "w-64 p-1.5" : "w-[280px] p-3",
          "rounded-xl"
        )}
        onKeyDown={onListKeyDown}
        /**
         * The first time, focused, rather than the box it sits in. Radix
         * focuses the content element itself, which takes the keys without
         * being able to act on any of them: Enter did nothing and the
         * arrows went to the thread list.
         */
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          if (step === "custom") return;
          requestAnimationFrame(() => presetButtons()[0]?.focus());
        }}
      >
        {step === "presets" ? (
          <div ref={listRef}>
            {currentUntil ? (
              <p className="px-2.5 pb-1 pt-1 text-[11px] text-stone-400">
                Currently until {formatSnoozeWakeLabel(currentUntil)}
              </p>
            ) : null}
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                /* `mail-menu-pick`: the row under the pointer or the
                   arrow keys takes the navy the rail marks a chosen folder
                   with, so what is about to happen is unmistakable. */
                className="mail-menu-pick flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm"
                onClick={() => choose(option.iso)}
              >
                <span className="font-semibold text-stone-800">{option.label}</span>
                <span className="text-sm tabular-nums text-stone-400">
                  {option.detail}
                </span>
              </button>
            ))}
            <div className="mx-1.5 my-1 border-t border-stone-100" />
            <button
              type="button"
              className="mail-menu-pick flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-stone-800"
              onClick={() => setStep("custom")}
            >
              <span>
                {t("pickDateAndTime")}
              </span>
              <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden />
            </button>
            {onCancelSnooze ? (
              <>
                <div className="mx-1.5 my-1 border-t border-stone-100" />
                <button
                  type="button"
                  className="flex w-full rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                  onClick={() => {
                    setOpen(false);
                    resetCustom();
                    onCancelSnooze();
                  }}
                >
                  {t("cancelSnooze")}
                </button>
              </>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label={t("previousMonth")}
                className="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                onClick={() =>
                  setViewMonth((m) => {
                    const next = new Date(m);
                    next.setMonth(next.getMonth() - 1);
                    return snoozeDayStart(next);
                  })
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="text-sm font-semibold text-stone-800">{monthLabel}</p>
              <button
                type="button"
                aria-label={t("nextMonth")}
                className="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                onClick={() =>
                  setViewMonth((m) => {
                    const next = new Date(m);
                    next.setMonth(next.getMonth() + 1);
                    return snoozeDayStart(next);
                  })
                }
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center">
              {["M", "T", "W", "T", "F", "S", "S"].map((label, i) => (
                <span
                  key={`${label}-${i}`}
                  className="py-1 text-[11px] font-medium text-stone-400"
                >
                  {label}
                </span>
              ))}
              {monthCells.map(({ date, inMonth }) => {
                const disabled = snoozeDayStart(date).getTime() < today.getTime();
                const selected =
                  selectedDate != null && sameCalendarDay(date, selectedDate);
                const isToday = sameCalendarDay(date, today);
                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setSelectedDate(snoozeDayStart(date));
                      if (date.getMonth() !== viewMonth.getMonth()) {
                        setViewMonth(snoozeDayStart(date));
                      }
                    }}
                    className={cn(
                      "mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-sm tabular-nums transition-colors",
                      !inMonth && "text-stone-300",
                      inMonth && !selected && "text-stone-700",
                      disabled && "cursor-not-allowed opacity-40",
                      !disabled && !selected && "hover:bg-stone-100",
                      isToday && !selected && "ring-1 ring-stone-300",
                      selected && "bg-teal-700 font-semibold text-white hover:bg-teal-700"
                    )}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-sm text-stone-400">at</span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {SNOOZE_TIME_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      setTimeHm(chip);
                      setCustomTimeOpen(false);
                    }}
                    className={cn(
                      "rounded-lg border px-2 py-1 text-xs font-medium tabular-nums transition-colors",
                      chipActive(chip)
                        ? "border-teal-700 bg-teal-700 text-white"
                        : "border-stone-200 text-stone-700 hover:border-stone-300 hover:bg-stone-50"
                    )}
                  >
                    {chip}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label={t("customTime")}
                  onClick={() => setCustomTimeOpen(true)}
                  className={cn(
                    "rounded-lg border border-dashed px-2 py-1 text-xs font-medium transition-colors",
                    customTimeOpen
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-stone-300 text-stone-500 hover:border-stone-400 hover:bg-stone-50"
                  )}
                >
                  …
                </button>
              </div>
            </div>

            {customTimeOpen ? (
              <input
                type="time"
                value={timeHm}
                onChange={(e) => setTimeHm(e.target.value || "09:00")}
                className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-teal-600"
              />
            ) : null}

            <button
              type="button"
              disabled={!customValid}
              onClick={submitCustom}
              className={cn(
                "w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                customValid
                  ? "bg-teal-700 text-white hover:bg-teal-800"
                  : "cursor-not-allowed bg-stone-100 text-stone-400"
              )}
            >
              {customValid && customUntil
                ? `Snooze until ${formatSnoozeCommitLabel(customUntil)}`
                : selectedDate
                  ? "Pick a future time"
                  : "Pick a date"}
            </button>
          </div>
        )}
      </MailPopoverContent>
    </Popover>
  );
}
