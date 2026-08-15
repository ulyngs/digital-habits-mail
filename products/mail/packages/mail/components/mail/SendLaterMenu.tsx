"use client";

/**
 * Picking when a message should go out.
 *
 * The offered times are worked out from the current time, the way the snooze
 * menu does it, so an option that has already passed is never shown.
 *
 * Outlook only, and the caller decides that. Exchange holds the message and
 * sends it itself, which is what makes the time a promise: the machine that
 * wrote it can be shut, asleep, or on a plane. Gmail has nothing we can ask
 * for the same thing — see `sendMailMessage`.
 */

import * as React from "react";
import { Clock } from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { MailPopoverContent } from "@/components/mail/MailPopoverContent";
import { snoozeOptions } from "@/components/mail/SnoozeMenu";

/** `datetime-local` wants local wall-clock, not the ISO string we send. */
function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * What the box starts on: tomorrow morning.
 *
 * It started empty, which the browser fills in with today — a date that is
 * behind by the time anybody reads it, on a control whose whole subject is
 * the future. Tomorrow at eight is both a real answer and the commonest one.
 */
function defaultCustomValue(): string {
  const at = new Date();
  at.setDate(at.getDate() + 1);
  at.setHours(8, 0, 0, 0);
  return localInputValue(at);
}

/**
 * Now, to the next whole minute.
 *
 * Rounded up rather than down: a time that has just passed is refused, and a
 * button that fills the box with something the next click rejects is worse
 * than no button.
 */
function nowValue(): string {
  const at = new Date();
  at.setSeconds(0, 0);
  at.setMinutes(at.getMinutes() + 1);
  return localInputValue(at);
}

export function SendLaterMenu({
  onPick,
  trigger,
}: {
  /** ISO 8601 time to hold the message until. */
  onPick: (iso: string) => void;
  /**
   * What opens the menu. Given by the caller rather than made here, because
   * it is part of the Send button — one control that sends, with a second
   * section that says when.
   */
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [custom, setCustom] = React.useState(defaultCustomValue);
  // Recomputed on open, or the offer goes stale overnight.
  React.useEffect(() => {
    if (open) setCustom(defaultCustomValue());
  }, [open]);

  // The same times the snooze menu offers, recomputed each time this opens.
  const options = React.useMemo(() => snoozeOptions(), [open]);

  const choose = (iso: string) => {
    setOpen(false);
    setCustom(defaultCustomValue());
    onPick(iso);
  };

  const submitCustom = () => {
    const at = new Date(custom);
    if (!Number.isFinite(at.getTime())) {
      toast.error("Pick a date and time");
      return;
    }
    if (at.getTime() <= Date.now()) {
      toast.error("Pick a time that has not passed");
      return;
    }
    choose(at.toISOString());
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <MailPopoverContent align="start" className="w-72 rounded-xl p-1.5">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-stone-100"
            onClick={() => choose(option.iso)}
          >
            <span className="font-semibold text-stone-800">{option.label}</span>
            <span className="text-sm tabular-nums text-stone-400">
              {option.detail}
            </span>
          </button>
        ))}
        <div className="mx-1.5 my-1 border-t border-stone-100" />
        <div className="flex items-center gap-2 px-2.5 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-lg border border-stone-200 pl-2 pr-1">
            <input
              type="datetime-local"
              className="min-w-0 flex-1 bg-transparent py-1 text-sm text-stone-800 outline-none"
              value={custom}
              min={localInputValue(new Date())}
              onChange={(e) => setCustom(e.target.value)}
            />
            <button
              type="button"
              title="Now"
              aria-label="Set to now"
              className="shrink-0 rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              onClick={() => setCustom(nowValue())}
            >
              <Clock className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg bg-teal-600 px-2.5 py-1 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
            disabled={!custom}
            onClick={submitCustom}
          >
            Set
          </button>
        </div>
        {/* The one thing a reader has to be able to trust about this. */}
        <p className="px-2.5 pb-1.5 pt-1 text-[11px] leading-snug text-stone-400">
          Outlook holds the message and sends it. This Mac does not have to be
          on.
        </p>
      </MailPopoverContent>
    </Popover>
  );
}
