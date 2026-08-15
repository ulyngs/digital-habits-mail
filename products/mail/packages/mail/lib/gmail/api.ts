import "server-only";

import { decodeHtmlEntities } from "@/lib/html-entities";
import { base64UrlToUtf8, utf8ToBase64Url } from "@/lib/base64";
import type { GmailSendAs } from "@/lib/mail/sender-name";

/** Minimal Gmail REST API client (readonly scope) using fetch, no SDK. */

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailHeader = { name: string; value: string };

export type GmailMessagePart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailMessagePart[];
};

export type GmailMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  historyId?: string;
  payload?: GmailMessagePart;
};

async function gmailFetch<T>(
  accessToken: string,
  path: string,
  init?: { method?: "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown }
): Promise<T> {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body !== undefined
        ? { "Content-Type": "application/json" }
        : null),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text();
    const err = new Error(`Gmail API ${path.split("?")[0]} failed (${res.status}): ${detail.slice(0, 300)}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function getGmailProfile(
  accessToken: string
): Promise<{ emailAddress: string; historyId: string }> {
  const data = await gmailFetch<{ emailAddress?: string; historyId?: string }>(
    accessToken,
    "/profile"
  );
  if (!data.emailAddress || !data.historyId) {
    throw new Error("Gmail profile response was incomplete");
  }
  return { emailAddress: data.emailAddress, historyId: data.historyId };
}

/** Gmail vacation responder (out-of-office). Times are epoch-ms strings. */
export type GmailVacationSettings = {
  enableAutoReply?: boolean;
  responseSubject?: string;
  responseBodyPlainText?: string;
  responseBodyHtml?: string;
  restrictToContacts?: boolean;
  restrictToDomain?: boolean;
  startTime?: string;
  endTime?: string;
};

export async function getVacationSettings(
  accessToken: string
): Promise<GmailVacationSettings> {
  return gmailFetch<GmailVacationSettings>(accessToken, "/settings/vacation");
}

/**
 * The addresses this account may send as, and the name Gmail puts on each.
 *
 * The same `gmail.settings.basic` scope as the out-of-office reply, so this
 * asks for nothing new. It answers "what name do this person's colleagues
 * already see on their mail" without us having to ask them.
 */
export async function listGmailSendAs(
  accessToken: string
): Promise<GmailSendAs[]> {
  const data = await gmailFetch<{ sendAs?: GmailSendAs[] }>(
    accessToken,
    "/settings/sendAs"
  );
  return data.sendAs ?? [];
}

export async function updateVacationSettings(
  accessToken: string,
  settings: GmailVacationSettings
): Promise<GmailVacationSettings> {
  return gmailFetch<GmailVacationSettings>(accessToken, "/settings/vacation", {
    method: "PUT",
    body: settings,
  });
}

export async function listMessageIds(
  accessToken: string,
  query: string,
  pageToken?: string
): Promise<{
  ids: string[];
  nextPageToken?: string;
  /** Gmail's rough match count for the query (first page only; often approximate). */
  resultSizeEstimate?: number;
}> {
  const params = new URLSearchParams({ q: query, maxResults: "500" });
  if (pageToken) params.set("pageToken", pageToken);
  const data = await gmailFetch<{
    messages?: { id: string }[];
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }>(accessToken, `/messages?${params.toString()}`);
  return {
    ids: (data.messages ?? []).map((m) => m.id),
    nextPageToken: data.nextPageToken,
    resultSizeEstimate: data.resultSizeEstimate,
  };
}

export async function getMessageFull(
  accessToken: string,
  messageId: string
): Promise<GmailMessage> {
  return gmailFetch<GmailMessage>(accessToken, `/messages/${messageId}?format=full`);
}

/** True when Gmail still classifies the message as a draft (never sent). */
export function isGmailDraft(message: Pick<GmailMessage, "labelIds">): boolean {
  return (message.labelIds ?? []).includes("DRAFT");
}

export type GmailDraftRef = {
  id: string;
  message?: { id?: string; threadId?: string };
};

/**
 * Which draft on one page answers to a message, and which to its thread.
 *
 * Two answers rather than one because they rank differently across pages: an
 * exact message id on the last page still beats a thread match on the first.
 */
export function matchGmailDraftPage(
  drafts: GmailDraftRef[],
  messageId: string,
  threadId?: string
): { exact: string | null; byThread: string | null } {
  return {
    exact: drafts.find((d) => d.message?.id === messageId)?.id ?? null,
    byThread: threadId
      ? (drafts.find((d) => d.message?.threadId === threadId)?.id ?? null)
      : null,
  };
}

/**
 * The id of the draft that owns a message, or null.
 *
 * A Gmail draft and its message are two different objects with two different
 * ids, and only the draft id can be deleted. The thread gives us the message,
 * so the draft has to be looked up — which is why this is done when the reply
 * is sent rather than every time a thread is opened.
 *
 * `threadId` is a second way in, and it matters. Gmail gives a draft a new
 * message id every time it saves it, and it saves on a keystroke — so the id
 * read when the thread was opened is stale as soon as the reader touches that
 * draft in Gmail, which they can be doing in another window while the reply
 * goes out from here. The thread is what does not change. A thread holds at
 * most one draft in practice, so falling back to it is not a guess.
 */
export async function findGmailDraftIdForMessage(
  accessToken: string,
  messageId: string,
  threadId?: string
): Promise<string | null> {
  let pageToken: string | undefined;
  let byThread: string | null = null;
  // A mailbox full of forgotten drafts should not turn into an endless walk.
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({ maxResults: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await gmailFetch<{
      drafts?: GmailDraftRef[];
      nextPageToken?: string;
    }>(accessToken, `/drafts?${params.toString()}`);
    const found = matchGmailDraftPage(data.drafts ?? [], messageId, threadId);
    if (found.exact) return found.exact;
    byThread = byThread ?? found.byThread;
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return byThread;
}

/** Remove a draft from Gmail. */
export async function deleteGmailDraft(
  accessToken: string,
  draftId: string
): Promise<void> {
  await gmailFetch(accessToken, `/drafts/${draftId}`, { method: "DELETE" });
}

/** True when the message appears in Sent (actually delivered outbound). */
export function isGmailSent(message: Pick<GmailMessage, "labelIds">): boolean {
  return (message.labelIds ?? []).includes("SENT");
}

/**
 * Message ids currently in Drafts that match the query (used to scrub
 * previously-imported draft rows out of client_emails).
 */
export async function listDraftMessageIds(
  accessToken: string,
  query: string
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await listMessageIds(accessToken, `in:drafts ${query}`, pageToken);
    ids.push(...page.ids);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return ids;
}

/**
 * Incremental sync: message ids added since `startHistoryId`.
 * Throws with status 404 when the historyId has expired (caller should re-backfill).
 */
export async function listHistoryAddedMessageIds(
  accessToken: string,
  startHistoryId: string
): Promise<{ ids: string[]; latestHistoryId: string | null }> {
  const ids = new Set<string>();
  let latestHistoryId: string | null = null;
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      startHistoryId,
      historyTypes: "messageAdded",
      maxResults: "500",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await gmailFetch<{
      history?: { messagesAdded?: { message?: { id?: string } }[] }[];
      historyId?: string;
      nextPageToken?: string;
    }>(accessToken, `/history?${params.toString()}`);

    for (const entry of data.history ?? []) {
      for (const added of entry.messagesAdded ?? []) {
        if (added.message?.id) ids.add(added.message.id);
      }
    }
    if (data.historyId) latestHistoryId = data.historyId;
    pageToken = data.nextPageToken;
  } while (pageToken);

  return { ids: [...ids], latestHistoryId };
}

// ---------------------------------------------------------------------------
// Inbox / thread / write helpers (Mail tab)
// ---------------------------------------------------------------------------

/** Message ids matching `query`, capped at `maxResults` (single page). */
export async function listRecentMessageIds(
  accessToken: string,
  query: string,
  maxResults: number
): Promise<string[]> {
  const page = await listRecentMessages(accessToken, query, maxResults);
  return page.messages.map((m) => m.id);
}

/**
 * Messages matching `query` (id + threadId). Used for search so we can deep-link
 * into the hit message inside each thread.
 */
export async function listRecentMessages(
  accessToken: string,
  query: string,
  maxResults: number,
  pageToken?: string
): Promise<{
  messages: { id: string; threadId: string }[];
  nextPageToken?: string;
}> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });
  if (pageToken) params.set("pageToken", pageToken);
  const data = await gmailFetch<{
    messages?: { id: string; threadId: string }[];
    nextPageToken?: string;
  }>(accessToken, `/messages?${params.toString()}`);
  return {
    messages: (data.messages ?? []).filter(
      (m): m is { id: string; threadId: string } => Boolean(m.id && m.threadId)
    ),
    nextPageToken: data.nextPageToken,
  };
}

/** One row from `threads.list` — id plus list snippet (no per-thread get). */
export type GmailThreadListItem = {
  id: string;
  /** Raw snippet from the list payload (may be HTML-entity encoded). */
  snippet: string;
  /** Thread's history position — the page max seeds history delta polls. */
  historyId?: string;
};

/**
 * Threads matching `query`, one page of up to `maxResults` (Gmail max 500).
 * Spam and Trash need `includeSpamTrash` — see the option.
 * Includes list snippets so callers can skip `threads.get` when unchanged.
 * Pass `pageToken` from a previous response to continue without re-listing.
 */
export async function listRecentThreads(
  accessToken: string,
  query: string,
  maxResults: number,
  pageToken?: string,
  options?: {
    /**
     * Gmail leaves Spam and Trash out of `threads.list` unless this is set,
     * whatever the query says. So `in:spam` and `in:trash` come back empty
     * without it, and quietly — an empty list, not an error.
     */
    includeSpamTrash?: boolean;
  }
): Promise<{ threads: GmailThreadListItem[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });
  if (options?.includeSpamTrash) params.set("includeSpamTrash", "true");
  if (pageToken) params.set("pageToken", pageToken);
  const data = await gmailFetch<{
    threads?: { id: string; snippet?: string; historyId?: string }[];
    nextPageToken?: string;
  }>(accessToken, `/threads?${params.toString()}`);
  return {
    threads: (data.threads ?? []).map((t) => ({
      id: t.id,
      snippet: t.snippet ?? "",
      historyId: t.historyId,
    })),
    nextPageToken: data.nextPageToken,
  };
}

export type GmailHistoryDelta = {
  /** Threads touched since startHistoryId (adds/deletes/label changes). */
  changedThreadIds: Set<string>;
  /** Mailbox history position to store for the next delta poll. */
  historyId: string;
  /** Change log too long to walk — callers should do a full diff instead. */
  incomplete: boolean;
};

/**
 * Change log since a prior historyId — Gmail's official incremental sync.
 * Gmail keeps roughly a week of history; an expired/invalid startHistoryId
 * fails with HTTP 404 (surfaced via the error's `status`), in which case
 * callers must fall back to a full listing.
 */
export async function listGmailHistory(
  accessToken: string,
  startHistoryId: string
): Promise<GmailHistoryDelta> {
  const changedThreadIds = new Set<string>();
  let historyId = startHistoryId;
  let pageToken: string | undefined;
  for (let page = 0; page < 3; page += 1) {
    const params = new URLSearchParams({
      startHistoryId,
      maxResults: "500",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await gmailFetch<{
      history?: {
        messagesAdded?: { message?: { threadId?: string } }[];
        messagesDeleted?: { message?: { threadId?: string } }[];
        labelsAdded?: { message?: { threadId?: string } }[];
        labelsRemoved?: { message?: { threadId?: string } }[];
      }[];
      historyId?: string;
      nextPageToken?: string;
    }>(accessToken, `/history?${params.toString()}`);
    if (data.historyId) historyId = data.historyId;
    for (const entry of data.history ?? []) {
      for (const records of [
        entry.messagesAdded,
        entry.messagesDeleted,
        entry.labelsAdded,
        entry.labelsRemoved,
      ]) {
        for (const record of records ?? []) {
          const threadId = record.message?.threadId;
          if (threadId) changedThreadIds.add(threadId);
        }
      }
    }
    pageToken = data.nextPageToken;
    if (!pageToken) {
      return { changedThreadIds, historyId, incomplete: false };
    }
  }
  return { changedThreadIds, historyId, incomplete: true };
}

/**
 * Thread ids matching `query`, one page of up to `maxResults` (Gmail max 500).
 * Pass `pageToken` from a previous response to continue without re-listing.
 */
export async function listRecentThreadIds(
  accessToken: string,
  query: string,
  maxResults: number,
  pageToken?: string
): Promise<{ ids: string[]; nextPageToken?: string }> {
  const page = await listRecentThreads(
    accessToken,
    query,
    maxResults,
    pageToken
  );
  return {
    ids: page.threads.map((t) => t.id),
    nextPageToken: page.nextPageToken,
  };
}

/** Lightweight fetch: labels/snippet plus only the named headers. */
export async function getMessageMetadata(
  accessToken: string,
  messageId: string,
  headers: string[]
): Promise<GmailMessage> {
  const params = new URLSearchParams({ format: "metadata" });
  for (const h of headers) params.append("metadataHeaders", h);
  return gmailFetch<GmailMessage>(
    accessToken,
    `/messages/${messageId}?${params.toString()}`
  );
}

export type GmailThread = { id: string; messages?: GmailMessage[] };

/** All messages in a thread with labels/snippet + named headers (no bodies). */
export async function getThreadMetadata(
  accessToken: string,
  threadId: string,
  headers: string[]
): Promise<GmailThread> {
  const params = new URLSearchParams({ format: "metadata" });
  for (const h of headers) params.append("metadataHeaders", h);
  return gmailFetch<GmailThread>(
    accessToken,
    `/threads/${threadId}?${params.toString()}`
  );
}

export async function getThreadFull(
  accessToken: string,
  threadId: string
): Promise<GmailThread> {
  return gmailFetch<GmailThread>(accessToken, `/threads/${threadId}?format=full`);
}

/** Message ids + labels only (cheap). Ordered oldest → newest by Gmail. */
export async function getThreadMinimal(
  accessToken: string,
  threadId: string
): Promise<{ id: string; messages?: { id: string; labelIds?: string[] }[] }> {
  return gmailFetch(
    accessToken,
    `/threads/${threadId}?format=minimal`
  );
}

/** Add/remove labels on every message in a thread (archive, mark read, …). */
export async function modifyThreadLabels(
  accessToken: string,
  threadId: string,
  change: { addLabelIds?: string[]; removeLabelIds?: string[] }
): Promise<void> {
  await gmailFetch(accessToken, `/threads/${threadId}/modify`, {
    method: "POST",
    body: {
      addLabelIds: change.addLabelIds ?? [],
      removeLabelIds: change.removeLabelIds ?? [],
    },
  });
}

/**
 * Labels on one message, rather than on every message in its thread.
 *
 * Marking a thread unread makes all of it unread, which is not what "unread"
 * means to a reader: they want the newest message back, not the eleven they
 * already read. Outlook works that way already.
 */
export async function modifyMessageLabels(
  accessToken: string,
  messageId: string,
  change: { addLabelIds?: string[]; removeLabelIds?: string[] }
): Promise<void> {
  await gmailFetch(accessToken, `/messages/${messageId}/modify`, {
    method: "POST",
    body: {
      addLabelIds: change.addLabelIds ?? [],
      removeLabelIds: change.removeLabelIds ?? [],
    },
  });
}

/** User-created Gmail labels (our “folders”). System labels are filtered out. */
export type GmailLabel = {
  id: string;
  name: string;
  type?: "system" | "user";
  threadsTotal?: number;
  threadsUnread?: number;
  messagesTotal?: number;
  messagesUnread?: number;
};

export async function listGmailLabels(
  accessToken: string
): Promise<GmailLabel[]> {
  const data = await gmailFetch<{ labels?: GmailLabel[] }>(
    accessToken,
    "/labels"
  );
  return data.labels ?? [];
}

/** Full label (list endpoint omits thread/message counts). */
export async function getGmailLabel(
  accessToken: string,
  labelId: string
): Promise<GmailLabel> {
  return gmailFetch<GmailLabel>(
    accessToken,
    `/labels/${encodeURIComponent(labelId)}`
  );
}

/**
 * How many threads a label holds, counting only what a search can reach.
 *
 * Not `threadsTotal` from the label itself. That counts a thread wherever it
 * is, Spam and Trash included, while every list in this app leaves those out —
 * so a folder advertised 225 and opened on 1. A number nobody can click
 * through to is worse than no number.
 *
 * Capped: past the cap the exact figure stops being useful, and the list it
 * describes is capped too.
 */
export async function countThreadsForLabel(
  accessToken: string,
  labelName: string,
  cap: number
): Promise<{ count: number; atCap: boolean }> {
  const query = gmailLabelSearchQuery(labelName);
  if (!query) return { count: 0, atCap: false };
  const page = await listRecentThreads(accessToken, query, cap);
  return {
    count: page.threads.length,
    atCap: Boolean(page.nextPageToken),
  };
}

export async function createGmailLabel(
  accessToken: string,
  name: string
): Promise<GmailLabel> {
  return gmailFetch<GmailLabel>(accessToken, "/labels", {
    method: "POST",
    body: {
      name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });
}

export async function renameGmailLabel(
  accessToken: string,
  labelId: string,
  name: string
): Promise<GmailLabel> {
  return gmailFetch<GmailLabel>(
    accessToken,
    `/labels/${encodeURIComponent(labelId)}`,
    {
      method: "PATCH",
      body: { id: labelId, name },
    }
  );
}

export async function deleteGmailLabel(
  accessToken: string,
  labelId: string
): Promise<void> {
  await gmailFetch(accessToken, `/labels/${encodeURIComponent(labelId)}`, {
    method: "DELETE",
  });
}

/** Gmail search clause for a user label (quotes names with spaces). */
export function gmailLabelSearchQuery(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (/[\s"()]/.test(trimmed)) {
    return `label:"${trimmed.replace(/"/g, "")}"`;
  }
  return `label:${trimmed}`;
}

