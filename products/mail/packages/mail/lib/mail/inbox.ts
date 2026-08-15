import "server-only";

import {
  decodeSnippet,
  extractAttachments,
  extractBodyHtml,
  extractBodyText,
  getGmailAttachment,
  getMessageFull,
  getThreadFull,
  getThreadMetadata,
  getThreadMinimal,
  headerValue,
  gmailLabelSearchQuery,
  listGmailHistory,
  listRecentMessages,
  listRecentThreads,
  modifyMessageLabels,
  modifyThreadLabels,
  parseAddressList,
  resolveInlineImages,
  listMessageIds,
  getMessageMetadata,
  findGmailDraftIdForMessage,
  deleteGmailDraft,
  sendRawMessage,
  trashThread,
  untrashThread,
  type GmailMessage,
  type GmailThread,
} from "@/lib/gmail/api";
import {
  formatInviteChip,
  isCalendarAttachment,
  mimeTreeHasCalendar,
  parseCalendarInvite,
} from "@/lib/mail/ics";
import {
  filterAccountsForScope,
  type MailAccountScope,
} from "@/lib/mail/account-scope";
import { mailStore } from "@/lib/mail/store";
import type { MailListSyncRow } from "@/lib/mail/store/types";
import {
  crmLogoUrlIfLoaded,
  loadCrmContacts,
  resetCrmGate,
} from "@/lib/mail/crm-gate";
import { accessTokenFor } from "@/lib/mail/mail-gmail-token";
import {
  expandMailSearchQuery,
  parenthesizeSearchQuery,
} from "@/lib/mail/expand-search-query";
import {
  adoptSplitThread,
  getChatForThread,
  getChatsForThreads,
  noteChatMessageIds,
} from "@/lib/mail/chats";
import {
  archiveOutlookThread,
  fetchOutlookMailAttachment,
  getOutlookMailThread,
  listOutlookAccountThreads,
  markOutlookThreadRead,
  markOutlookThreadUnread,
  outlookAccessTokenFor,
  sendOutlookMailMessage,
  listScheduledOutlookMessages,
  cancelScheduledOutlookMessage,
  sendScheduledOutlookMessageNow,
  trashOutlookThread,
  unarchiveOutlookThread,
  untrashOutlookThread,
} from "@/lib/mail/outlook-inbox";
import {
  deleteOutlookMessage,
  listConversationMessages,
  listOutlookDraftMessages,
  moveOutlookConversation,
} from "@/lib/outlook/api";
import {
  listConnectedMailAccounts,
  resolveMailProvider,
} from "@/lib/mail/providers";
import type {
  MailMessage,
  MailDraftRow,
  MailScheduledMessage,
  MailThreadDetail,
  MailThreadSummary,
} from "@/lib/mail/types";
import {
  isOwnOrgAddress,
  isOwnPersonalAddress,
  normalizeEmail,
} from "@/lib/own-addresses";
import type { ContactIndex, CrmRecordRef } from "@/lib/crm-contact-index";
import { senderNameFor } from "@/lib/mail/sender-identity";
import { formatFromHeader } from "@/lib/mail/sender-name";
import { getMailSignatureSettings } from "@/lib/mail/settings";
import {
  invalidateInboxCache,
  registerInboxListCacheClear,
  registerMailFullCacheClear,
} from "@/lib/mail/inbox-cache";
import { PlanError } from "@/lib/plan/errors";
import {
  base64UrlToBytes,
  base64UrlToUtf8,
  utf8ToBase64,
  utf8ToBase64Url,
} from "@/lib/base64";

export { invalidateInboxCache, invalidateMailCaches } from "@/lib/mail/inbox-cache";

const CONCURRENCY = 8;
const PER_ACCOUNT_MESSAGES = 100;
// References and In-Reply-To ride along so a provider split can be adopted
// straight from the list — see docs/mail-chat-architecture.md.
const METADATA_HEADERS = [
  "From",
  "To",
  "Cc",
  "Subject",
  "Date",
  "Message-ID",
  "References",
  "In-Reply-To",
  // How the list knows a thread carries a file. `format=metadata` answers
  // headers and no MIME tree, so the parts cannot be walked here — see
  // `gmailMessageHasFile`.
  "Content-Type",
];

/**
 * A message that carries a file somebody attached.
 *
 * The parts are read when they are there, which is exact. They are usually
 * not: the list asks Gmail for metadata, and that answers a payload with no
 * `parts` array. What it does answer is how the message was built, in both
 * `payload.mimeType` and the Content-Type header, so read that instead.
 *
 * `multipart/mixed` is an attachment beside the body; `multipart/related` is
 * a picture inside it, which a signature logo is; `multipart/alternative` is
 * the same body written twice.
 */
function gmailMessageHasFile(m: GmailMessage): boolean {
  const parts = extractAttachments(m, "");
  if (parts.length) return parts.some((a) => !isCalendarAttachment(a));
  const built = `${m.payload?.mimeType ?? ""} ${headerValue(m, "Content-Type")}`;
  return built.toLowerCase().includes("multipart/mixed");
}

/**
 * Stored list pages are rows we wrote, so a row written before a field
 * existed will never grow one — the page is reused whole while its snippet
 * is unchanged, and a thread nobody replies to is never rewritten.
 *
 * Bump this when a row gains a field the list draws, and the stored pages go
 * once. They are a cache: losing them costs one slow poll.
 */
const LIST_ROW_SHAPE = "3";
const LIST_ROW_SHAPE_KEY = "mail_list_row_shape";
let listShapeChecked = false;

async function dropListRowsFromAnOlderShape(): Promise<void> {
  if (listShapeChecked) return;
  listShapeChecked = true;
  try {
    const stored = await mailStore().settings.get(LIST_ROW_SHAPE_KEY);
    if (stored === LIST_ROW_SHAPE) return;
    await mailStore().listSync.clear();
    await mailStore().settings.set(LIST_ROW_SHAPE_KEY, LIST_ROW_SHAPE);
  } catch {
    // Best effort. A stale page is a missing clip, not a wrong inbox.
  }
}

/** Normalize RFC 822 Message-ID for snooze / cross-mailbox matching. */
function normalizeRfcMessageId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.replace(/^<|>$/g, "");
}

/**
 * Own addresses whose self-mail (notes/forwards into the work inbox) should
 * file under Other rather than In CRM.
 */
/** Optional self-addresses that should file under Other (comma-separated env). */
const NOT_CRM_SELF_ADDRESSES = new Set(
  (process.env.MAIL_OWN_PERSONAL_ADDRESSES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizeEmail)
);

export { accessTokenFor } from "@/lib/mail/mail-gmail-token";

/** Surfaces Gmail's 403 (old readonly token) as an actionable message. */
function translateGmailError(err: unknown, accountEmail: string): never {
  const status = (err as Error & { status?: number }).status;
  if (status === 403) {
    throw new PlanError(
      `The Gmail connection for ${accountEmail} is read-only — reconnect the account to enable sending and archiving.`,
      403
    );
  }
  throw err;
}

// ---------------------------------------------------------------------------
// People / everything-else classification (CRM contact matcher)
// ---------------------------------------------------------------------------

type Classifier = {
  contacts: ContactIndex;
  domains: Map<string, CrmRecordRef[]>;
};

let classifierCache: { value: Classifier; expiresAt: number } | null = null;
/** One in-flight build — parallel /threads?account=… must not stampede Postgres. */
let classifierInflight: Promise<Classifier> | null = null;

/**
 * The classifier is cached for the whole process, not per owner. On the planner
 * the CRM index is org-wide, so that is right. The public flavor reads one
 * user's address books, and that host has a single owner.
 */
async function getClassifier(ownerId: string): Promise<Classifier> {
  if (classifierCache && classifierCache.expiresAt > Date.now()) {
    return classifierCache.value;
  }
  if (classifierInflight) return classifierInflight;

  classifierInflight = (async () => {
    let contacts: ContactIndex;
    let domains: Map<string, CrmRecordRef[]>;
    const crm = await loadCrmContacts();
    if (crm) {
      contacts = await crm.buildContactIndex();
      domains = crm.buildContactDomainIndex();
    } else {
      // Public: People = address-book emails only (no CRM org-domain matching).
      const people = await import("@/lib/mail/people-contacts");
      contacts = await people.buildPeopleContactIndex(ownerId);
      domains = new Map();
    }
    const value = { contacts, domains };
    classifierCache = {
      value,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    return value;
  })().finally(() => {
    classifierInflight = null;
  });

  return classifierInflight;
}

function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "";
}

function isKnownContact(email: string, classifier: Classifier): boolean {
  return (
    classifier.contacts.has(email) ||
    classifier.domains.has(emailDomain(email))
  );
}

/** CRM record name a contact belongs to (for the People view's affiliation label). */
function crmNameFor(email: string, classifier: Classifier): string | undefined {
  const byEmail = classifier.contacts.get(email);
  if (byEmail?.length) return byEmail[0].recordName;
  const byDomain = classifier.domains.get(emailDomain(email));
  return byDomain?.length ? byDomain[0].recordName : undefined;
}

