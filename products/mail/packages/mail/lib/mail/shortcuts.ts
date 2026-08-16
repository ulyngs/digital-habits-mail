/**
 * Keyboard shortcuts for an open thread.
 *
 * The defaults are Apple Mail's, because this is a Mac app and that is what a
 * Mac mail client does. Gmail's single letters exist because a browser owns
 * every Cmd key; they are a workaround, not a standard.
 *
 * A reader can change any of them — see `MailShortcutsDialog`. Only the
 * changes are stored, so a default that moves later moves for everyone who
 * never touched it.
 *
 * No React here, on purpose: this is the part a suite reads. The hook that
 * subscribes to it is in `use-mail-shortcuts`.
 *
 * Two keys are not ours to take. macOS binds Cmd+M to Minimize in the app
 * menu, and the page never sees it, so Move to folder is on Cmd+Shift+M.
 * Cmd+R is browser reload, which is why these only fire with a thread open
 * and the focus outside a field.
 *
 * Send is the exception, and has to be: it is pressed from inside the message
 * it sends. The composers listen for that one themselves rather than through
 * the thread handler, which stands down wherever a reply is written.
 */
import type { MailStringKey } from "@/lib/mail/i18n-strings";


export type MailShortcutAction =
  | "reply"
  | "replyAll"
  | "forward"
  | "send"
  | "snooze"
  | "archive"
  | "delete"
  | "toggleUnread"
  | "moveToFolder"
  | "print"
  | "popOut"
  | "togglePin";

export type MailShortcut = {
  /**
   * `KeyboardEvent.key`, lowercased for letters. Not `code`: `code` is the
   * physical key, and on a Danish keyboard that is not the letter printed on
   * it. What the reader presses is what they see.
   */
  key: string;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
};

/** The order the settings dialog lists them in. */
export const MAIL_SHORTCUT_ACTIONS: MailShortcutAction[] = [
  "reply",
  "replyAll",
  "forward",
  "send",
  "snooze",
  "archive",
  "delete",
  "toggleUnread",
  "moveToFolder",
  "print",
  "popOut",
  "togglePin",
];

/** What each action is called, as keys into `@/lib/mail/i18n`. */
export const MAIL_SHORTCUT_LABELS: Record<MailShortcutAction, MailStringKey> = {
  reply: "actionReply",
  replyAll: "actionReplyAll",
  forward: "actionForward",
  send: "actionSend",
  snooze: "actionSnooze",
  archive: "actionArchive",
  delete: "actionDelete",
  toggleUnread: "actionToggleUnread",
  moveToFolder: "actionMoveToFolder",
  print: "actionPrint",
  popOut: "actionPopOut",
  togglePin: "actionTogglePin",
};

export const DEFAULT_MAIL_SHORTCUTS: Record<MailShortcutAction, MailShortcut> = {
  reply: { key: "r", meta: true },
  replyAll: { key: "r", meta: true, shift: true },
  forward: { key: "f", meta: true, shift: true },
  /**
   * The one shortcut that fires while typing.
   *
   * Every other action here is refused when the focus is in a field, so that
   * Cmd+R still reloads and a reply can contain the letter R. Send has to
   * work from inside the message being sent, so the composer listens for it
   * itself rather than going through the thread handler.
   */
  send: { key: "enter", meta: true },
  snooze: { key: "k", meta: true },
  archive: { key: "a", meta: true, shift: true },
  delete: { key: "backspace" },
  toggleUnread: { key: "u", meta: true },
  moveToFolder: { key: "m", meta: true, shift: true },
  print: { key: "p", meta: true },
  /** Beside Print, which is the other thing you do with a whole thread. */
  popOut: { key: "p", meta: true, shift: true },
  /**
   * No mail client has a convention for this, so it takes a free key beside
   * the rest of the Cmd+Shift group. Not Cmd+I: the composer's italics.
   */
  togglePin: { key: "i", meta: true, shift: true },
};

const STORAGE_KEY = "redd-plan-mail-shortcuts";
export const MAIL_SHORTCUTS_EVENT = "redd-plan-mail-shortcuts-changed";

/**
 * A laptop's Delete key and a full keyboard's Backspace are the same intent.
 * Forward-delete reports "Delete", so treat the two as one.
 */
function normalizeKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower === "delete") return "backspace";
  return lower;
}

export function shortcutMatchesEvent(
  event: KeyboardEvent,
  shortcut: MailShortcut
): boolean {
  if (normalizeKey(event.key) !== normalizeKey(shortcut.key)) return false;
  if (event.metaKey !== Boolean(shortcut.meta)) return false;
  if (event.shiftKey !== Boolean(shortcut.shift)) return false;
  if (event.altKey !== Boolean(shortcut.alt)) return false;
  if (event.ctrlKey !== Boolean(shortcut.ctrl)) return false;
  return true;
}

