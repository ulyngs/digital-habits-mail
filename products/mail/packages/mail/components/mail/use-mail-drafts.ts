"use client";

/**
 * Every unsent message, from both places they live.
 *
 * Ours are in this browser and never reach Gmail or Outlook — that is a
 * deliberate choice, not an oversight, and the badge on each row is what keeps
 * it from being a surprise. The provider's are fetched.
 *
 * Read on demand rather than on load: the folders menu refreshes its counts
 * when it opens, and this follows it. Opening mail costs nothing.
 */

import * as React from "react";

import { mailApiJson as apiJson } from "@/lib/mail/api";
import {
  isComposeDraftKey,
  listMailDrafts,
  subscribeMailDrafts,
} from "@/lib/mail/local-drafts";
import { htmlToPlainText } from "@/lib/client-email-html";
import { emailsOfRecipients } from "@/lib/mail/contact-list-types";
import type { MailDraftRow } from "@/lib/mail/types";

/** One of ours, as a row. */
function localDraftRow(draft: Awaited<ReturnType<typeof listMailDrafts>>[number]): MailDraftRow {
  const body = htmlToPlainText(draft.body ?? "").trim();
  if (draft.kind === "compose") {
    return {
      id: draft.key,
      origin: "here",
      account: draft.from ?? "",
      threadId: null,
      subject: draft.subject.trim() || "(no subject)",
      snippet: body,
      to: emailsOfRecipients(draft.toList),
      updatedAt: new Date(draft.updatedAt).toISOString(),
    };
  }
  return {
    id: draft.key,
    origin: "here",
    account: draft.account,
    threadId: draft.threadId,
    // A reply draft has no subject of its own; the thread owns it. The row
    // leans on the recipients and the text instead.
    subject: "",
    snippet: body,
    to: emailsOfRecipients(draft.toList),
    updatedAt: new Date(draft.updatedAt).toISOString(),
  };
}

export function useMailDrafts(): {
  drafts: MailDraftRow[];
  loading: boolean;
  refresh: () => void;
} {
  const [drafts, setDrafts] = React.useState<MailDraftRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const runRef = React.useRef(0);

  const refresh = React.useCallback(() => {
    const run = ++runRef.current;
    setLoading(true);
    void (async () => {
      const [local, remote] = await Promise.all([
        listMailDrafts().catch(() => []),
        apiJson<{ drafts?: MailDraftRow[] }>("/api/mail/drafts")
          .then((json) => json.drafts ?? [])
          // A mailbox we cannot reach leaves our own drafts listed rather
          // than emptying the view.
          .catch(() => [] as MailDraftRow[]),
      ]);
      if (run !== runRef.current) return;
      const rows = [...local.map(localDraftRow), ...remote].sort((a, b) =>
        (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
      );
      setDrafts(rows);
      setLoading(false);
    })();
  }, []);

  // Ours change as they are typed; the provider's only change when refetched.
  React.useEffect(() => subscribeMailDrafts(refresh), [refresh]);

  return { drafts, loading, refresh };
}

/** True for a row that has no thread to open — a new message, not a reply. */
export function isStandaloneDraft(row: MailDraftRow): boolean {
  if (row.origin === "here") return isComposeDraftKey(row.id);
  return !row.threadId;
}
