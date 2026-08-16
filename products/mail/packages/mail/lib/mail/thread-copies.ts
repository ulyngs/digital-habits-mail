/**
 * One row per conversation, whichever of our mailboxes it came to.
 *
 * A mail cc'd to two of the reader's addresses arrives twice, once in each
 * mailbox, and the list would show it twice. It is one conversation to the
 * reader, so it is one row: the newest copy stands for it, and the others
 * are folded in — remembered on the row as `alsoIn`, so that whatever is
 * done to the row can be done to every copy. Deleting only the row's own
 * copy left the other to take its place on the next refresh, the same
 * subject in the same spot; the reader deleted again, and by then the
 * selection had moved on to a conversation they never meant to touch.
 *
 * No React in here, so a test can read it.
 */

import type { MailThreadSummary } from "@/lib/mail/types";

export type ThreadRef = { account: string; threadId: string };

export function threadKey(t: ThreadRef): string {
  return `${t.account}|${t.threadId}`;
}

/**
 * Collapse cc'd copies of the same conversation across mailboxes, mirroring
 * the server's unified dedupe: newest-first, first copy wins the row, any
 * copy being unread / carrying an invite marks the kept row.
 */
export function dedupeThreadsByTip(rows: MailThreadSummary[]): MailThreadSummary[] {
  const sorted = [...rows].sort(
    (a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt)
  );
  const indexByKey = new Map<string, number>();
  const out: MailThreadSummary[] = [];
  for (const t of sorted) {
    const key = t.tipId || threadKey(t);
    const index = indexByKey.get(key);
    if (index == null) {
      indexByKey.set(key, out.length);
      out.push(t);
      continue;
    }
    const kept = out[index];
    const unread = kept.unread || t.unread;
    const hasCalendarInvite = kept.hasCalendarInvite || t.hasCalendarInvite;
    const hasAttachments = kept.hasAttachments || t.hasAttachments;
    const calendarInviteWhen = kept.calendarInviteWhen ?? t.calendarInviteWhen;
    // The folded copy is remembered on the row that stands for it, so an
    // action on the row can reach it — see `alsoIn` on the type.
    const copy = { account: t.account, threadId: t.threadId };
    const alsoIn =
      threadKey(copy) === threadKey(kept) ||
      kept.alsoIn?.some((c) => threadKey(c) === threadKey(copy))
        ? kept.alsoIn
        : [...(kept.alsoIn ?? []), copy, ...(t.alsoIn ?? [])];
    if (
      unread !== kept.unread ||
      hasCalendarInvite !== kept.hasCalendarInvite ||
      hasAttachments !== kept.hasAttachments ||
      calendarInviteWhen !== kept.calendarInviteWhen ||
      alsoIn !== kept.alsoIn
    ) {
      out[index] = {
        ...kept,
        unread,
        hasCalendarInvite,
        hasAttachments,
        calendarInviteWhen,
        alsoIn,
      };
    }
  }
  return out;
}

/**
 * The row and every copy behind it: what an action on the row acts on.
 *
 * `t` may be a bare {account, threadId} — the open thread, say — so the
 * copies are read off the row in the list that stands for it. Deduplicated,
 * and the row's own copy first.
 */
export function everyCopy(
  t: { account: string; threadId: string },
  rows: MailThreadSummary[]
): { account: string; threadId: string }[] {
  const key = threadKey(t);
  const row = rows.find((x) => threadKey(x) === key);
  const out: { account: string; threadId: string }[] = [
    { account: t.account, threadId: t.threadId },
  ];
  const seen = new Set([key]);
  for (const c of row?.alsoIn ?? []) {
    const k = threadKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ account: c.account, threadId: c.threadId });
  }
  return out;
}
