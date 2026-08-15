"use client";

/**
 * The furniture every settings surface is built from.
 *
 * One vocabulary, borrowed from Digital Habits: Blocker, which is the app most
 * of these readers meet first. A heading names a section; a group holds its
 * rows on a tinted card with hairlines between them; a row says what it is on
 * the left and holds its control on the right.
 *
 * It lives here rather than in each panel because four surfaces were drifting
 * apart — the same switch was three sizes, and the same button was two
 * colours, depending on which dialog you had opened.
 *
 * Colours are named with the stone scale on purpose. `mail.css` maps those
 * classes to the dark theme's own variables, so a panel built from them
 * follows the theme without asking.
 */

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/** The small capitals over a section. */
export function SettingsHeading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mb-1.5 mt-6 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400 first:mt-0",
        className
      )}
    >
      {children}
    </p>
  );
}

/**
 * A section's rows, on one card.
 *
 * A tint rather than a border: the card is a background for its rows, and a
 * stack of outlined boxes is what made these panels read as a pile of
 * unrelated switches in the first place.
 */
export function SettingsGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // The cream the title bar and the thread list are painted in, so a
        // panel over them is the same surface rather than a grey card on top.
        // The variable, not the colour: it is what turns navy in dark mode.
        "divide-y divide-stone-200 overflow-hidden rounded-xl bg-[var(--mail-chrome)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SettingsRow({
  label,
  hint,
  control,
  onClick,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  control?: React.ReactNode;
  /** Makes the whole row the control — for a row that opens something. */
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <span className="flex min-w-0 flex-col gap-0.5 text-left">
        <span className="text-sm text-stone-800">{label}</span>
        {hint ? (
          <span className="text-xs leading-snug text-stone-500">{hint}</span>
        ) : null}
      </span>
      {control ? <span className="shrink-0">{control}</span> : null}
    </>
  );
  const shape = cn(
    "flex w-full items-center justify-between gap-3 px-4 py-3",
    className
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(shape, "text-left transition-colors hover:bg-stone-200/50")}
      >
        {body}
      </button>
    );
  }
  return <div className={shape}>{body}</div>;
}

/**
 * A row whose control sits under its label rather than beside it.
 *
 * For a text box, which needs the width — beside a label it would be a slot
 * too narrow to read what you typed into it.
 */
export function SettingsStackedRow({
  label,
  hint,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-sm text-stone-800">{label}</p>
      {hint ? (
        <p className="mt-0.5 text-xs leading-snug text-stone-500">{hint}</p>
      ) : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** One switch, one size, wherever it appears. */
export function SettingsToggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** What the switch is for, for anybody not reading the row beside it. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative block h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-teal-600" : "bg-stone-300"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]",
          checked ? "left-4" : "left-0.5"
        )}
      />
    </button>
  );
}

export const settingsPrimaryButton =
  "rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-60";

export const settingsSecondaryButton =
  "rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-60";

/**
 * The shell every settings dialog sits in.
 *
 * A title, an optional line saying what the dialog is for, the body, and a
 * footer that holds the buttons. The body scrolls and the footer does not, so
 * the way out stays on screen however long the list inside gets.
 */
export function SettingsDialog({
  title,
  subtitle,
  nav,
  onClose,
  children,
  footer,
  width = "w-[520px]",
  closeLabel = "Close",
  bare = false,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /**
   * Tabs under the title, outside the scrolling body.
   *
   * Which account you are editing has to stay on screen while you scroll
   * through what you are editing about it.
   */
  nav?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
  closeLabel?: string;
  /**
   * Drop the corner cross and the line over the footer.
   *
   * A dialog that asks one question and offers both answers as buttons has
   * no use for a third way out, and no list under the question long enough
   * for the footer to need a line holding it away from one. Escape and the
   * backdrop still shut it.
   */
  bare?: boolean;
}) {
  const titleId = React.useId();

  /**
   * Escape shuts it.
   *
   * On the bubble phase, so a dialog that reads keys itself — the shortcut
   * editor does — can take Escape first and use it to stop reading, rather
   * than losing the dialog under it.
   */
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative flex max-h-[88vh] max-w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl",
          width
        )}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <h2
            id={titleId}
            className="font-serif text-xl font-bold text-stone-900"
          >
            {title}
          </h2>
          {bare ? null : (
            <button
              type="button"
              aria-label={closeLabel}
              className="-mr-1.5 shrink-0 rounded-md p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {subtitle ? (
          <p className="px-6 pt-1 text-sm text-stone-600">{subtitle}</p>
        ) : null}
        {nav ? <div className="mt-3 px-6">{nav}</div> : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer ? (
          <div
            className={cn(
              "flex items-center justify-end gap-2 px-6",
              bare ? "pb-5" : "border-t border-stone-200 py-3"
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