/** The action a key press asks for, if any. */
export function actionForEvent(
  event: KeyboardEvent,
  shortcuts: Record<MailShortcutAction, MailShortcut>
): MailShortcutAction | null {
  for (const action of MAIL_SHORTCUT_ACTIONS) {
    if (shortcutMatchesEvent(event, shortcuts[action])) return action;
  }
  return null;
}

const KEY_SYMBOLS: Record<string, string> = {
  backspace: "⌫",
  enter: "↩",
  escape: "⎋",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  " ": "Space",
  tab: "⇥",
};

/** "⌘⇧R" — the way a Mac writes it, for the dialog and the tooltips. */
export function formatShortcut(shortcut: MailShortcut): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push("⌃");
  if (shortcut.alt) parts.push("⌥");
  if (shortcut.shift) parts.push("⇧");
  if (shortcut.meta) parts.push("⌘");
  const key = normalizeKey(shortcut.key);
  parts.push(KEY_SYMBOLS[key] ?? key.toUpperCase());
  return parts.join("");
}

/** True when two bindings would answer the same key press. */
export function sameShortcut(a: MailShortcut, b: MailShortcut): boolean {
  return (
    normalizeKey(a.key) === normalizeKey(b.key) &&
    Boolean(a.meta) === Boolean(b.meta) &&
    Boolean(a.shift) === Boolean(b.shift) &&
    Boolean(a.alt) === Boolean(b.alt) &&
    Boolean(a.ctrl) === Boolean(b.ctrl)
  );
}

/** Actions that share a binding with another action. */
export function conflictingActions(
  shortcuts: Record<MailShortcutAction, MailShortcut>
): Set<MailShortcutAction> {
  const clashing = new Set<MailShortcutAction>();
  for (const a of MAIL_SHORTCUT_ACTIONS) {
    for (const b of MAIL_SHORTCUT_ACTIONS) {
      if (a === b) continue;
      if (sameShortcut(shortcuts[a], shortcuts[b])) {
        clashing.add(a);
        clashing.add(b);
      }
    }
  }
  return clashing;
}

/**
 * A binding the operating system answers before the page does.
 *
 * Nothing can be bound to these, so the dialog says so instead of storing a
 * key that would never fire.
 */
/** Why the operating system answers this one first, as an i18n key. */
export function reservedReason(shortcut: MailShortcut): MailStringKey | null {
  const key = normalizeKey(shortcut.key);
  if (shortcut.meta && !shortcut.shift && !shortcut.alt && !shortcut.ctrl) {
    if (key === "m") return "reservedMinimize";
    if (key === "q") return "reservedQuit";
    if (key === "h") return "reservedHide";
    if (key === "w") return "reservedClose";
  }
  return null;
}

function readOverrides(): Partial<Record<MailShortcutAction, MailShortcut>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Partial<Record<MailShortcutAction, MailShortcut>> = {};
    for (const action of MAIL_SHORTCUT_ACTIONS) {
      const value = (parsed as Record<string, unknown>)[action];
      if (!value || typeof value !== "object") continue;
      const candidate = value as MailShortcut;
      if (typeof candidate.key !== "string" || !candidate.key) continue;
      out[action] = {
        key: normalizeKey(candidate.key),
        meta: Boolean(candidate.meta),
        shift: Boolean(candidate.shift),
        alt: Boolean(candidate.alt),
        ctrl: Boolean(candidate.ctrl),
      };
    }
    return out;
  } catch {
    return {};
  }
}

let cached: Record<MailShortcutAction, MailShortcut> | null = null;

export function readMailShortcuts(): Record<MailShortcutAction, MailShortcut> {
  // useSyncExternalStore compares snapshots by identity, so the same object
  // has to come back until something actually changes.
  if (cached) return cached;
  cached = { ...DEFAULT_MAIL_SHORTCUTS, ...readOverrides() };
  return cached;
}

export function setMailShortcut(
  action: MailShortcutAction,
  shortcut: MailShortcut | null
): void {
  const overrides = readOverrides();
  if (shortcut) overrides[action] = { ...shortcut, key: normalizeKey(shortcut.key) };
  else delete overrides[action];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* private mode */
  }
  cached = null;
  window.dispatchEvent(new Event(MAIL_SHORTCUTS_EVENT));
}

export function resetMailShortcuts(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
  cached = null;
  window.dispatchEvent(new Event(MAIL_SHORTCUTS_EVENT));
}

/** Notified whenever a binding changes, here or in another tab. */
export function subscribeMailShortcuts(onChange: () => void): () => void {
  const listener = () => {
    cached = null;
    onChange();
  };
  window.addEventListener(MAIL_SHORTCUTS_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(MAIL_SHORTCUTS_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