/** Move a thread to Trash (recoverable for ~30 days in Gmail). */
export async function trashThread(
  accessToken: string,
  threadId: string
): Promise<void> {
  await gmailFetch(accessToken, `/threads/${threadId}/trash`, {
    method: "POST",
    body: {},
  });
}

/** Restore a thread from Trash (does not re-add INBOX by itself). */
export async function untrashThread(
  accessToken: string,
  threadId: string
): Promise<void> {
  await gmailFetch(accessToken, `/threads/${threadId}/untrash`, {
    method: "POST",
    body: {},
  });
}

/** Send a raw RFC 2822 message; threadId keeps replies in their conversation. */
export async function sendRawMessage(
  accessToken: string,
  rawRfc822: string,
  threadId?: string
): Promise<{ id: string; threadId?: string }> {
  const raw = utf8ToBase64Url(rawRfc822);
  return gmailFetch<{ id: string; threadId?: string }>(
    accessToken,
    "/messages/send",
    { method: "POST", body: threadId ? { raw, threadId } : { raw } }
  );
}

// ---------------------------------------------------------------------------
// Message parsing helpers
// ---------------------------------------------------------------------------

export function headerValue(message: GmailMessage, name: string): string {
  const header = message.payload?.headers?.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  );
  return header?.value ?? "";
}