function crmLogoFor(email: string, classifier: Classifier): string | undefined {
  return crmLogoUrlIfLoaded(email, classifier.contacts, classifier.domains);
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Unified inbox listing
// ---------------------------------------------------------------------------

function messageDate(message: GmailMessage): number {
  const internal = Number(message.internalDate ?? 0);
  if (internal) return internal;
  const header = Date.parse(headerValue(message, "Date"));
  return Number.isFinite(header) ? header : 0;
}

function displayName(entry: { email: string; name: string }): string {
  if (entry.name) return entry.name;
  return entry.email;
}

/**
 * Invite detection is expensive (it probes full payloads of up to six
 * messages per meeting-looking thread), and a thread's invite status can
 * only change when a new message arrives — so memoize per latest message.
 */
const gmailCalendarCache = new Map<
  string,
  { hasCalendarInvite: boolean; calendarInviteWhen?: string }
>();
const GMAIL_CALENDAR_CACHE_MAX = 5000;

/** Build a list row from Gmail thread metadata (no bodies). */
async function summarizeGmailThread(options: {
  token: string;
  accountEmail: string;
  thread: GmailThread;
  classifier: Classifier;
  focusMessageId?: string;
  resolveCalendar?: boolean;
}): Promise<{
  summary: MailThreadSummary;
  latestRfcId: string;
  latestReferences?: string;
} | null> {
  const { token, accountEmail, thread, classifier, focusMessageId } = options;
  const threadMessages = [...(thread.messages ?? [])];
  if (threadMessages.length === 0) return null;

  threadMessages.sort((a, b) => messageDate(a) - messageDate(b));
  const latest = threadMessages[threadMessages.length - 1];

  const participants = threadMessages.flatMap((m) => [
    ...parseAddressList(headerValue(m, "From")),
    ...parseAddressList(headerValue(m, "To")),
    ...parseAddressList(headerValue(m, "Cc")),
  ]);
  // Own mailbox(es), not colleagues — sent mail should face the To recipient.
  const external = participants.filter(
    (p) => !isSelfAddress(p.email, accountEmail)
  );
  const matchesContact = external.some((p) =>
    isKnownContact(p.email, classifier)
  );
  const fromNotCrmSelf = threadMessages.some((m) => {
    const from = parseAddressList(headerValue(m, "From"))[0];
    return from && NOT_CRM_SELF_ADDRESSES.has(normalizeEmail(from.email));
  });

  const tab: MailThreadSummary["tab"] =
    matchesContact || (external.length === 0 && !fromNotCrmSelf)
      ? "people"
      : "other";

  const latestFrom = parseAddressList(headerValue(latest, "From"))[0];
  // When the tip is from us (Sent / reply we sent), lead with the first To
  // on that message — never ourselves.
  const latestToExternal = parseAddressList(headerValue(latest, "To")).filter(
    (p) => !isSelfAddress(p.email, accountEmail)
  );
  const counterpart =
    latestFrom && !isSelfAddress(latestFrom.email, accountEmail)
      ? latestFrom
      : latestToExternal[0] ??
        external[0] ??
        latestFrom ?? { email: accountEmail, name: "" };

  const externalByEmail = new Map<string, { name: string; email: string }>();
  for (const p of external) {
    const existing = externalByEmail.get(p.email);
    if (!existing) externalByEmail.set(p.email, { ...p });
    else if (p.name) existing.name = p.name;
  }

  const subject = headerValue(latest, "Subject").trim() || "(no subject)";
  const snippet = decodeSnippet(latest.snippet ?? "");
  const calKey = `${accountEmail}|${thread.id}|${latest.id}`;
  let cal =
    options.resolveCalendar === false
      ? { hasCalendarInvite: false as const }
      : gmailCalendarCache.get(calKey);
  if (!cal) {
    cal = await resolveGmailCalendarInvite(
      token,
      threadMessages,
      latest,
      subject,
      snippet
    );
    if (gmailCalendarCache.size >= GMAIL_CALENDAR_CACHE_MAX) {
      const oldest = gmailCalendarCache.keys().next().value;
      if (oldest != null) gmailCalendarCache.delete(oldest);
    }
    gmailCalendarCache.set(calKey, cal);
  }

  return {
    summary: {
      account: accountEmail,
      threadId: thread.id,
      subject,
      fromName: displayName(counterpart),
      fromEmail: counterpart.email,
      snippet,
      lastAt: new Date(messageDate(latest)).toISOString(),
      unread: threadMessages.some((m) =>
        (m.labelIds ?? []).includes("UNREAD")
      ),
      messageCount: threadMessages.length,
      tab,
      externalParticipants: [...externalByEmail.values()],
      crmName: crmNameFor(counterpart.email, classifier),
      crmLogoUrl: crmLogoFor(counterpart.email, classifier),
      ...(focusMessageId ? { focusMessageId } : null),
      // A file somebody attached, not a logo in a signature. Reading the
      // parts costs nothing here: the metadata is already in hand.
      ...(threadMessages.some(gmailMessageHasFile)
        ? { hasAttachments: true }
        : null),
      ...(cal.hasCalendarInvite
        ? {
            hasCalendarInvite: true,
            ...(cal.calendarInviteWhen
              ? { calendarInviteWhen: cal.calendarInviteWhen }
              : null),
          }
        : null),
    },
    latestRfcId: headerValue(latest, "Message-ID").trim(),
    latestReferences:
      [headerValue(latest, "References"), headerValue(latest, "In-Reply-To")]
        .join(" ")
        .trim() || undefined,
  };
}

function gmailMessageLooksLikeInvite(
  subject: string,
  snippet: string
): boolean {
  return /invite|attend|rsvp|teams meeting|zoom\.|meet\.google|icalendar|\.ics|calendar|meeting request/i.test(
    `${subject}\n${snippet}`
  );
}

function gmailHasCalendarPart(m: GmailMessage): boolean {
  if (mimeTreeHasCalendar(m.payload)) return true;
  if (extractAttachments(m, "").some(isCalendarAttachment)) return true;
  return headerValue(m, "Content-Type").toLowerCase().includes("text/calendar");
}

/** Detect .ics / meeting parts and parse a short when-label for the list chip. */
async function resolveGmailCalendarInvite(
  token: string,
  threadMessages: GmailMessage[],
  _latest: GmailMessage,
  _subject: string,
  _snippet: string
): Promise<{ hasCalendarInvite: boolean; calendarInviteWhen?: string }> {
  const calendarAtt = (m: GmailMessage) =>
    extractAttachments(m, "").find(isCalendarAttachment);

  let host =
    threadMessages.find((m) => gmailHasCalendarPart(m)) ?? null;

  // Metadata often omits nested MIME parts. Invites usually sit on an older
  // message while the list tip is a later reply — so scan oldest-first with
  // full payloads when the thread looks meeting-related (or is short).
  if (!host) {
    const looksMeeting =
      threadMessages.length <= 4 ||
      threadMessages.some((m) =>
        gmailMessageLooksLikeInvite(
          headerValue(m, "Subject"),
          m.snippet ?? ""
        )
      );
    if (looksMeeting) {
      for (const m of threadMessages.slice(0, 6)) {
        if (gmailHasCalendarPart(m)) {
          host = m;
          break;
        }
        const full = await getMessageFull(token, m.id).catch(() => null);
        if (full && gmailHasCalendarPart(full)) {
          host = full;
          break;
        }
      }
    }
  }

  if (!host) return { hasCalendarInvite: false };

  const att = calendarAtt(host);
  if (!att) return { hasCalendarInvite: true };

  try {
    const { data } = await getGmailAttachment(
      token,
      host.id,
      att.attachmentId
    );
    const text = base64UrlToUtf8(data);
    const parsed = parseCalendarInvite(text);
    const when = parsed ? formatInviteChip(parsed) : null;
    return {
      hasCalendarInvite: true,
      ...(when ? { calendarInviteWhen: when } : null),
    };
  } catch {
    return { hasCalendarInvite: true };
  }
}

type InboxCacheEntry = {
  value: { threads: MailThreadSummary[]; nextCursor: string | null };
  expiresAt: number;
};
const inboxCache = new Map<string, InboxCacheEntry>();

/** Prior Gmail first-page rows for list-diff polls (survives fresh=1). */
type GmailPriorRow = {
  /** Decoded snippet from the last threads.list response. */
  listSnippet: string;
  summary: MailThreadSummary;
  latestRfcId: string;
  latestReferences?: string;
};
type GmailPriorPage = Map<string, Map<string, GmailPriorRow>>; // account → threadId → row
const gmailPriorPages = new Map<string, GmailPriorPage>();


/**
 * State each prior first page was built at (cacheKey → account): the history
 * position lets the next incremental poll ask Gmail's history API "what
 * changed since?" instead of re-listing and diffing snippets, and the page
 * token re-emits the load-more cursor when the page is served unchanged.
 */
type GmailPriorPageState = { historyId: string; nextPageToken?: string };
const gmailPriorHistoryIds = new Map<string, Map<string, GmailPriorPageState>>();

/** Later of two numeric-string Gmail history ids (avoids BigInt). */
function newerHistoryId(
  a: string | null,
  b: string | null | undefined
): string | null {
  if (!b || !/^\d+$/.test(b)) return a;
  if (!a) return b;
  if (b.length !== a.length) return b.length > a.length ? b : a;
  return b > a ? b : a;
}

registerInboxListCacheClear(() => {
  inboxCache.clear();
});
registerMailFullCacheClear(() => {
  gmailPriorPages.clear();
  gmailPriorHistoryIds.clear();
  void mailStore().listSync.clear();
  classifierCache = null;
  classifierInflight = null;
  resetCrmGate();
});

/** The stored views a thread leaves when it leaves the inbox. */
const INBOX_LIKE_FOLDERS = ["inbox"] as const;

/**
 * Take a thread out of the page we stored, not only out of the caches.
 *
 * Archiving cleared the thirty-second memo and nothing else, so the row
 * survived in `gmailPriorPages` and in `list_sync_state`. That would be
 * harmless if every list came from a fresh listing, but the incremental path
 * has a branch that serves the stored page verbatim when Gmail's history
 * reports nothing changed — and that branch never asks Gmail what is in the
 * inbox. So an archived thread could come back on the next Sync, from our own
 * copy of a list that was already out of date.
 *
 * The history delta is not something to lean on here either: Gmail keeps
 * about a week of it, answers `incomplete` on a long gap, and 404s on an
 * expired id. Any of those leaves the delta empty while the stale row is
 * still stored.
 *
 * Best effort on purpose. Failing to tidy a cache must never fail the archive
 * that the provider has already accepted — and it is only called once the
 * provider has accepted it. A thread the provider refused to archive is still
 * in the inbox, and taking its row out here would hide a thread that is
 * really there, which is the worse of the two mistakes.
 */
export async function forgetThreadInStoredPages(
  clerkUserId: string,
  account: string,
  threadId: string
): Promise<void> {
  // In memory, from every view. A row taken out of a page it should not have
  // left costs one metadata fetch to put back; a row left in a page it should
  // have left is the bug this exists for.
  for (const byAccount of gmailPriorPages.values()) {
    byAccount.get(account)?.delete(threadId);
  }

  try {
    for (const folder of INBOX_LIKE_FOLDERS) {
      const stored = await mailStore().listSync.load(clerkUserId, folder, [
        account,
      ]);
      const entry = stored.get(account);
      if (!entry) continue;
      const rows = entry.rows.filter((row) => row.threadId !== threadId);
      if (rows.length === entry.rows.length) continue;
      await mailStore().listSync.save(clerkUserId, folder, account, {
        rows,
        historyId: entry.historyId,
        nextPageToken: entry.nextPageToken,
      });
    }
  } catch (err) {
    console.warn("[mail] could not drop the stored list row:", err);
  }
}

/** Opaque multi-account Gmail list cursor (base64url JSON of email → pageToken). */
export function encodeMailListCursor(
  tokens: Record<string, string>
): string | null {
  const cleaned: Record<string, string> = {};
  for (const [email, token] of Object.entries(tokens)) {
    if (email && token) cleaned[email] = token;
  }
  if (Object.keys(cleaned).length === 0) return null;
  return utf8ToBase64Url(JSON.stringify(cleaned));
}

export function decodeMailListCursor(
  cursor: string | undefined | null
): Record<string, string> | null {
  if (!cursor?.trim()) return null;
  try {
    const parsed = JSON.parse(
      base64UrlToUtf8(cursor)
    ) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const out: Record<string, string> = {};
    for (const [email, token] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      if (typeof email === "string" && typeof token === "string" && token) {
        out[email] = token;
      }
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

export async function listUnifiedInbox(options: {
  /** Skip the server-side cache (manual refresh). */
  fresh?: boolean;
  /**
   * Cheap Gmail poll: list ids+snippets and reuse prior metadata when the
   * list snippet is unchanged (read-state drift is reconciled via an extra
   * ids-only unread listing). Ignored for search, labels, and load-more.
   * The periodic full reconcile poll should omit this.
   */
  incremental?: boolean;
  /** Restrict to one account email, or undefined for all. */
  account?: string;
  /** Gmail search terms appended to the folder query. */
  q?: string;
  /** Which Gmail view to list; defaults to the inbox. */
  folder?: "inbox" | "sent" | "trash" | "junk" | "archived";
  /**
   * User “folder” (Gmail label). When set, lists that label instead of
   * inbox/sent; search stays scoped inside the folder.
   */
  label?: string;
  /**
   * When searching (`q` set) without a label, keep the inbox/sent folder
   * constraint instead of searching all mail. Used for “Current folder”.
   */
  folderScoped?: boolean;
  /**
   * Which mailboxes belong in this inbox. Native shells pass "personal"
   * (dh Mail) or "planner"; the browser keeps the unified "all" view.
   */
  scope?: MailAccountScope;
  /** Local owner of the Mail view — required for per-user mailboxes. */
  clerkUserId: string;
  /** Let a search reach Trash and Junk as well. Ignored while browsing. */
  includeDeleted?: boolean;
  /**
   * Continue a previous list page. Opaque cursor from `nextCursor`; when set,
   * only accounts with remaining pages are fetched (no full re-list).
   */
  cursor?: string | null;
}): Promise<{
  accounts: string[];
  threads: MailThreadSummary[];
  /** Pass back as `cursor` to hydrate the next page only. Null = end. */
  nextCursor: string | null;
}> {
  // Before anything reads the stored rows. The first list after a reload is
  // not an incremental poll, so a check further down would let the old rows
  // hydrate the page and never be dropped.
  await dropListRowsFromAnOlderShape();

  const scope = options.scope ?? "all";
  // Browse stays shell-scoped (planner vs personal). Search uses every
  // in-tab mailbox so "Search all mail" can find personal threads from
  // the planner shell (and vice versa) — matches the search-box copy.
  const hasSearchQuery = Boolean(options.q?.trim());
  const allAccounts = filterAccountsForScope(
    await listConnectedMailAccounts(options.clerkUserId),
    hasSearchQuery ? "all" : scope
  );
  const accountEmails = allAccounts
    .map((a) => a.email)
    .filter((email) => !options.account || email === options.account);
  const providerByEmail = new Map(
    allAccounts.map((a) => [a.email, a.provider] as const)
  );

  const folder = options.folder ?? "inbox";
  const label = options.label?.trim() || "";
  const pageTokens = decodeMailListCursor(options.cursor);
  const isContinuation = pageTokens != null;
  // Include clerkUserId so two admins who share mailboxes never reuse each
  // other's first-page / prior-history state on the same Node process.
  const cacheKey = `${options.clerkUserId}|${label ? `label:${label}` : folder}|${accountEmails.join(",")}|${options.q ?? ""}`;
  // Only the first page is cached; later pages are fetched on demand.
  const cached =
    options.fresh || isContinuation ? undefined : inboxCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      accounts: allAccounts.map((a) => a.email),
      threads: cached.value.threads,
      nextCursor: cached.value.nextCursor,
    };
  }

  const classifier = await getClassifier(options.clerkUserId);
  // Gmail keeps Spam and Trash out of threads.list unless asked, whatever
  // the query says — an empty list rather than an error.
  // Browsing Trash or Junk is asking for them. A search is not, unless the
  // reader says so: a query that quietly returned deleted mail would put
  // threads in the results that they had already decided against.
  // Read from the option rather than `rawQ`, which is built further down.
  const includeSpamTrash =
    folder === "trash" ||
    folder === "junk" ||
    (Boolean(options.q?.trim()) && Boolean(options.includeDeleted));
  const folderQuery = label
    ? gmailLabelSearchQuery(label)
    : // Archived is Gmail's own definition of it: a conversation is
      // archived by taking the inbox label off it, so archived is
      // everything without that label. Sent and drafts are taken back out —
      // they are not in the inbox either, and nobody looking for what they
      // filed away means the mail they wrote. Spam and Bin are already out,
      // because a bare Gmail search does not reach them.
      folder === "archived"
      ? "-in:inbox -in:sent -in:draft"
      : folder === "sent"
        ? "in:sent"
      // Trash is the one place a bare search will not reach, which is why it
      // has to be asked for by name. See the note below.
      : folder === "trash"
        ? "in:trash"
        : folder === "junk"
          ? "in:spam"
          : "in:inbox";
  // Folder view: search stays inside the label. Inbox/sent browse without a
  // query stays scoped; a bare search covers all mail (excl. spam/trash) so
  // archived threads stay findable. `folderScoped` keeps inbox/sent when the
  // UI asks for “Current folder” search.
  // Expand single-word stems (øjenhospital → … OR øjenhospitalet) so Gmail's
  // whole-token matching behaves closer to Outlook.
  const rawQ = options.q?.trim() ?? "";
  const q = rawQ ? expandMailSearchQuery(rawQ) : "";
  const qForFolder = q ? parenthesizeSearchQuery(q) : "";
  const query = label
    ? qForFolder
      ? `${folderQuery} ${qForFolder}`
      : folderQuery
    : qForFolder
      ? options.folderScoped
        ? `${folderQuery} ${qForFolder}`
        : qForFolder
      : folderQuery;

  // First page: every account. Load-more: only accounts that still have a token.
  const fetchEmails = isContinuation
    ? accountEmails.filter((email) => pageTokens[email])
    : accountEmails;

  // Cheap Gmail polls: list + reuse metadata when snippets match. Not for
  // search, label folders, or pagination (those need a full rebuild).
  const useGmailIncremental = Boolean(
    options.incremental &&
      !isContinuation &&
      !q &&
      !label
  );

  /**
   * Prior pages live in RAM for speed, but Amplify SSR runs many short-lived
   * Node processes. A process that starts cold would otherwise re-list and
   * metadata-fetch every thread in the page, so hydrate the maps from Postgres
   * first and let the normal history-delta path take over.
   */
  if (useGmailIncremental && !gmailPriorPages.get(cacheKey)?.size) {
    const stored = await mailStore().listSync.load(
      options.clerkUserId,
      folder,
      fetchEmails
    );
    if (stored.size) {
      const prior: GmailPriorPage = gmailPriorPages.get(cacheKey) ?? new Map();
      const states =
        gmailPriorHistoryIds.get(cacheKey) ??
        new Map<string, GmailPriorPageState>();
      for (const [email, entry] of stored) {
        const byThread = new Map<string, GmailPriorRow>();
        for (const row of entry.rows) {
          byThread.set(row.threadId, {
            listSnippet: row.listSnippet,
            summary: row.summary,
            latestRfcId: row.latestRfcId,
            latestReferences: row.latestReferences,
          });
        }
        if (!byThread.size) continue;
        prior.set(email, byThread);
        // Without a history id the rows still serve the cheaper snippet diff.
        if (entry.historyId) {
          states.set(email, {
            historyId: entry.historyId,
            nextPageToken: entry.nextPageToken ?? undefined,
          });
        }
      }
      if (prior.size) gmailPriorPages.set(cacheKey, prior);
      if (states.size) gmailPriorHistoryIds.set(cacheKey, states);
    }
  }

  /*
   * Active snoozes hide their threads — at the end of the fetch, not the
   * start. Snoozed rows travel the whole way and are held back only at the
   * final filter, where their current tip is known. That is what lets a
   * new reply wake a snooze (the tip is no longer the one that was put to
   * sleep), and it keeps the rows in the stored incremental pages — so a
   * wake needs no cache to expire: the next poll replays the page, and the
   * filter simply stops holding the thread back.
   *
   * The map remembers each snooze's stored tip; the set hides sibling
   * copies of the same thread in other mailboxes, matched after dedupe.
   */
  const snoozed = await mailStore().snoozes.listActive();
  const snoozedByKey = new Map<string, string | null>();
  for (const r of snoozed) {
    snoozedByKey.set(
      `${r.accountEmail}|${r.threadId}`,
      normalizeRfcMessageId(r.tipMessageId)
    );
  }
  const snoozedTipIds = new Set(
    snoozed
      .map((r) => normalizeRfcMessageId(r.tipMessageId))
      .filter((id): id is string => Boolean(id))
  );

  const nextTokens: Record<string, string> = {};
  const summaries: {
    summary: MailThreadSummary;
    latestRfcId: string;
    latestReferences?: string;
  }[] = [];
  /** Per-account list snippets from this fetch (feeds gmailPriorPages). */
  const gmailListSnippetsByAccount = new Map<string, Map<string, string>>();
  /** First-page state per account from this fetch (feeds delta polls). */
  const pageStateByAccount = new Map<string, GmailPriorPageState>();
  // Per-account failures are swallowed so one dead mailbox doesn't blank the
  // whole inbox — but if every account fails we must not return threads:[]
  // (clients cache that as “inbox zero”).
  let accountFetchAttempts = 0;
  let accountFetchFailures = 0;

  await Promise.all(
    fetchEmails.map(async (accountEmail) => {
      const provider = providerByEmail.get(accountEmail) ?? "gmail";
      accountFetchAttempts += 1;
      try {
        if (provider === "outlook") {
          const result = await listOutlookAccountThreads({
            accountEmail,
            folder,
            q,
            label: label || undefined,
            pageToken: pageTokens?.[accountEmail],
            maxConversations: PER_ACCOUNT_MESSAGES,
            classifier,
            notCrmSelfAddresses: NOT_CRM_SELF_ADDRESSES,
          });
          if (result.nextPageToken) {
            nextTokens[accountEmail] = result.nextPageToken;
          }
          summaries.push(...result.summaries);
          return;
        }

        // Gmail: list threads so sent replies update the latest snippet/date.
        // Search uses the messages list so we can deep-link to the hit.
        const token = await accessTokenFor(accountEmail);
        const priorForAccount = useGmailIncremental
          ? gmailPriorPages.get(cacheKey)?.get(accountEmail)
          : undefined;

        // Gmail history delta — the official incremental sync. One cheap call
        // answers "did anything change since the prior page was built?".
        // Unchanged → serve the prior page with no further API calls; changed
        // → list for order + metadata-fetch only dirty/new ids. Expired (404),
        // failed, or too-long histories fall back to the snippet diff below.
        let dirtyIds: Set<string> | null = null;
        let deltaHistoryId: string | null = null;
        const storedState = priorForAccount?.size
          ? gmailPriorHistoryIds.get(cacheKey)?.get(accountEmail)
          : undefined;
        if (storedState) {
          try {
            const delta = await listGmailHistory(token, storedState.historyId);
            if (!delta.incomplete) {
              dirtyIds = delta.changedThreadIds;
              deltaHistoryId = delta.historyId;
            }
          } catch {
            /* expired or transient — take the snippet-diff path */
          }
        }

        if (dirtyIds?.size === 0 && priorForAccount?.size) {
          // Nothing changed — the prior page is authoritative as-is.
          const listSnippetById = new Map<string, string>();
          for (const [threadId, row] of priorForAccount) {
            listSnippetById.set(threadId, row.listSnippet);
            const { chat: _chat, ...rest } = row.summary;
            summaries.push({ summary: rest, latestRfcId: row.latestRfcId });
          }
          if (storedState?.nextPageToken) {
            nextTokens[accountEmail] = storedState.nextPageToken;
          }
          gmailListSnippetsByAccount.set(accountEmail, listSnippetById);
          if (deltaHistoryId) {
            pageStateByAccount.set(accountEmail, {
              historyId: deltaHistoryId,
              nextPageToken: storedState?.nextPageToken,
            });
          }
          return;
        }

        // History named the dirty set: reorder via a cheap threads.list, but
        // metadata-fetch only dirty / brand-new ids (not the whole first page).
        if (dirtyIds && dirtyIds.size > 0 && priorForAccount?.size && !q) {
          const page = await listRecentThreads(
            token,
            query,
            PER_ACCOUNT_MESSAGES,
            pageTokens?.[accountEmail],
            { includeSpamTrash }
          );
          if (page.nextPageToken) {
            nextTokens[accountEmail] = page.nextPageToken;
          }
          const listed = page.threads;
          const listSnippetById = new Map<string, string>();
          const idsToFetch: string[] = [];

          for (const item of listed) {
            const listSnippet = decodeSnippet(item.snippet);
            listSnippetById.set(item.id, listSnippet);
            const prior = priorForAccount.get(item.id);
            if (!prior || dirtyIds.has(item.id)) {
              idsToFetch.push(item.id);
            }
          }

          const fetchedById = new Map<
            string,
            {
              summary: MailThreadSummary;
              latestRfcId: string;
              latestReferences?: string;
            }
          >();
          if (idsToFetch.length) {
            const threads = await mapWithConcurrency(idsToFetch, (id) =>
              getThreadMetadata(token, id, METADATA_HEADERS)
            );
            for (const thread of threads) {
              if (!thread?.id) continue;
              const entry = await summarizeGmailThread({
                token,
                accountEmail,
                thread,
                classifier,
              });
              if (entry) fetchedById.set(thread.id, entry);
            }
          }

          // Emit in list order so the first page stays newest-first.
          for (const item of listed) {
            const fetched = fetchedById.get(item.id);
            if (fetched) {
              summaries.push(fetched);
              continue;
            }
            const prior = priorForAccount.get(item.id);
            if (prior && !dirtyIds.has(item.id)) {
              const { chat: _chat, ...rest } = prior.summary;
              summaries.push({
                summary: rest,
                latestRfcId: prior.latestRfcId,
                latestReferences: prior.latestReferences,
              });
            }
          }

          gmailListSnippetsByAccount.set(accountEmail, listSnippetById);
          let pageHistoryId = deltaHistoryId;
          for (const item of listed) {
            pageHistoryId = newerHistoryId(pageHistoryId, item.historyId);
          }
          if (pageHistoryId) {
            pageStateByAccount.set(accountEmail, {
              historyId: pageHistoryId,
              nextPageToken: nextTokens[accountEmail],
            });
          }
          return;
        }

        // History unavailable: reused rows can't see read-state changes (they
        // don't alter list snippets), so reconcile unread via a cheap
        // ids-only unread listing, fetched alongside the main list.
        const unreadIdsPromise =
          priorForAccount?.size && dirtyIds == null
            ? listRecentThreads(
                token,
                `${query} is:unread`,
                PER_ACCOUNT_MESSAGES,
                undefined,
                { includeSpamTrash }
              )
                .then((p) => new Set(p.threads.map((t) => t.id)))
                .catch(() => null)
            : Promise.resolve(null);
        const focusByThread = new Map<string, string>();
        let listed: { id: string; snippet: string; historyId?: string }[] =
          [];

        if (q) {
          const page = await listRecentMessages(
            token,
            query,
            PER_ACCOUNT_MESSAGES,
            pageTokens?.[accountEmail]
          );
          if (page.nextPageToken) {
            nextTokens[accountEmail] = page.nextPageToken;
          }
          for (const m of page.messages) {
            if (focusByThread.has(m.threadId)) continue;
            focusByThread.set(m.threadId, m.id);
            listed.push({ id: m.threadId, snippet: "" });
          }
        } else {
          const page = await listRecentThreads(
            token,
            query,
            PER_ACCOUNT_MESSAGES,
            pageTokens?.[accountEmail],
            { includeSpamTrash }
          );
          if (page.nextPageToken) {
            nextTokens[accountEmail] = page.nextPageToken;
          }
          listed = page.threads;
        }

        // Incremental list-diff: reuse prior metadata when the list snippet
        // is unchanged. Search / labels / load-more always take the full path.
        const unreadIds = await unreadIdsPromise;
        const idsToFetch: string[] = [];
        /** list snippet per thread id (for prior-page cache after build). */
        const listSnippetById = new Map<string, string>();

        for (const item of listed) {
          const listSnippet = decodeSnippet(item.snippet);
          listSnippetById.set(item.id, listSnippet);
          const prior = priorForAccount?.get(item.id);
          if (prior && prior.listSnippet === listSnippet) {
            const { chat: _chat, ...rest } = prior.summary;
            if (unreadIds) rest.unread = unreadIds.has(item.id);
            summaries.push({
              summary: rest,
              latestRfcId: prior.latestRfcId,
              latestReferences: prior.latestReferences,
            });
          } else {
            idsToFetch.push(item.id);
          }
        }

        if (idsToFetch.length) {
          const threads = await mapWithConcurrency(idsToFetch, (id) =>
            getThreadMetadata(token, id, METADATA_HEADERS)
          );
          for (const thread of threads) {
            if (!thread?.id) continue;
            const entry = await summarizeGmailThread({
              token,
              accountEmail,
              thread,
              classifier,
              focusMessageId: focusByThread.get(thread.id),
            });
            if (entry) summaries.push(entry);
          }
        }

        // Remember list snippets on this account's rows for the next cheap poll.
        gmailListSnippetsByAccount.set(accountEmail, listSnippetById);
        // Snapshot the history position for the next delta poll (page max —
        // replaying a change twice is harmless, so a floor is fine).
        let pageHistoryId = deltaHistoryId;
        for (const item of listed) {
          pageHistoryId = newerHistoryId(pageHistoryId, item.historyId);
        }
        if (pageHistoryId) {
          pageStateByAccount.set(accountEmail, {
            historyId: pageHistoryId,
            nextPageToken: nextTokens[accountEmail],
          });
        }
      } catch (err) {
        accountFetchFailures += 1;
        // Auth failures already log a one-liner in accessTokenFor — no stack dump.
        const msg = err instanceof Error ? err.message : String(err);
        if (!/needs reconnect|invalid_grant/i.test(msg)) {
          console.warn(`[mail] inbox fetch failed for ${accountEmail}: ${msg}`);
        }
      }
    })
  );

  if (
    accountFetchAttempts > 0 &&
    accountFetchFailures === accountFetchAttempts
  ) {
    throw new PlanError(
      "Couldn't load inbox from any connected account",
      502
    );
  }

  // The same conversation often lands in several of our mailboxes (cc'd
  // copies); keep one row per conversation, identified by the newest
  // message's RFC 822 id. Any copy being unread keeps the row unread.
  // Hold back snoozed rows — or wake them, when the thread has moved on.
  summaries.sort(
    (a, b) => Date.parse(b.summary.lastAt) - Date.parse(a.summary.lastAt)
  );
  const seen = new Map<string, MailThreadSummary>();
  const deduped: MailThreadSummary[] = [];
  /** Snoozes ended early by a new reply; removed from the store below. */
  const wokenByReply = new Set<string>();
  /** References of each row's newest message, for split adoption below. */
  const adoptHints = new Map<string, string>();
  for (const { summary, latestRfcId, latestReferences } of summaries) {
    const tipKey = normalizeRfcMessageId(latestRfcId);
    const snoozeKey = `${summary.account}|${summary.threadId}`;
    const storedTip = snoozedByKey.get(snoozeKey);
    if (snoozedByKey.has(snoozeKey)) {
      /*
       * A new reply wakes the thread: its tip is no longer the message
       * that was put to sleep. Waiting quietly through "urgent, call me
       * now" is not what anybody meant by snooze — and Gmail and Outlook
       * both wake on reply, so this is also what the same gesture does
       * everywhere else. A snooze whose tip was never learned cannot
       * tell a reply from silence, so it sleeps to its timer.
       */
      if (storedTip && tipKey && tipKey !== storedTip) {
        wokenByReply.add(snoozeKey);
      } else {
        continue;
      }
    } else if (tipKey && snoozedTipIds.has(tipKey)) {
      // A copy of a snoozed thread in another mailbox, still on the tip
      // that was put to sleep — it sleeps with it.
      continue;
    }
    if (tipKey) summary.tipId = tipKey;
    const key = latestRfcId || `${summary.account}|${summary.threadId}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, summary);
      deduped.push(summary);
      if (latestReferences) {
        adoptHints.set(
          `${summary.account}|${summary.threadId}`,
          latestReferences
        );
      }
    } else {
      if (summary.unread) existing.unread = true;
      if (summary.hasCalendarInvite) existing.hasCalendarInvite = true;
      if (summary.hasAttachments) existing.hasAttachments = true;
      if (summary.calendarInviteWhen && !existing.calendarInviteWhen) {
        existing.calendarInviteWhen = summary.calendarInviteWhen;
      }
    }
  }
  // The store hears about the wakes, so the Snoozed tab and the next
  // fetch agree with what this one just showed.
  if (wokenByReply.size) {
    await Promise.all(
      [...wokenByReply].map((key) => {
        const sep = key.indexOf("|");
        return mailStore()
          .snoozes.remove(key.slice(0, sep), key.slice(sep + 1))
          .catch(() => {});
      })
    );
  }

  // Dedupe keeps insertion order, but re-sort so the list is always
  // newest-first (important for search, where Gmail's hit order is relevance).
  deduped.sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt));

  const chatByThread = await getChatsForThreads(
    deduped.map((t) => ({ account: t.account, threadId: t.threadId }))
  );
  for (const t of deduped) {
    const chat = chatByThread.get(`${t.account}|${t.threadId}`);
    if (chat) t.chat = chat;
  }

  // A provider split arrives as a new, unbound thread. Adopt it into its
  // conversation here in the list, so it never presents as a stranger. Only
  // the plain inbox: Sent, Trash and search answer different questions.
  // Capped, because splits are rare and the next refresh catches stragglers.
  if (!q && !label && !folder) {
    let attempts = 0;
    for (const t of deduped) {
      if (attempts >= 8) break;
      if (t.chat) continue;
      const refs = adoptHints.get(`${t.account}|${t.threadId}`);
      const referencedIds = refs?.match(/<[^>]+>/g) ?? [];
      if (!referencedIds.length) continue;
      attempts += 1;
      const adopted = await adoptSplitThread({
        account: t.account,
        threadId: t.threadId,
        subject: t.subject,
        referencedIds,
        counterpartEmails: (t.externalParticipants ?? []).map((p) => p.email),
      }).catch(() => null);
      if (adopted) {
        t.chat = {
          chatId: adopted.chatId,
          title: adopted.title,
          partIndex: adopted.partIndex,
          partCount: adopted.partCount,
          subject: adopted.subject,
          isOpenPart: adopted.isOpenPart,
          noQuote: adopted.noQuote,
        };
      }
    }
  }

  // One row per conversation. Parts are transport, and the reader has one
  // chat — showing each part is showing the plumbing. The newest row stays,
  // and it inherits the signals a dropped row carried.
  const rowByChat = new Map<string, MailThreadSummary>();
  const collapsed: MailThreadSummary[] = [];
  for (const t of deduped) {
    const chatId = t.chat?.chatId;
    if (!chatId) {
      collapsed.push(t);
      continue;
    }
    const kept = rowByChat.get(chatId);
    if (!kept) {
      rowByChat.set(chatId, t);
      collapsed.push(t);
      continue;
    }
    if (t.unread) kept.unread = true;
    if (t.hasCalendarInvite) kept.hasCalendarInvite = true;
    if (t.hasAttachments) kept.hasAttachments = true;
  }

  const nextCursor = encodeMailListCursor(nextTokens);
  if (!isContinuation) {
    inboxCache.set(cacheKey, {
      value: { threads: collapsed, nextCursor },
      expiresAt: Date.now() + 30 * 1000,
    });

    // Persist Gmail first-page rows for the next incremental poll. Key by the
    // pre-dedupe account copies so each mailbox can reuse its own metadata.
    if (!q && !label && gmailListSnippetsByAccount.size) {
      const prior: GmailPriorPage = new Map();
      for (const { summary, latestRfcId, latestReferences } of summaries) {
        if (providerByEmail.get(summary.account) !== "gmail") continue;
        const listSnippet = gmailListSnippetsByAccount
          .get(summary.account)
          ?.get(summary.threadId);
        if (listSnippet == null) continue;
        let byThread = prior.get(summary.account);
        if (!byThread) {
          byThread = new Map();
          prior.set(summary.account, byThread);
        }
        const { chat: _chat, ...rest } = summary;
        byThread.set(summary.threadId, {
          listSnippet,
          summary: rest,
          latestRfcId,
          latestReferences,
        });
      }
      if (prior.size) gmailPriorPages.set(cacheKey, prior);
      if (pageStateByAccount.size) {
        let byAccount = gmailPriorHistoryIds.get(cacheKey);
        if (!byAccount) {
          byAccount = new Map();
          gmailPriorHistoryIds.set(cacheKey, byAccount);
        }
        for (const [email, state] of pageStateByAccount) {
          byAccount.set(email, state);
        }
      }

      // Mirror to Postgres so the next poll starts warm on any process. One
      // store is one client on the team hosts, so write mailboxes in turn. An
      // unchanged page only moves the history id.
      const states = gmailPriorHistoryIds.get(cacheKey);
      for (const [email, byThread] of prior) {
        const rows: MailListSyncRow[] = [];
        for (const [threadId, row] of byThread) {
          rows.push({
            threadId,
            listSnippet: row.listSnippet,
            latestRfcId: row.latestRfcId,
            latestReferences: row.latestReferences,
            summary: row.summary,
          });
        }
        const state = states?.get(email);
        await mailStore().listSync.save(options.clerkUserId, folder, email, {
          rows,
          historyId: state?.historyId ?? null,
          nextPageToken: state?.nextPageToken ?? null,
        });
      }
    }
  }

  return {
    accounts: allAccounts.map((a) => a.email),
    threads: collapsed,
    nextCursor,
  };
}

// ---------------------------------------------------------------------------
// Thread detail
// ---------------------------------------------------------------------------

/**
 * Sent by the reader personally: the account being read, or another of their
 * own mailboxes. Colleagues and shared mailboxes on the same domains are
 * deliberately *not* self — a reply to them must still reach them.
 */
function isSelfAddress(email: string, account: string): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (normalized === normalizeEmail(account)) return true;
  return isOwnPersonalAddress(normalized);
}

const THREAD_PAGE_SIZE = 50;
/** Messages on each side of a search hit (plus the hit itself). */
const THREAD_AROUND_RADIUS = 50;

function emptyThreadDetail(
  account: string,
  threadId: string
): MailThreadDetail {
  return {
    account,
    threadId,
    subject: "(no subject)",
    participants: [],
    messages: [],
    hasOlder: false,
    hasNewer: false,
    reply: {
      inReplyTo: "",
      references: "",
      to: [],
      cc: [],
      allTo: [],
      allCc: [],
    },
  };
}

/** One Gmail message as the reader sees it, bodies and headers resolved. */
async function gmailMailMessage(
  token: string,
  account: string,
  m: GmailMessage
): Promise<MailMessage> {
  const from = parseAddressList(headerValue(m, "From"))[0] ?? {
    email: "",
    name: "",
  };
  const own = from.email === account || isOwnOrgAddress(from.email);
  const bodyHtml = extractBodyHtml(m) || undefined;
  // Embedded (cid:) images live in the message itself, so resolving them
  // is privacy-safe — unlike remote images, which stay behind the toggle.
  const inlineImages =
    bodyHtml && bodyHtml.includes("cid:")
      ? await resolveInlineImages(token, m, bodyHtml)
      : undefined;
  const attachments = extractAttachments(m, bodyHtml ?? "");
  return {
    id: m.id,
    fromName: from.name || from.email,
    fromEmail: from.email,
    toEmails: parseAddressList(headerValue(m, "To")).map((p) => p.email),
    ccEmails: parseAddressList(headerValue(m, "Cc")).map((p) => p.email),
    sentAt: messageDate(m) ? new Date(messageDate(m)).toISOString() : null,
    bodyText: extractBodyText(m),
    bodyHtml,
    inlineImages:
      inlineImages && Object.keys(inlineImages).length
        ? inlineImages
        : undefined,
    attachments: attachments.length ? attachments : undefined,
    own,
    // The protocol's own thread identity. Provider thread ids are views;
    // these headers are what a conversation is actually made of.
    rfcMessageId: headerValue(m, "Message-ID").trim() || undefined,
    inReplyTo: headerValue(m, "In-Reply-To").trim() || undefined,
    references: headerValue(m, "References").trim() || undefined,
  };
}

export async function getMailThread(
  account: string,
  threadId: string,
  options?: {
    before?: string;
    after?: string;
    around?: string;
    /**
     * The oldest page, rather than the newest.
     *
     * The id list already says where a thread begins, so the beginning is one
     * request away at any size. Walking back a window at a time to reach it
     * would read the whole thread to show its first message.
     *
     * With `limit: 1` this answers the first message and nothing else, which
     * is what a header needs to say when a thread began.
     */
    oldest?: boolean;
    limit?: number;
    /** When false, skip marking the thread read (used for background prefetch). */
    markRead?: boolean;
    /**
     * Message count the caller already knows from the list row. A thread that
     * fits in one page is then one Gmail call instead of an id list followed
     * by a call per message. A stale hint only costs the slower path.
     */
    messageCountHint?: number;
  }
): Promise<MailThreadDetail> {
  if ((await resolveMailProvider(account)) === "outlook") {
    return getOutlookMailThread(account, threadId, options);
  }
  const token = await accessTokenFor(account);
  const limit = options?.limit ?? THREAD_PAGE_SIZE;

  const windowed = Boolean(
    options?.before || options?.after || options?.around || options?.oldest
  );
  const fitsOnePage =
    !windowed &&
    typeof options?.messageCountHint === "number" &&
    options.messageCountHint > 0 &&
    options.messageCountHint <= limit;

  const notDraft = (m: { labelIds?: string[] }) =>
    !(m.labelIds ?? []).includes("DRAFT");

  /** The last draft in a thread. More than one is possible; the newest wins. */
  const newestDraft = <T extends { id: string; labelIds?: string[] }>(
    rows: T[]
  ): T | null => {
    const drafts = rows.filter((m) => !notDraft(m));
    return drafts.length ? drafts[drafts.length - 1] : null;
  };

  /** Bodies already in hand — set only on the single-call path. */
  let prefetched: Map<string, GmailMessage> | null = null;
  let allIds: string[] | null = null;
  /** The newest unsent reply Gmail is holding for this thread, if any. */
  let draftMessage: GmailMessage | null = null;

  if (fitsOnePage) {
    const full = await getThreadFull(token, threadId);
    draftMessage = newestDraft(full.messages ?? []);
    const messages = (full.messages ?? []).filter(notDraft);
    // Take the single call only when it really carried every body. Anything
    // else falls through to the id list, which is correct but slower.
    if (messages.length > 0 && messages.every((m) => m.payload)) {
      allIds = messages.map((m) => m.id);
      prefetched = new Map(messages.map((m) => [m.id, m]));
    }
  }

  if (!allIds) {
    // Cheap id list (oldest → newest); hydrate only the requested page bodies.
    const minimal = await getThreadMinimal(token, threadId);
    const draftRow = newestDraft(minimal.messages ?? []);
    // The id list carries no bodies, so a draft costs one more call — and only
    // when there is one.
    if (draftRow) {
      draftMessage = await getMessageFull(token, draftRow.id).catch(() => null);
    }
    allIds = (minimal.messages ?? []).filter(notDraft).map((m) => m.id);
  }

  let start = 0;
  let endExclusive = allIds.length;
  let hasOlder = false;
  let hasNewer = false;

  if (options?.around) {
    const idx = allIds.indexOf(options.around);
    if (idx < 0) {
      // Unknown hit id — fall through to newest page.
      start = Math.max(0, allIds.length - limit);
      endExclusive = allIds.length;
      hasOlder = start > 0;
    } else {
      start = Math.max(0, idx - THREAD_AROUND_RADIUS);
      endExclusive = Math.min(allIds.length, idx + THREAD_AROUND_RADIUS + 1);
      hasOlder = start > 0;
      hasNewer = endExclusive < allIds.length;
    }
  } else if (options?.after) {
    const idx = allIds.indexOf(options.after);
    if (idx < 0 || idx >= allIds.length - 1) {
      return emptyThreadDetail(account, threadId);
    }
    start = idx + 1;
    endExclusive = Math.min(allIds.length, start + limit);
    hasOlder = start > 0;
    hasNewer = endExclusive < allIds.length;
  } else if (options?.oldest) {
    start = 0;
    endExclusive = Math.min(allIds.length, limit);
    hasOlder = false;
    hasNewer = endExclusive < allIds.length;
  } else if (options?.before) {
    const idx = allIds.indexOf(options.before);
    if (idx <= 0) {
      return emptyThreadDetail(account, threadId);
    }
    endExclusive = idx;
    start = Math.max(0, endExclusive - limit);
    hasOlder = start > 0;
    hasNewer = endExclusive < allIds.length;
  } else {
    start = Math.max(0, allIds.length - limit);
    endExclusive = allIds.length;
    hasOlder = start > 0;
    hasNewer = false;
  }

  const pageIds = allIds.slice(start, endExclusive);

  // A hint that undercounted still lands here with every body already loaded.
  const rawMessages = prefetched
    ? pageIds
        .map((id) => prefetched.get(id))
        .filter((m): m is GmailMessage => Boolean(m))
    : await mapWithConcurrency(pageIds, (id) => getMessageFull(token, id));

  const messages: MailMessage[] = await Promise.all(
    rawMessages.map((m) => gmailMailMessage(token, account, m))
  );

  // Reply targets the true thread tip, not the middle of a deep-link window.
  const tipId = allIds[allIds.length - 1];
  const tipMessage =
    tipId && pageIds[pageIds.length - 1] === tipId
      ? rawMessages[rawMessages.length - 1]
      : tipId
        ? (prefetched?.get(tipId) ?? (await getMessageFull(token, tipId)))
        : undefined;
  const last = tipMessage;
  const subject =
    (last ? headerValue(last, "Subject") : "").trim() || "(no subject)";

  const lastFrom = last
    ? parseAddressList(headerValue(last, "From"))[0]
    : undefined;
  const lastTo = last
    ? parseAddressList(headerValue(last, "To")).map((p) => p.email)
    : [];
  const lastCc = last
    ? parseAddressList(headerValue(last, "Cc")).map((p) => p.email)
    : [];
  const sentByUs = lastFrom ? isSelfAddress(lastFrom.email, account) : false;
  const accountKey = normalizeEmail(account);
  /**
   * Dedupe (ignoring case and Gmail dot/+tag variants) and drop the mailbox
   * we're sending from, so a reply never lands back in this inbox. Other
   * addresses of ours stay, as in Outlook — they're visible, editable chips.
   */
  const recipients = (items: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of items) {
      const email = raw.trim();
      if (!email) continue;
      const key = normalizeEmail(email);
      if (key === accountKey || seen.has(key)) continue;
      seen.add(key);
      out.push(email);
    }
    return out;
  };

  // Replying to our own last message keeps whoever we addressed it to,
  // rather than addressing the reply to ourselves.
  const replyTo = sentByUs ? lastTo : [lastFrom?.email ?? ""];
  const allTo = sentByUs ? lastTo : [lastFrom?.email ?? "", ...lastTo];

  const references = last
    ? [
        headerValue(last, "References").trim(),
        headerValue(last, "Message-ID").trim(),
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  // Participant names, "You" standing in for all own addresses.
  const names: string[] = [];
  let hasOwn = false;
  for (const m of messages) {
    if (m.own) {
      hasOwn = true;
      continue;
    }
    const short = m.fromName.split("<")[0].trim() || m.fromEmail;
    if (!names.includes(short)) names.push(short);
  }
  if (hasOwn) names.push("You");

  // Opening a window (not paging) marks the thread read (best-effort).
  // Prefetch passes markRead: false so unread badges stay until a real open.
  if (
    options?.markRead !== false &&
    !options?.before &&
    !options?.after
  ) {
    void modifyThreadLabels(token, threadId, {
      removeLabelIds: ["UNREAD"],
    }).catch(() => undefined);
  }

  let chat = await getChatForThread(
    account,
    threadId,
    names.find((n) => n !== "You") || undefined
  );

  // An unbound thread that references a conversation's messages is that
  // conversation, split by the provider. Adopt it as the next part. The
  // References header survives the split — the grouping changed, not the
  // headers — so this is where a Gmail split finds its way home.
  if (!chat && messages.length) {
    const head = messages[0];
    const referencedIds = [
      ...(head.references?.match(/<[^>]+>/g) ?? []),
      ...(head.inReplyTo?.match(/<[^>]+>/g) ?? []),
    ];
    if (referencedIds.length) {
      const self = account.trim().toLowerCase();
      const counterpartEmails = [
        ...new Set(
          messages
            .flatMap((m) => [m.fromEmail, ...m.toEmails, ...m.ccEmails])
            .map((e) => e.trim().toLowerCase())
            .filter((e) => e && e !== self && !isOwnOrgAddress(e))
        ),
      ];
      chat = await adoptSplitThread({
        account,
        threadId,
        subject,
        referencedIds,
        counterpartEmails,
      }).catch(() => null);
    }
  }

  // A bound thread corrects its part's count from the id list, which sees
  // every message — the send counter sees only ours. And its Message-IDs go
  // into the conversation's memory, so the next split can find them. Best
  // effort: a store hiccup must not cost the thread view.
  if (chat) {
    await mailStore()
      .chats.reconcilePartCount({
        account,
        threadId,
        messageCount: allIds.length,
      })
      .catch(() => undefined);
    await noteChatMessageIds(
      account,
      threadId,
      messages.map((m) => m.rfcMessageId)
    );
  }

  return {
    account,
    threadId,
    subject,
    participants: names,
    messages,
    hasOlder,
    hasNewer,
    totalMessageCount: allIds.length,
    ...(chat ? { chat } : null),
    ...(draftMessage
      ? {
          providerDraft: {
            // The message id. `sendMailMessage` turns it into a draft id when
            // it is time to discard — see findGmailDraftIdForMessage.
            ref: draftMessage.id,
            bodyText: extractBodyText(draftMessage),
            bodyHtml: extractBodyHtml(draftMessage) || undefined,
            to: parseAddressList(headerValue(draftMessage, "To")).map(
              (p) => p.email
            ),
            cc: parseAddressList(headerValue(draftMessage, "Cc")).map(
              (p) => p.email
            ),
            updatedAt: messageDate(draftMessage)
              ? new Date(messageDate(draftMessage)).toISOString()
              : null,
          },
        }
      : null),
    reply: {
      inReplyTo: last ? headerValue(last, "Message-ID").trim() : "",
      references,
      // Self-addressed threads (notes to yourself) would otherwise strip down
      // to nobody — replying to yourself is legitimate, so keep the mailbox.
      to: withSelfFallback(recipients(replyTo), account),
      cc: [],
      allTo: withSelfFallback(recipients(allTo), account),
      allCc: recipients(lastCc),
    },
  };
}

/** Reply recipients drop the sending mailbox; a self-thread keeps it. */
function withSelfFallback(list: string[], account: string): string[] {
  return list.length ? list : [account];
}

// ---------------------------------------------------------------------------
// Actions: send / archive / snooze
// ---------------------------------------------------------------------------

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7e]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${utf8ToBase64(subject)}?=`;
}

function base64Wrapped(text: string): string {
  return utf8ToBase64(text).replace(/(.{76})/g, "$1\r\n");
}

/** Wrap already-encoded standard base64 at 76 chars (MIME). */
function wrapBase64(b64: string): string {
  const clean = b64.replace(/\s+/g, "");
  return clean.replace(/(.{76})/g, "$1\r\n");
}

function sanitizeMimeFilename(filename: string): string {
  return filename.replace(/[\r\n"\\]/g, "_").slice(0, 180) || "attachment";
}

/** Gmail's practical raw-message size limit. */
export const MAIL_ATTACHMENT_MAX_TOTAL_BYTES = 25 * 1024 * 1024;

export type OutgoingAttachment = {
  filename: string;
  mimeType: string;
  /** Standard base64 (not base64url). */
  contentBase64: string;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * A link in a signature: the words' own colour, and an underline.
 *
 * Inline, because a mail client cannot be relied on to read a stylesheet.
 * The underline is permanent — `:hover` needs one of those stylesheets,
 * and Outlook's engine has no notion of it — and it is what makes the link
 * findable now that it is not blue.
 *
 * #444 is the colour of the signature block this sits in. Not `inherit`:
 * a client's own `a { color }` rule beats an inherited colour, so an
 * anchor has to say the colour outright to keep it.
 */
const SIGNATURE_LINK_STYLE = "color:#444;text-decoration:underline";

/** Renders one signature line, converting [text](url) into anchors. */
function signatureLineHtml(line: string): string {
  let html = "";
  let lastIndex = 0;
  for (const match of line.matchAll(MARKDOWN_LINK)) {
    html += escapeHtml(line.slice(lastIndex, match.index));
    // The span repeats the colour inside the anchor. Some clients — the
    // phone ones especially — repaint every `<a>` their own colour and
    // leave what is nested in it alone, so this is the copy that survives.
    html += `<a href="${escapeHtml(match[2])}" style="${SIGNATURE_LINK_STYLE}"><span style="color:#444">${escapeHtml(match[1])}</span></a>`;
    lastIndex = match.index + match[0].length;
  }
  html += escapeHtml(line.slice(lastIndex));
  return html;
}

function isHtmlSignature(signature: string): boolean {
  return /<[a-z][\s\S]*>/i.test(signature.trim());
}

/** Signature rendered slightly smaller than the 12pt body text. */
function signatureHtml(signature: string): string {
  if (isHtmlSignature(signature)) {
    // Rich-text signatures from the editor: keep lines tight and style links
    // inline (email clients ignore stylesheets).
    const styled = signature
      .replace(/<p(?![a-z])(?![^>]*style=)/gi, '<p style="margin:0"')
      // No nested span on this path: the anchor's text is whatever the
      // editor put there, and finding the matching `</a>` for each one is
      // not a job for a regular expression. A client that repaints anchors
      // will repaint these.
      .replace(
        /<a(?![a-z])(?![^>]*style=)/gi,
        `<a style="${SIGNATURE_LINK_STYLE}"`
      );
    return `<div style="margin-top:16px;font-size:13px;line-height:1.5;color:#444">${styled}</div>`;
  }
  const lines = signature.split("\n").map(signatureLineHtml).join("<br>");
  return `<div style="margin-top:16px;font-size:13px;line-height:1.5;color:#444">${lines}</div>`;
}

/** Links become their text in the plain-text part. */
function signaturePlainText(signature: string): string {
  if (isHtmlSignature(signature)) {
    return signature
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|li)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return signature.replace(MARKDOWN_LINK, "$1");
}

/** Original message quoted below a forward, Gmail-style. */
export type ForwardedMessage = {
  fromName: string;
  fromEmail: string;
  /** Display date of the original message. */
  date: string;
  subject: string;
  to: string[];
  text: string;
  /** Sanitized HTML of the original, so rich mail forwards with its layout. */
  html?: string;
};

function forwardedPlainText(forward: ForwardedMessage): string {
  const from = forward.fromName
    ? `${forward.fromName} <${forward.fromEmail}>`
    : forward.fromEmail;
  return [
    "---------- Forwarded message ----------",
    `From: ${from}`,
    `Date: ${forward.date}`,
    `Subject: ${forward.subject}`,
    `To: ${forward.to.join(", ")}`,
    "",
    forward.text,
  ].join("\n");
}

function forwardedHtml(forward: ForwardedMessage): string {
  const from = forward.fromName
    ? `${escapeHtml(forward.fromName)} &lt;${escapeHtml(forward.fromEmail)}&gt;`
    : escapeHtml(forward.fromEmail);
  const rows = [
    `From: ${from}`,
    `Date: ${escapeHtml(forward.date)}`,
    `Subject: ${escapeHtml(forward.subject)}`,
    `To: ${escapeHtml(forward.to.join(", "))}`,
  ].join("<br>");
  const original =
    forward.html ||
    `<pre style="white-space:pre-wrap;font-family:Helvetica,Arial,sans-serif;font-size:12pt;margin:0">${escapeHtml(forward.text)}</pre>`;
  return [
    '<div style="margin-top:24px;padding-top:12px;border-top:1px solid #ddd">',
    `<div style="font-size:13px;color:#555;line-height:1.5"><b>---------- Forwarded message ----------</b><br>${rows}</div>`,
    `<div style="margin-top:12px">${original}</div>`,
    "</div>",
  ].join("");
}

/** The message being replied to, quoted Gmail-style below the reply. */
export type QuotedMessage = {
  fromName: string;
  fromEmail: string;
  /** Display date of the original message. */
  date: string;
  text: string;
  /** Sanitized HTML of the original, so rich mail quotes with its layout. */
  html?: string;
};

function quotedPlainText(quote: QuotedMessage): string {
  const from = quote.fromName
    ? `${quote.fromName} <${quote.fromEmail}>`
    : quote.fromEmail;
  const quoted = quote.text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `On ${quote.date}, ${from} wrote:\n${quoted}`;
}

function quotedHtml(quote: QuotedMessage): string {
  const from = quote.fromName
    ? `${escapeHtml(quote.fromName)} &lt;${escapeHtml(quote.fromEmail)}&gt;`
    : escapeHtml(quote.fromEmail);
  const original =
    quote.html ||
    `<pre style="white-space:pre-wrap;font-family:Helvetica,Arial,sans-serif;font-size:12pt;margin:0">${escapeHtml(quote.text)}</pre>`;
  // class=gmail_quote so our own reader (and Gmail) can collapse the quote
  // behind the "…" pill the same way inbound replies do.
  return [
    '<div class="gmail_quote" style="margin-top:24px">',
    `<div class="gmail_attr" style="font-size:13px;color:#555">On ${escapeHtml(quote.date)}, ${from} wrote:</div>`,
    `<blockquote class="gmail_quote" style="margin:8px 0 0 0;padding-left:12px;border-left:2px solid #ddd">${original}</blockquote>`,
    "</div>",
  ].join("");
}

/**
 * The messages a provider is holding for this thread, and when each goes.
 *
 * Empty for Gmail, which cannot hold one — nothing was ever scheduled there,
 * so there is nothing to show or to take back.
 */
export async function listScheduledMailMessages(input: {
  account: string;
  /** One conversation, or the whole mailbox when left out. */
  threadId?: string;
}): Promise<MailScheduledMessage[]> {
  if ((await resolveMailProvider(input.account)) !== "outlook") return [];
  return listScheduledOutlookMessages(input.account, input.threadId);
}

/**
 * Everything being held, across every mailbox that can hold anything.
 *
 * For the group at the top of the list. Gmail mailboxes are skipped rather
 * than asked: they have nothing to say, and asking would cost a round trip
 * to be told so.
 */
export async function listAllScheduledMailMessages(input: {
  clerkUserId: string;
  scope?: MailAccountScope;
}): Promise<MailScheduledMessage[]> {
  const accounts = filterAccountsForScope(
    await listConnectedMailAccounts(input.clerkUserId),
    input.scope ?? "all"
  ).filter((a) => a.provider === "outlook");
  if (!accounts.length) return [];

  const pages = await Promise.all(
    accounts.map(async (a) => {
      try {
        return await listScheduledOutlookMessages(a.email);
      } catch (err) {
        // One mailbox refusing must not empty the group for the others.
        console.warn("[mail] could not list held messages:", err);
        return [];
      }
    })
  );
  return pages.flat().sort((a, b) => a.sendAt.localeCompare(b.sendAt));
}

/** Never send it. */
export async function cancelScheduledMailMessage(input: {
  account: string;
  id: string;
}): Promise<void> {
  if ((await resolveMailProvider(input.account)) !== "outlook") {
    throw new PlanError("Only Outlook holds a message for a time", 400);
  }
  await cancelScheduledOutlookMessage(input.account, input.id);
  invalidateInboxCache();
}

/** Send it now instead of when it was set for. */
export async function sendScheduledMailMessageNow(input: {
  account: string;
  id: string;
}): Promise<void> {
  if ((await resolveMailProvider(input.account)) !== "outlook") {
    throw new PlanError("Only Outlook holds a message for a time", 400);
  }
  await sendScheduledOutlookMessageNow(input.account, input.id);
  invalidateInboxCache();
}

export async function sendMailMessage(input: {
  account: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  /** Rich-text body; when present the mail is sent as multipart/alternative. */
  html?: string;
  /** Append the shared signature (default true). */
  includeSignature?: boolean;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  /** Quoted below the body (and signature) when forwarding. */
  forward?: ForwardedMessage;
  /** The original message, quoted below a reply Gmail-style. */
  quote?: QuotedMessage;
  /**
   * The thread's history, rebuilt by the composer and quoted below the
   * body. Pre-rendered, because the composer holds the thread and the
   * preview must show exactly what will be sent — one builder, two uses.
   * See lib/mail/quote-history.
   */
  appendix?: { text: string; html: string };
  /** File attachments (base64); wrapped as multipart/mixed. */
  attachments?: OutgoingAttachment[];
  /**
   * A draft the provider is holding, which this send replaces.
   *
   * Discarded after the mail is away, never before: a failed send must leave
   * the reader's draft where it was. Discarding it at all is what stops the
   * provider keeping an unsent copy of a message that has gone out.
   */
  discardProviderDraft?: string;
  /**
   * Hold the message until this time (ISO 8601). Outlook only.
   *
   * Exchange keeps it and sends it, so it goes whether or not this machine is
   * on. Gmail has nothing like it: their schedule send lives in Google's own
   * client and was never opened to the API, and holding the message here
   * instead would mean a send that quietly does not happen when the machine
   * is asleep or on a plane. So this asks the provider or it refuses.
   */
  sendAt?: string;
}): Promise<{ messageId?: string; threadId?: string }> {
  if (!input.to.length) throw new PlanError("Add at least one recipient", 400);

  if (input.sendAt) {
    const at = Date.parse(input.sendAt);
    if (!Number.isFinite(at)) {
      throw new PlanError("That send time is not a time", 400);
    }
    if (at <= Date.now()) {
      throw new PlanError("Choose a time that has not passed", 400);
    }
  }

  const provider = await resolveMailProvider(input.account);
  if (input.sendAt && provider !== "outlook") {
    throw new PlanError(
      "Only Outlook accounts can send later. Gmail has no way to hold a message for us.",
      400
    );
  }

  if (provider === "outlook") {
    // Graph's createReply pre-fills the quoted original, and the PATCH that
    // sets our body overwrites it — so an Outlook reply from here carried
    // no history at all, whatever the composer asked. The appendix is
    // rendered into the body instead, the same as the Gmail path.
    const outlookAppendix = input.forward
      ? forwardedHtml(input.forward)
      : input.quote
        ? quotedHtml(input.quote)
        : (input.appendix?.html ?? "");
    await sendOutlookMailMessage({
      account: input.account,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      body: input.body,
      html: input.html,
      includeSignature: input.includeSignature,
      threadId: input.threadId,
      sendAt: input.sendAt,
      attachments: input.attachments,
      appendixHtml: outlookAppendix || undefined,
    });
    if (input.discardProviderDraft) {
      await discardOutlookDraft(input.account, input.discardProviderDraft);
    }
    invalidateInboxCache();
    // Graph sendMail doesn't return ids; keep the conversation we replied in.
    return { threadId: input.threadId };
  }

  const token = await accessTokenFor(input.account);

  const attachments = input.attachments ?? [];
  let attachmentBytes = 0;
  for (const a of attachments) {
    const bytes = Math.floor((a.contentBase64.replace(/\s+/g, "").length * 3) / 4);
    attachmentBytes += bytes;
  }
  if (attachmentBytes > MAIL_ATTACHMENT_MAX_TOTAL_BYTES) {
    throw new PlanError(
      "Attachments exceed Gmail’s 25 MB limit. Remove some files and try again.",
      400
    );
  }

  const signature =
    input.includeSignature === false
      ? ""
      : (await getMailSignatureSettings(input.account)).signature;
  const noteWithSignature = signature
    ? `${input.body.replace(/\s+$/, "")}\n\n${signaturePlainText(signature)}`
    : input.body;
  const plainAppendix = input.forward
    ? forwardedPlainText(input.forward)
    : input.quote
      ? quotedPlainText(input.quote)
      : (input.appendix?.text ?? "");
  const plainBody = plainAppendix
    ? `${noteWithSignature.trimEnd()}\n\n${plainAppendix}`.trimStart()
    : noteWithSignature;

  // The name Gmail already puts on their mail. Never throws: an account we
  // cannot ask sends with the bare address, the way every send did before.
  const senderName = await senderNameFor(input.account, {
    token,
    provider: "gmail",
  });

  const headers = [
    `From: ${formatFromHeader(input.account, senderName)}`,
    `To: ${input.to.join(", ")}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.join(", ")}`] : []),
    ...(input.bcc?.length ? [`Bcc: ${input.bcc.join(", ")}`] : []),
    `Subject: ${encodeSubject(input.subject)}`,
    ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`] : []),
    ...(input.references ? [`References: ${input.references}`] : []),
    "MIME-Version: 1.0",
  ];

  const buildAlternative = (): { headers: string[]; body: string } => {
    if (input.html || input.forward || input.quote || input.appendix) {
      const htmlAppendix = input.forward
        ? forwardedHtml(input.forward)
        : input.quote
          ? quotedHtml(input.quote)
          : (input.appendix?.html ?? "");
      // 12pt matches Outlook's default, so replies don't render smaller than
      // the rest of the thread (for us and for recipients).
      const htmlBody = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:12pt;line-height:1.6;color:#222">${input.html ?? ""}${
        signature ? signatureHtml(signature) : ""
      }${htmlAppendix}</div>`;
      const boundary = `=_redd_alt_${Date.now().toString(36)}`;
      return {
        headers: [
          `Content-Type: multipart/alternative; boundary="${boundary}"`,
        ],
        body: [
          `--${boundary}`,
          'Content-Type: text/plain; charset="UTF-8"',
          "Content-Transfer-Encoding: base64",
          "",
          base64Wrapped(plainBody),
          `--${boundary}`,
          'Content-Type: text/html; charset="UTF-8"',
          "Content-Transfer-Encoding: base64",
          "",
          base64Wrapped(htmlBody),
          `--${boundary}--`,
        ].join("\r\n"),
      };
    }
    return {
      headers: [
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
      ],
      body: base64Wrapped(plainBody),
    };
  };

  let raw: string;
  if (attachments.length) {
    const alt = buildAlternative();
    const mixed = `=_redd_mix_${Date.now().toString(36)}`;
    const parts: string[] = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${mixed}"`,
      "",
      `--${mixed}`,
      ...alt.headers,
      "",
      alt.body,
    ];
    for (const file of attachments) {
      const filename = sanitizeMimeFilename(file.filename);
      const mimeType =
        file.mimeType.replace(/[\r\n]+/g, "").trim() ||
        "application/octet-stream";
      parts.push(
        `--${mixed}`,
        `Content-Type: ${mimeType}; name="${filename}"`,
        `Content-Disposition: attachment; filename="${filename}"`,
        "Content-Transfer-Encoding: base64",
        "",
        wrapBase64(file.contentBase64)
      );
    }
    parts.push(`--${mixed}--`);
    raw = parts.join("\r\n");
  } else {
    const alt = buildAlternative();
    raw = [...headers, ...alt.headers, "", alt.body].join("\r\n");
  }

  let sent: { id: string; threadId?: string } | undefined;
  try {
    sent = await sendRawMessage(token, raw, input.threadId);
  } catch (err) {
    translateGmailError(err, input.account);
  }
  if (input.discardProviderDraft) {
    await discardGmailDraft(
      token,
      input.discardProviderDraft,
      sent?.threadId ?? input.threadId
    );
  }
  invalidateInboxCache();
  return {
    messageId: sent?.id,
    threadId: sent?.threadId ?? input.threadId,
  };
}

/**
 * Throw away the Gmail draft this reply came from.
 *
 * Never fatal. The mail is already sent, and telling the reader their message
 * failed because a leftover draft could not be tidied would be a lie.
 */
async function discardGmailDraft(
  token: string,
  messageId: string,
  threadId?: string
): Promise<void> {
  try {
    const draftId = await findGmailDraftIdForMessage(
      token,
      messageId,
      threadId
    );
    if (draftId) {
      await deleteGmailDraft(token, draftId);
      return;
    }
    // Nothing matched, so Gmail keeps an unsent copy of a message that has
    // gone out — and the reader sees it offered back to them next time they
    // open the thread. Not fatal, but never silent again.
    console.warn(
      `[mail] no Gmail draft matched ${messageId} (thread ${threadId ?? "?"}) — it was not discarded`
    );
  } catch (err) {
    console.warn("[mail] could not discard the Gmail draft:", err);
  }
}

/** The same, for Outlook, where the draft is deleted by its message id. */
async function discardOutlookDraft(
  account: string,
  messageId: string
): Promise<void> {
  try {
    const token = await outlookAccessTokenFor(account);
    await deleteOutlookMessage(token, messageId);
  } catch (err) {
    console.warn("[mail] could not discard the Outlook draft:", err);
  }
}

/**
 * Throw away the draft the provider is holding for a thread.
 *
 * Called when the reader discards a reply here, after the undo window has
 * closed — never during it. A Gmail draft cannot be un-deleted, so the only
 * honest way to offer Undo is to have not done anything yet.
 *
 * `ref` is the draft's message id, as `getMailThread` reported it. Gmail
 * hands a draft a new message id every time it saves, so `threadId` is passed
 * as the second way in — see `findGmailDraftIdForMessage`.
 */
export async function discardProviderDraft(input: {
  account: string;
  ref: string;
  threadId?: string;
}): Promise<void> {
  if ((await resolveMailProvider(input.account)) === "outlook") {
    await discardOutlookDraft(input.account, input.ref);
    invalidateInboxCache();
    return;
  }
  const token = await accessTokenFor(input.account);
  await discardGmailDraft(token, input.ref, input.threadId);
  invalidateInboxCache();
}

/** A long list of forgotten drafts is not a list anyone reads. */
const MAX_DRAFT_ROWS = 50;

/**
 * The unsent messages a provider is holding, for the Drafts view.
 *
 * Local drafts are not here: they live in the browser, and the view adds them.
 * This is only the half that needs the network.
 */
export async function listProviderDrafts(
  account: string
): Promise<MailDraftRow[]> {
  if ((await resolveMailProvider(account)) === "outlook") {
    const token = await outlookAccessTokenFor(account);
    const drafts = await listOutlookDraftMessages(token, MAX_DRAFT_ROWS);
    return drafts.map((m) => ({
      id: m.id,
      origin: "outlook" as const,
      account,
      threadId: m.conversationId ?? null,
      subject: (m.subject || "").trim() || "(no subject)",
      snippet: (m.bodyPreview || "").trim(),
      to: (m.toRecipients ?? [])
        .map((r) => r.emailAddress?.address ?? "")
        .filter(Boolean),
      updatedAt: m.lastModifiedDateTime || m.sentDateTime || null,
    }));
  }

  const token = await accessTokenFor(account);
  const { ids } = await listMessageIds(token, "in:drafts");
  const rows = await mapWithConcurrency(
    ids.slice(0, MAX_DRAFT_ROWS),
    async (id) => {
      const m = await getMessageMetadata(token, id, METADATA_HEADERS);
      return {
        id: m.id,
        origin: "gmail" as const,
        account,
        threadId: m.threadId ?? null,
        subject: headerValue(m, "Subject").trim() || "(no subject)",
        snippet: decodeSnippet(m.snippet ?? ""),
        to: parseAddressList(headerValue(m, "To")).map((p) => p.email),
        updatedAt: messageDate(m)
          ? new Date(messageDate(m)).toISOString()
          : null,
      };
    }
  );
  return rows;
}

/** Streamable attachment bytes for preview/download. */
export async function fetchMailAttachment(input: {
  account: string;
  messageId: string;
  attachmentId: string;
}): Promise<{ bytes: Uint8Array }> {
  if ((await resolveMailProvider(input.account)) === "outlook") {
    return fetchOutlookMailAttachment(input);
  }
  const token = await accessTokenFor(input.account);
  const { data } = await getGmailAttachment(
    token,
    input.messageId,
    input.attachmentId
  );
  const bytes = base64UrlToBytes(data);
  return { bytes };
}

export async function archiveMailThread(
  account: string,
  threadId: string,
  /** Owner of the stored list page, so the row can be dropped from it too. */
  clerkUserId?: string
): Promise<void> {
  if ((await resolveMailProvider(account)) === "outlook") {
    await archiveOutlookThread(account, threadId);
    if (clerkUserId) {
      await forgetThreadInStoredPages(clerkUserId, account, threadId);
    }
    invalidateInboxCache();
    return;
  }
  const token = await accessTokenFor(account);
  try {
    await modifyThreadLabels(token, threadId, {
      removeLabelIds: ["INBOX", "UNREAD"],
    });
  } catch (err) {
    translateGmailError(err, account);
  }
  if (clerkUserId) {
    await forgetThreadInStoredPages(clerkUserId, account, threadId);
  }
  invalidateInboxCache();
}

/** Undo of archive: put the thread back in the inbox. */
export async function unarchiveMailThread(
  account: string,
  threadId: string
): Promise<void> {
  if ((await resolveMailProvider(account)) === "outlook") {
    await unarchiveOutlookThread(account, threadId);
    invalidateInboxCache();
    return;
  }
  const token = await accessTokenFor(account);
  try {
    await modifyThreadLabels(token, threadId, { addLabelIds: ["INBOX"] });
  } catch (err) {
    translateGmailError(err, account);
  }
  invalidateInboxCache();
}

/**
 * Put the newest message of a thread back to unread.
 *
 * The newest, not the whole thread. Someone marking an eleven-message thread
 * unread wants the last one back in front of them, not the ten they have
 * already read. Outlook has always worked this way; Gmail marked all of them
 * until August 2026, because a thread-level modify is the obvious call and the
 * difference does not show in the list.
 */
export async function markMailThreadUnread(
  account: string,
  threadId: string
): Promise<void> {
  if ((await resolveMailProvider(account)) === "outlook") {
    await markOutlookThreadUnread(account, threadId);
    invalidateInboxCache();
    return;
  }
  const token = await accessTokenFor(account);
  try {
    const thread = await getThreadMinimal(token, threadId);
    const newest = thread.messages?.[thread.messages.length - 1];
    if (newest?.id) {
      await modifyMessageLabels(token, newest.id, { addLabelIds: ["UNREAD"] });
    } else {
      // No message list came back; the thread label is better than nothing.
      await modifyThreadLabels(token, threadId, { addLabelIds: ["UNREAD"] });
    }
  } catch (err) {
    translateGmailError(err, account);
  }
  invalidateInboxCache();
}

/**
 * Mark every message in a thread read.
 *
 * The whole thread here, which is the mirror of the above: "I have dealt with
 * this" is about the conversation, not about its last line.
 */
export async function markMailThreadRead(
  account: string,
  threadId: string
): Promise<void> {
  if ((await resolveMailProvider(account)) === "outlook") {
    await markOutlookThreadRead(account, threadId);
    invalidateInboxCache();
    return;
  }
  const token = await accessTokenFor(account);
  try {
    await modifyThreadLabels(token, threadId, {
      removeLabelIds: ["UNREAD"],
    });
  } catch (err) {
    translateGmailError(err, account);
  }
  invalidateInboxCache();
}

/**
 * File a conversation as junk, on whichever provider holds it.
 *
 * Filing, not reporting. Neither API exposes the signal the web buttons send
 * to train the provider's filter, so this puts the mail in Junk everywhere
 * the reader looks and teaches Gmail and Outlook nothing. The next message
 * from the same sender arrives exactly as before, which is why the button
 * says "Move to Junk" rather than "Report spam".
 */
export async function markMailThreadJunk(
  account: string,
  threadId: string
): Promise<void> {
  if ((await resolveMailProvider(account)) === "outlook") {
    const token = await outlookAccessTokenFor(account);
    await moveOutlookConversation(token, threadId, "junkemail");
    invalidateInboxCache();
    return;
  }
  const token = await accessTokenFor(account);
  await modifyThreadLabels(token, threadId, {
    addLabelIds: ["SPAM"],
    removeLabelIds: ["INBOX"],
  });
  invalidateInboxCache();
}

/** Take it back out again — the half that stops a Junk view being a dead end. */
export async function markMailThreadNotJunk(
  account: string,
  threadId: string
): Promise<void> {
  if ((await resolveMailProvider(account)) === "outlook") {
    const token = await outlookAccessTokenFor(account);
    await moveOutlookConversation(token, threadId, "inbox");
    invalidateInboxCache();
    return;
  }
  const token = await accessTokenFor(account);
  await modifyThreadLabels(token, threadId, {
    addLabelIds: ["INBOX"],
    removeLabelIds: ["SPAM"],
  });
  invalidateInboxCache();
}

export async function trashMailThread(
  account: string,
  threadId: string,
  /** Owner of the stored list page, so the row can be dropped from it too. */
  clerkUserId?: string
): Promise<void> {
  const forget = async () => {
    if (clerkUserId) {
      await forgetThreadInStoredPages(clerkUserId, account, threadId);
    }
  };
  if ((await resolveMailProvider(account)) === "outlook") {
    await trashOutlookThread(account, threadId);
    await forget();
    invalidateInboxCache();
    return;
  }
  const token = await accessTokenFor(account);
  try {
    await trashThread(token, threadId);
  } catch (err) {
    translateGmailError(err, account);
  }
  await forget();
  invalidateInboxCache();
}

/** Undo of trash: restore the thread and put it back in the inbox. */
export async function untrashMailThread(
  account: string,
  threadId: string
): Promise<void> {
  if ((await resolveMailProvider(account)) === "outlook") {
    await untrashOutlookThread(account, threadId);
    invalidateInboxCache();
    return;
  }
  const token = await accessTokenFor(account);
  try {
    await untrashThread(token, threadId);
    // Untrash alone doesn't re-add INBOX, so the thread would end up
    // archived rather than back where the user deleted it from.
    await modifyThreadLabels(token, threadId, { addLabelIds: ["INBOX"] });
  } catch (err) {
    translateGmailError(err, account);
  }
  invalidateInboxCache();
}

/** Best-effort tip Message-ID so sibling mailbox copies stay snoozed too. */
async function tipMessageIdForThread(
  account: string,
  threadId: string
): Promise<string | null> {
  try {
    if ((await resolveMailProvider(account)) === "outlook") {
      const token = await outlookAccessTokenFor(account);
      const tipPage = await listConversationMessages(token, threadId, {
        top: 1,
      });
      const tip = tipPage.messages[tipPage.messages.length - 1];
      return normalizeRfcMessageId(tip?.internetMessageId);
    }
    const token = await accessTokenFor(account);
    const thread = await getThreadMetadata(token, threadId, ["Message-ID"]);
    const messages = [...(thread.messages ?? [])];
    if (!messages.length) return null;
    messages.sort((a, b) => messageDate(a) - messageDate(b));
    const latest = messages[messages.length - 1];
    return normalizeRfcMessageId(headerValue(latest, "Message-ID"));
  } catch (err) {
    console.warn(`[mail] tip Message-ID for snooze failed (${account}):`, err);
    return null;
  }
}

export async function snoozeMailThread(
  account: string,
  threadId: string,
  untilIso: string
): Promise<void> {
  const until = new Date(untilIso);
  if (!Number.isFinite(until.getTime()) || until.getTime() <= Date.now()) {
    throw new PlanError("Snooze time must be in the future", 400);
  }
  const tipMessageId = await tipMessageIdForThread(account, threadId);
  await mailStore().snoozes.set({
    accountEmail: account,
    threadId,
    snoozedUntil: until.toISOString(),
    tipMessageId,
  });
  invalidateInboxCache();
}

export async function unsnoozeMailThread(
  account: string,
  threadId: string
): Promise<void> {
  await mailStore().snoozes.remove(account, threadId);
  invalidateInboxCache();
}

export { countActiveSnoozes } from "@/lib/mail/mail-snooze-count";

/** Active snoozes as list rows, soonest wake first. */
export async function listSnoozedThreads(options: {
  account?: string;
  scope?: MailAccountScope;
  clerkUserId: string;
}): Promise<{ accounts: string[]; threads: MailThreadSummary[] }> {
  const scope = options.scope ?? "all";
  const allAccounts = filterAccountsForScope(
    await listConnectedMailAccounts(options.clerkUserId),
    scope
  );
  const accountEmails = new Set(
    allAccounts
      .map((a) => a.email)
      .filter((email) => !options.account || email === options.account)
  );
  const providerByEmail = new Map(
    allAccounts.map((a) => [a.email, a.provider] as const)
  );

  const snoozed = await mailStore().snoozes.listActive(100);
  const rows = snoozed.filter((r) => accountEmails.has(r.accountEmail));
  if (!rows.length) {
    return { accounts: allAccounts.map((a) => a.email), threads: [] };
  }

  const classifier = await getClassifier(options.clerkUserId);
  const built = await mapWithConcurrency(
    rows,
    async (row): Promise<MailThreadSummary | null> => {
      const accountEmail = row.accountEmail;
      const threadId = row.threadId;
      const snoozedUntil = row.snoozedUntil;
      const provider = providerByEmail.get(accountEmail) ?? "gmail";
      try {
        if (provider === "outlook") {
          const detail = await getOutlookMailThread(accountEmail, threadId, {
            limit: 1,
          });
          const latest = detail.messages[detail.messages.length - 1];
          const counterpartEmail =
            latest && !latest.own
              ? latest.fromEmail
              : detail.reply.to[0] || accountEmail;
          const counterpartName =
            latest && !latest.own ? latest.fromName : counterpartEmail;
          const matchesContact = isKnownContact(counterpartEmail, classifier);
          return {
            account: accountEmail,
            threadId,
            subject: detail.subject,
            fromName: counterpartName || counterpartEmail,
            fromEmail: counterpartEmail,
            snippet: latest?.bodyText?.slice(0, 160) ?? "",
            lastAt: latest?.sentAt ?? snoozedUntil,
            unread: false,
            messageCount: detail.messages.length,
            tab: matchesContact ? "people" : "other",
            externalParticipants: counterpartEmail
              ? [{ name: counterpartName, email: counterpartEmail }]
              : [],
            crmName: crmNameFor(counterpartEmail, classifier),
            crmLogoUrl: crmLogoFor(counterpartEmail, classifier),
            snoozedUntil,
          };
        }

        const token = await accessTokenFor(accountEmail);
        const thread = await getThreadMetadata(
          token,
          threadId,
          METADATA_HEADERS
        );
        const threadMessages = [...(thread.messages ?? [])];
        if (!threadMessages.length) return null;
        threadMessages.sort((a, b) => messageDate(a) - messageDate(b));
        const latest = threadMessages[threadMessages.length - 1];
        const participants = threadMessages.flatMap((m) => [
          ...parseAddressList(headerValue(m, "From")),
          ...parseAddressList(headerValue(m, "To")),
          ...parseAddressList(headerValue(m, "Cc")),
        ]);
        const external = participants.filter(
          (p) => !isSelfAddress(p.email, accountEmail)
        );
        const matchesContact = external.some((p) =>
          isKnownContact(p.email, classifier)
        );
        const latestFrom = parseAddressList(headerValue(latest, "From"))[0];
        const latestToExternal = parseAddressList(
          headerValue(latest, "To")
        ).filter((p) => !isSelfAddress(p.email, accountEmail));
        const counterpart =
          latestFrom && !isSelfAddress(latestFrom.email, accountEmail)
            ? latestFrom
            : latestToExternal[0] ??
              external[0] ??
              latestFrom ?? { email: accountEmail, name: "" };
        return {
          account: accountEmail,
          threadId,
          subject: headerValue(latest, "Subject").trim() || "(no subject)",
          fromName: displayName(counterpart),
          fromEmail: counterpart.email,
          snippet: decodeSnippet(latest.snippet ?? ""),
          lastAt: new Date(messageDate(latest)).toISOString(),
          unread: threadMessages.some((m) =>
            (m.labelIds ?? []).includes("UNREAD")
          ),
          messageCount: threadMessages.length,
          tab: matchesContact ? "people" : "other",
          externalParticipants: external.map((p) => ({ ...p })),
          crmName: crmNameFor(counterpart.email, classifier),
          crmLogoUrl: crmLogoFor(counterpart.email, classifier),
          snoozedUntil,
        };
      } catch (err) {
        console.warn(
          `[mail] snoozed thread fetch failed for ${accountEmail}/${threadId}:`,
          err
        );
        return null;
      }
    }
  );

  return {
    accounts: allAccounts.map((a) => a.email),
    threads: built.filter((t): t is MailThreadSummary => t != null),
  };
}

export type { MailAutoReply } from "@/lib/mail/mail-autoreply";
export {
  listMailAutoReplies,
  setMailAutoReply,
} from "@/lib/mail/mail-autoreply";
