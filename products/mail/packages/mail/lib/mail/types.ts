/** Client-safe DTOs for the Mail tab (no server-only imports). */

import type { MailChatRef } from "@/lib/mail/chat-types";

export type MailTab = "people" | "other";

export type { MailChatRef };

export type MailThreadSummary = {
  /** Gmail account (mailbox) this thread copy lives in. */
  account: string;
  threadId: string;
  subject: string;
  /** Display name/email of the counterpart shown in the list row. */
  fromName: string;
  fromEmail: string;
  snippet: string;
  /** ISO timestamp of the newest message. */
  lastAt: string;
  unread: boolean;
  messageCount: number;
  tab: MailTab;
  /**
   * Everyone on the thread except our own addresses, deduped by email.
   * Lets the People view key group conversations (3+ correspondents) by
   * their participant set instead of whoever happened to write last.
   */
  externalParticipants: { name: string; email: string }[];
  /** CRM record the counterpart belongs to (affiliation label), if known. */
  crmName?: string;
  /** Institution/person Logo from the matched CRM record, when present. */
  crmLogoUrl?: string;
  /**
   * When the list came from search, the message that matched — open the
   * thread centered on this id instead of the newest tip.
   */
  focusMessageId?: string;
  /** Bound into a multi-part conversation (optional chat-style prefs). */
  chat?: MailChatRef;
  /** Thread includes a calendar invite (.ics / meeting request). */
  hasCalendarInvite?: boolean;
  /**
   * The thread carries a real file, so the list can say so before it opens.
   *
   * Real means a file somebody attached. A signature logo is a picture in the
   * body, and both providers already know the difference — Gmail by the part's
   * disposition, Graph by `isInline`.
   */
  hasAttachments?: boolean;
  /** Short when-label for the list chip, e.g. "Thu 7 Aug, 10:00". */
  calendarInviteWhen?: string;
  /** ISO wake time when this row is from the Snoozed list. */
  snoozedUntil?: string;
  /**
   * Normalized RFC 822 Message-ID of the newest message. The same
   * conversation cc'd into several of our mailboxes shares one tipId, so
   * clients merging per-account fetches can collapse duplicate copies the
   * same way the unified server list does.
   */
  tipId?: string;
};

/** File attachment on a received message (bytes fetched on demand). */
export type MailAttachment = {
  /** Gmail attachment id (for /messages/{id}/attachments/{attachmentId}). */
  attachmentId: string;
  filename: string;
  mimeType: string;
  /** Declared size in bytes (may be 0 when Gmail omits it). */
  size: number;
};

export type MailMessage = {
  id: string;
  fromName: string;
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  sentAt: string | null;
  bodyText: string;
  /** Raw text/html part when present; sanitized client-side before display. */
  bodyHtml?: string;
  /** cid-referenced inline images as data: URIs, keyed by Content-ID. */
  inlineImages?: Record<string, string>;
  /** Named file parts (excludes cid: images already inlined in the HTML). */
  attachments?: MailAttachment[];
  /** True when sent by us (this mailbox or another own-org address). */
  own: boolean;
  /**
   * The message's RFC 5322 Message-ID, angle brackets included.
   *
   * This is the id the protocol threads by, and the one identity a message
   * keeps across providers and clients. Conversation continuity is built on
   * it — see docs/mail-chat-architecture.md.
   */
  rfcMessageId?: string;
  /** Raw In-Reply-To header, when the message carries one. */
  inReplyTo?: string;
  /** Raw References header: Message-IDs, whitespace-separated, oldest first. */
  references?: string;
};

/**
 * A row in the Drafts view: an unsent message, wherever it is kept.
 *
 * Ours live in this app and never reach the provider — that was a deliberate
 * choice, and the badge is what stops it being a surprise.
 */
export type MailDraftRow = {
  /** Stable across a refresh: the provider's message id, or our draft key. */
  id: string;
  /** Where it lives, and what the badge says. */
  origin: "here" | "gmail" | "outlook";
  /** The mailbox it belongs to. Empty for one of ours that has no From yet. */
  account: string;
  /** The thread to open, when it is a reply to something. */
  threadId: string | null;
  subject: string;
  snippet: string;
  to: string[];
  updatedAt: string | null;
};

/** A draft held by Gmail or Outlook, not by us. */
export type MailProviderDraft = {
  /**
   * What identifies it to the provider when we discard it. Gmail wants the id
   * of the draft, which is not the id of its message; Graph wants the message.
   */
  ref: string;
  bodyText: string;
  bodyHtml?: string;
  to: string[];
  cc: string[];
  updatedAt: string | null;
};

/**
 * A message the provider is holding until a time.
 *
 * Outlook only. It is not sent, and it is not a draft the reader abandoned —
 * it is a message with a time on it, which is why the thread shows it rather
 * than leaving it in a folder nobody has open.
 */
export type MailScheduledMessage = {
  /** The provider's message id: what cancels it, and what sends it. */
  id: string;
  /** ISO time it goes out. */
  sendAt: string;
  /** The mailbox holding it — a list row spans accounts. */
  account: string;
  /** The conversation it belongs to, so a row can open its thread. */
  threadId: string;
  /** Who it goes to, for the row that has no bubble to sit under. */
  toName: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  to: string[];
  cc: string[];
};

export type MailThreadDetail = {
  account: string;
  threadId: string;
  subject: string;
  /** Short display names of everyone on the thread, "You" first when present. */
  participants: string[];
  /**
   * Chronological window of messages (oldest → newest). Open loads the
   * newest page; older pages are prepended via `before`.
   */
  messages: MailMessage[];
  /** True when more older messages exist than this window. */
  hasOlder: boolean;
  /**
   * How many messages the whole thread holds, drafts excluded — not how many
   * this window carries. Gmail answers it from the thread's id list at no
   * extra cost. Absent on Outlook, where no cheap total exists, except when
   * the window is the whole conversation.
   */
  totalMessageCount?: number;
  /** True when more newer messages exist (search deep-link window). */
  hasNewer: boolean;
  /** Bound into a multi-part conversation (optional chat-style prefs). */
  chat?: MailChatRef;
  /**
   * A reply this thread already has waiting in the provider's Drafts.
   *
   * The reader wrote it in Gmail or Outlook and never sent it. The thread
   * opens with it in the composer, and sending discards it there — otherwise
   * the provider would keep a draft of a message that has gone out.
   */
  providerDraft?: MailProviderDraft;
  /** Headers needed to send a threaded reply. */
  reply: {
    inReplyTo: string;
    references: string;
    /** Reply to the sender only (our own addresses excluded). */
    to: string[];
    cc: string[];
    /** Reply all: sender plus the other recipients of the newest message. */
    allTo: string[];
    allCc: string[];
  };
};