/** Parse "Jane Doe <jane@x.org>, bob@y.com" into lowercase addresses. */
export function parseAddressList(raw: string): { email: string; name: string }[] {
  if (!raw.trim()) return [];
  const results: { email: string; name: string }[] = [];
  // Split on commas that are not inside quoted display names.
  const parts = raw.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  for (const part of parts) {
    const angled = part.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
    if (angled) {
      const email = angled[2].trim().toLowerCase();
      if (email.includes("@")) {
        results.push({ email, name: angled[1].trim() });
      }
      continue;
    }
    const bare = part.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (bare) {
      results.push({ email: bare[0].toLowerCase(), name: "" });
    }
  }
  return results;
}

function decodeBase64Url(data: string): string {
  return base64UrlToUtf8(data);
}

function stripHtml(html: string): string {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeHtmlEntities(text).replace(/\n{3,}/g, "\n\n").trim();
}

/** Gmail snippets arrive HTML-escaped (e.g. &#39; for apostrophes). */
export function decodeSnippet(snippet: string): string {
  return decodeHtmlEntities(snippet);
}

/** Extract readable body text, preferring text/plain over stripped HTML. */
export function extractBodyText(message: GmailMessage): string {
  let plain = "";
  let html = "";

  const walk = (part: GmailMessagePart | undefined) => {
    if (!part) return;
    if (part.body?.data && !part.filename) {
      if (part.mimeType === "text/plain" && !plain) {
        plain = decodeBase64Url(part.body.data);
      } else if (part.mimeType === "text/html" && !html) {
        html = decodeBase64Url(part.body.data);
      }
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(message.payload);

  const text = plain.trim() || stripHtml(html);
  // Cap stored bodies; long threads repeat quoted history anyway.
  return text.length > 20_000 ? `${text.slice(0, 20_000)}\n[truncated]` : text;
}

const MAX_INLINE_IMAGE_BYTES = 1_500_000; // per image
const MAX_INLINE_TOTAL_BYTES = 5_000_000; // per message

/**
 * Resolve the message's cid-referenced inline images (newsletter badges,
 * embedded photos) to data: URIs keyed by Content-ID, so the client can
 * substitute them into the HTML body. Oversized or broken parts are skipped.
 */
export async function resolveInlineImages(
  accessToken: string,
  message: GmailMessage,
  bodyHtml: string
): Promise<Record<string, string>> {
  type InlineRef = {
    cid: string;
    mimeType: string;
    size: number;
    data?: string;
    attachmentId?: string;
  };
  const refs: InlineRef[] = [];
  const walk = (part: GmailMessagePart | undefined) => {
    if (!part) return;
    const mimeType = part.mimeType ?? "";
    if (mimeType.startsWith("image/")) {
      const rawCid = part.headers?.find(
        (h) => h.name.toLowerCase() === "content-id"
      )?.value;
      const cid = rawCid?.trim().replace(/^<|>$/g, "");
      if (cid && bodyHtml.includes(`cid:${cid}`)) {
        refs.push({
          cid,
          mimeType,
          size: part.body?.size ?? 0,
          data: part.body?.data,
          attachmentId: part.body?.attachmentId,
        });
      }
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(message.payload);

  const out: Record<string, string> = {};
  let total = 0;
  await Promise.all(
    refs.map(async (ref) => {
      if (ref.size > MAX_INLINE_IMAGE_BYTES) return;
      try {
        const data =
          ref.data ??
          (ref.attachmentId
            ? (
                await gmailFetch<{ data?: string }>(
                  accessToken,
                  `/messages/${message.id}/attachments/${ref.attachmentId}`
                )
              ).data
            : undefined);
        if (!data) return;
        const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
        if (total + b64.length > MAX_INLINE_TOTAL_BYTES) return;
        total += b64.length;
        out[ref.cid] = `data:${ref.mimeType};base64,${b64}`;
      } catch {
        // A missing attachment just leaves that image out.
      }
    })
  );
  return out;
}

/**
 * Extract the raw text/html body for rich display. Returns "" when the
 * message has no HTML part. The client sanitizes before rendering.
 */
export function extractBodyHtml(message: GmailMessage): string {
  let html = "";
  const walk = (part: GmailMessagePart | undefined) => {
    if (!part || html) return;
    if (part.body?.data && !part.filename && part.mimeType === "text/html") {
      html = decodeBase64Url(part.body.data);
      return;
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(message.payload);
  // Cap so a pathological newsletter can't balloon the thread payload.
  return html.length > 500_000 ? "" : html.trim();
}

export type GmailAttachmentMeta = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
};

function partFilename(part: GmailMessagePart): string {
  const direct = part.filename?.trim();
  if (direct) return direct;
  const disposition =
    part.headers?.find((h) => h.name.toLowerCase() === "content-disposition")
      ?.value ?? "";
  const fromDisp =
    /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;\s]+)/i.exec(
      disposition
    );
  if (fromDisp) {
    const raw = fromDisp[1] || fromDisp[2] || fromDisp[3] || "";
    try {
      return decodeURIComponent(raw.replace(/^\s*"|"\s*$/g, "")).trim();
    } catch {
      return raw.replace(/^\s*"|"\s*$/g, "").trim();
    }
  }
  const contentType =
    part.headers?.find((h) => h.name.toLowerCase() === "content-type")?.value ??
    "";
  const fromType = /name="([^"]+)"|name=([^;\s]+)/i.exec(contentType);
  if (fromType) return (fromType[1] || fromType[2] || "").trim();
  return "";
}

/**
 * Named file parts that are real attachments (not cid: images already shown
 * inline in the HTML body). Prefers attachmentId for on-demand fetch; falls
 * back to a synthetic id when Gmail inlined the bytes on the part.
 */
export function extractAttachments(
  message: GmailMessage,
  bodyHtml = ""
): GmailAttachmentMeta[] {
  const out: GmailAttachmentMeta[] = [];
  let dataPartIndex = 0;
  const walk = (part: GmailMessagePart | undefined) => {
    if (!part) return;
    const mimeType = part.mimeType || "application/octet-stream";
    const isCalendar =
      mimeType.toLowerCase().startsWith("text/calendar") ||
      mimeType.toLowerCase() === "application/ics";
    const filename =
      partFilename(part) || (isCalendar ? "invite.ics" : "");
    const attachmentId = part.body?.attachmentId;
    const hasInlineData = Boolean(part.body?.data);
    if (filename && (attachmentId || hasInlineData)) {
      const rawCid = part.headers?.find(
        (h) => h.name.toLowerCase() === "content-id"
      )?.value;
      const cid = rawCid?.trim().replace(/^<|>$/g, "");
      const disposition =
        part.headers
          ?.find((h) => h.name.toLowerCase() === "content-disposition")
          ?.value?.toLowerCase() ?? "";
      /**
       * A part the sender marked as an attachment is one, whatever else is
       * true of it.
       *
       * Without this, a picture that carries a Content-ID — which a mail
       * client gives every image it sends, referenced or not — was dropped
       * as an inline image whenever the same id appeared anywhere in the
       * HTML. A forward quotes the message it forwards, so the quoted
       * history carried the cid and swallowed the file: the list said the
       * thread had attachments, because it applies this test without a body
       * to check against, and the reader showed none.
       */
      const attached = disposition.includes("attachment");
      const inlineImage =
        !attached &&
        Boolean(cid) &&
        mimeType.startsWith("image/") &&
        (bodyHtml.includes(`cid:${cid}`) || disposition.includes("inline"));
      if (!inlineImage) {
        out.push({
          attachmentId: attachmentId || `data:${dataPartIndex++}:${filename}`,
          filename,
          mimeType,
          size: part.body?.size ?? 0,
        });
      }
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(message.payload);
  return out;
}

/**
 * Fetch raw attachment bytes from Gmail (base64url in the response).
 * Synthetic ids from extractAttachments (`data:N:filename`) read the inlined
 * part body when Gmail didn't assign an attachmentId.
 */
export async function getGmailAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<{ data: string; size: number }> {
  const dataMatch = /^data:(\d+):/.exec(attachmentId);
  if (dataMatch) {
    const targetIndex = Number(dataMatch[1]);
    const message = await getMessageFull(accessToken, messageId);
    let dataPartIndex = 0;
    let found: string | undefined;
    const walk = (part: GmailMessagePart | undefined) => {
      if (!part || found) return;
      const mimeType = part.mimeType || "application/octet-stream";
      const isCalendar =
        mimeType.toLowerCase().startsWith("text/calendar") ||
        mimeType.toLowerCase() === "application/ics";
      const filename =
        partFilename(part) || (isCalendar ? "invite.ics" : "");
      if (filename && part.body?.data && !part.body.attachmentId) {
        if (dataPartIndex === targetIndex) found = part.body.data;
        dataPartIndex += 1;
      }
      for (const child of part.parts ?? []) walk(child);
    };
    walk(message.payload);
    if (!found) throw new Error("Attachment data missing");
    return { data: found, size: found.length };
  }

  const data = await gmailFetch<{ data?: string; size?: number }>(
    accessToken,
    `/messages/${messageId}/attachments/${attachmentId}`
  );
  if (!data.data) throw new Error("Attachment data missing");
  return { data: data.data, size: data.size ?? 0 };
}
