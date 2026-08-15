"use client";

/**
 * Changing the thread shortcuts.
 *
 * Click a binding, press the keys, and it is stored. A press is read from the
 * event rather than typed as text, so what the reader presses is what gets
 * saved — including whatever their keyboard layout puts on that key.
 *
 * The dialog refuses a binding the operating system answers first, because
 * storing one would look like it worked and then never fire.
 */

import * as React from "react";

import {
  SettingsDialog,
  SettingsGroup,
  SettingsRow,
  settingsPrimaryButton,
  settingsSecondaryButton,
} from "@/components/mail/settings-ui";
import {
  conflictingActions,
  DEFAULT_MAIL_SHORTCUTS,
  formatShortcut,
  MAIL_SHORTCUT_ACTIONS,
  MAIL_SHORTCUT_LABELS,
  reservedReason,
  resetMailShortcuts,
  sameShortcut,
  setMailShortcut,
  type MailShortcut,
  type MailShortcutAction,
} from "@/lib/mail/shortcuts";
import { useMailShortcuts } from "@/lib/mail/use-mail-shortcuts";
import { cn } from "@/lib/utils";

/** Keys that only ever accompany another one. */
const MODIFIER_KEYS = new Set(["Meta", "Shift", "Alt", "Control"]);

export function MailShortcutsDialog({ onClose }: { onClose: () => void }) {
  const shortcuts = useMailShortcuts();
  const [capturing, setCapturing] = React.useState<MailShortcutAction | null>(
    null
  );
  const [refused, setRefused] = React.useState<string | null>(null);
  const clashing = conflictingActions(shortcuts);

  React.useEffect(() => {
    if (!capturing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setCapturing(null);
        setRefused(null);
        return;
      }
      // Wait for the key the modifiers belong to.
      if (MODIFIER_KEYS.has(event.key)) return;

      const next: MailShortcut = {
        key: event.key.toLowerCase(),
        meta: event.metaKey,
        shift: event.shiftKey,
        alt: event.altKey,
        ctrl: event.ctrlKey,
      };
      const reserved = reservedReason(next);
      if (reserved) {
        setRefused(`${formatShortcut(next)} — ${reserved}.`);
        return;
      }
      setMailShortcut(capturing, next);
      setCapturing(null);
      setRefused(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [capturing]);

  return (
    <SettingsDialog
      title="Keyboard shortcuts"
      subtitle="These work while a thread is open, and the focus is outside a text field."
      onClose={onClose}
      footer={
        <>
          {/* Reset all sits away from Done, on the left, because the two are
              not a pair — one undoes every binding on the list. */}
          <button
            type="button"
            className={cn(settingsSecondaryButton, "mr-auto")}
            onClick={() => {
              resetMailShortcuts();
              setCapturing(null);
              setRefused(null);
            }}
          >
            Reset all
          </button>
          <button
            type="button"
            className={settingsPrimaryButton}
            onClick={onClose}
          >
            Done
          </button>
        </>
      }
    >
      <SettingsGroup>
        {MAIL_SHORTCUT_ACTIONS.map((action) => {
          const shortcut = shortcuts[action];
          const isDefault = sameShortcut(
            shortcut,
            DEFAULT_MAIL_SHORTCUTS[action]
          );
          return (
            <SettingsRow
              key={action}
              label={MAIL_SHORTCUT_LABELS[action]}
              control={
                <span className="flex shrink-0 items-center gap-2">
                  {!isDefault ? (
                    <button
                      type="button"
                      className="text-xs text-stone-500 underline underline-offset-2 hover:text-stone-800"
                      onClick={() => setMailShortcut(action, null)}
                    >
                      Reset
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setRefused(null);
                      setCapturing(action);
                    }}
                    className={cn(
                      "min-w-[86px] rounded-md border px-2.5 py-1 text-center font-mono text-sm transition-colors",
                      capturing === action
                        ? "border-teal-600 bg-teal-50 text-teal-800"
                        : clashing.has(action)
                          ? "border-red-300 bg-red-50 text-red-600"
                          : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                    )}
                  >
                    {capturing === action
                      ? "Press keys…"
                      : formatShortcut(shortcut)}
                  </button>
                </span>
              }
            />
          );
        })}
      </SettingsGroup>

      {refused ? (
        <p className="mt-2 text-sm text-red-600">{refused}</p>
      ) : null}
      {clashing.size ? (
        <p className="mt-2 text-sm text-red-600">
          Two actions share a key. The one higher in this list answers it.
        </p>
      ) : null}
    </SettingsDialog>
  );
}
