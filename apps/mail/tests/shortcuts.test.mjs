/**
 * Thread keyboard shortcuts: matching, naming, and what cannot be bound.
 *
 * The defaults are Apple Mail's. A change to one of them is a change to what
 * a reader's fingers already do, so the defaults are asserted here by name and
 * not only by behaviour.
 */

import {
  actionForEvent,
  conflictingActions,
  DEFAULT_MAIL_SHORTCUTS,
  formatShortcut,
  MAIL_SHORTCUT_ACTIONS,
  reservedReason,
  sameShortcut,
  shortcutMatchesEvent,
} from "@/lib/mail/shortcuts";

import { check, suite } from "./harness.mjs";

/** A KeyboardEvent as the handler reads it. */
function press(key, mods = {}) {
  return {
    key,
    metaKey: Boolean(mods.meta),
    shiftKey: Boolean(mods.shift),
    altKey: Boolean(mods.alt),
    ctrlKey: Boolean(mods.ctrl),
  };
}

suite(async () => {
  const d = DEFAULT_MAIL_SHORTCUTS;

  // --- The defaults are Apple Mail's -------------------------------------

  check("Reply is Cmd+R", formatShortcut(d.reply) === "⌘R", formatShortcut(d.reply));
  // Apple's order is ⌃⌥⇧⌘ — Command sits closest to the key, as in ⇧⌘N for
  // New Folder. Writing it the other way round would look wrong in a menu.
  check(
    "Reply all is Cmd+Shift+R, written the way a Mac writes it",
    formatShortcut(d.replyAll) === "⇧⌘R",
    formatShortcut(d.replyAll)
  );
  check(
    "Forward is Cmd+Shift+F",
    formatShortcut(d.forward) === "⇧⌘F",
    formatShortcut(d.forward)
  );
  check(
    "Send is Cmd+Return",
    formatShortcut(d.send) === "⌘↩",
    formatShortcut(d.send)
  );
  check("Snooze is Cmd+K", formatShortcut(d.snooze) === "⌘K", formatShortcut(d.snooze));
  check("Delete is Backspace", formatShortcut(d.delete) === "⌫", formatShortcut(d.delete));
  check(
    "Archive is Cmd+Shift+A",
    formatShortcut(d.archive) === "⇧⌘A",
    formatShortcut(d.archive)
  );
  check(
    "Read or unread is Cmd+U",
    formatShortcut(d.toggleUnread) === "⌘U",
    formatShortcut(d.toggleUnread)
  );
  check(
    "Move to folder is Cmd+Shift+M, because macOS keeps Cmd+M",
    formatShortcut(d.moveToFolder) === "⇧⌘M",
    formatShortcut(d.moveToFolder)
  );
  check("Print is Cmd+P", formatShortcut(d.print) === "⌘P", formatShortcut(d.print));
  check(
    "Pop out is Cmd+Shift+P, beside Print",
    formatShortcut(d.popOut) === "⇧⌘P",
    formatShortcut(d.popOut)
  );

  check(
    "Pin or unpin is Cmd+Shift+I — no client has a convention, and Cmd+I is italics",
    formatShortcut(d.togglePin) === "⇧⌘I",
    formatShortcut(d.togglePin)
  );

  check("no two defaults share a key", conflictingActions(d).size === 0);

  // --- Matching -----------------------------------------------------------

  check("Cmd+R replies", actionForEvent(press("r", { meta: true }), d) === "reply");
  check(
    "Shift makes it reply all, not reply",
    actionForEvent(press("R", { meta: true, shift: true }), d) === "replyAll",
    actionForEvent(press("R", { meta: true, shift: true }), d)
  );
  check(
    "a bare R does nothing — single letters are not the scheme",
    actionForEvent(press("r"), d) === null
  );
  check(
    "Cmd+Shift+R does not also count as Cmd+R",
    !shortcutMatchesEvent(press("R", { meta: true, shift: true }), d.reply)
  );
  check("Backspace deletes", actionForEvent(press("Backspace"), d) === "delete");
  check(
    "Cmd+Shift+A archives",
    actionForEvent(press("A", { meta: true, shift: true }), d) === "archive"
  );
  check(
    "Cmd+Backspace is not delete — a bare Backspace is",
    actionForEvent(press("Backspace", { meta: true }), d) === null
  );
  check(
    "a full keyboard's forward-delete deletes too",
    actionForEvent(press("Delete"), d) === "delete"
  );
  check(
    "Cmd+Shift+P pops the thread out, and plain Cmd+P still prints",
    actionForEvent(press("P", { meta: true, shift: true }), d) === "popOut" &&
      actionForEvent(press("p", { meta: true }), d) === "print"
  );
  check(
    "Cmd+Shift+I pins, and plain Cmd+I is left to the composer",
    actionForEvent(press("I", { meta: true, shift: true }), d) === "togglePin" &&
      actionForEvent(press("i", { meta: true }), d) === null
  );
  check(
    "Cmd+Return sends",
    actionForEvent(press("Enter", { meta: true }), d) === "send"
  );
  check(
    "a bare Return is not send — it is a new line in a reply",
    actionForEvent(press("Enter"), d) === null
  );
  check(
    "an unbound combination is left alone",
    actionForEvent(press("j", { meta: true, alt: true }), d) === null
  );

  // --- What the system takes first ---------------------------------------

  check(
    "Cmd+M is refused: macOS minimizes with it",
    Boolean(reservedReason({ key: "m", meta: true })),
    reservedReason({ key: "m", meta: true }) ?? ""
  );
  check(
    "Cmd+Q, Cmd+W and Cmd+H are refused too",
    ["q", "w", "h"].every((key) => reservedReason({ key, meta: true }))
  );
  check(
    "Cmd+Shift+M is fine — the menu only claims the plain one",
    reservedReason({ key: "m", meta: true, shift: true }) === null
  );
  check(
    "an ordinary binding is not refused",
    reservedReason({ key: "r", meta: true }) === null
  );

  // --- Conflicts ----------------------------------------------------------

  const clashing = { ...d, print: { key: "r", meta: true } };
  check(
    "two actions on one key are both reported",
    conflictingActions(clashing).has("print") &&
      conflictingActions(clashing).has("reply")
  );
  check(
    "the earlier action in the list answers the press",
    actionForEvent(press("r", { meta: true }), clashing) === "reply",
    `${MAIL_SHORTCUT_ACTIONS.indexOf("reply")} before ${MAIL_SHORTCUT_ACTIONS.indexOf("print")}`
  );

  check(
    "the same binding written two ways compares equal",
    sameShortcut({ key: "R", meta: true }, { key: "r", meta: true, shift: false })
  );
});
