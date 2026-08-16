/**
 * The order the mailboxes sit in.
 *
 * A mailbox is dragged to a place between two others, not onto one of them:
 * there is nothing to be inside a mailbox, and a list of them has only an
 * order. So the move is said as "put this one before that one", and the end
 * of the list is `null` — the place after everything.
 *
 * Where the order is kept is the other half of this file. Not with the
 * provider: Gmail and Outlook each keep their own list, and the app reads one
 * after the other, so those two cannot say "this Outlook mailbox sits between
 * those two Gmail ones" between them. The reader's arrangement is a
 * preference, and it lives with the preferences.
 *
 * No React here, so a test can read it.
 */

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * `moved` goes in front of `before`, or to the end when `before` is null.
 *
 * The list comes back unchanged when the move would change nothing: a mailbox
 * dropped in front of itself, or in front of the one already behind it, is a
 * drag that thought better of it.
 */
export function moveAccountBefore(
  order: string[],
  moved: string,
  before: string | null
): string[] {
  const from = order.findIndex((email) => sameEmail(email, moved));
  if (from < 0) return order;
  if (before !== null && sameEmail(moved, before)) return order;
  const rest = order.filter((_, index) => index !== from);
  if (before === null) return [...rest, order[from]];
  const at = rest.findIndex((email) => sameEmail(email, before));
  if (at < 0) return order;
  return [...rest.slice(0, at), order[from], ...rest.slice(at)];
}

export const MAIL_ACCOUNT_ORDER_KEY = "redd-plan-mail-account-order";
export const MAIL_ACCOUNT_ORDER_EVENT = "redd-plan-mail-account-order-changed";

/**
 * The order the reader arranged, if they have arranged one.
 *
 * Kept here rather than with the provider, because the provider cannot hold
 * it: a Gmail mailbox and an Outlook one live in different tables, each with
 * its own order, and the app reads one list after the other. A reader who
 * wants their Outlook mailbox in the middle of the Gmail ones is asking for
 * something those two lists cannot say between them.
 *
 * So it is a preference, and it sits with the other preferences — the theme,
 * the reading pane, the language. Every mailbox in it is lowercased.
 */
export function readAccountOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MAIL_ACCOUNT_ORDER_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function writeAccountOrder(order: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      MAIL_ACCOUNT_ORDER_KEY,
      JSON.stringify(order.map((email) => email.trim().toLowerCase()))
    );
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(MAIL_ACCOUNT_ORDER_EVENT));
}

/**
 * The mailboxes, in the reader's order.
 *
 * A mailbox the order has never heard of — connected after the last drag —
 * keeps its place among the others rather than being pushed to the end: it
 * follows the mailbox it came after in the list as given. A mailbox in the
 * order that is no longer connected is passed over.
 */
export function sortAccountsByOrder(
  accounts: string[],
  order: string[]
): string[] {
  if (!order.length) return accounts;
  const rank = new Map(order.map((email, index) => [email, index]));
  const seat = (email: string) => rank.get(email.trim().toLowerCase());
  let last = -1;
  // A known mailbox sits at its own rank. An unknown one sits just after the
  // last known mailbox above it, so a new account lands where it was listed.
  const seats = accounts.map((email) => {
    const known = seat(email);
    if (known !== undefined) {
      last = known;
      return { email, rank: known, tie: 0 };
    }
    return { email, rank: last, tie: 1 };
  });
  return seats
    .map((entry, index) => ({ ...entry, index }))
    .sort(
      (a, b) => a.rank - b.rank || a.tie - b.tie || a.index - b.index
    )
    .map((entry) => entry.email);
}
