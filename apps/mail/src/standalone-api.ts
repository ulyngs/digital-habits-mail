/**
 * Answers `/api/mail/*` inside the app, with no server.
 *
 * The planner serves these paths from Next route handlers. This product has no
 * server, so the same paths route straight to the mail core running in this
 * webview. To-Do does the same thing in `standalone-api.ts`.
 *
 * The paths are the contract, not an implementation detail: the user interface
 * calls the same strings on every host, and only the transport differs.
 */

import {
  archiveMailThread,
  getMailThread,
  listSnoozedThreads,
  listUnifiedInbox,
  markMailThreadUnread,
  snoozeMailThread,
  trashMailThread,
  unarchiveMailThread,
  unsnoozeMailThread,
  untrashMailThread,
} from "@/lib/mail/inbox";
import { discardProviderDraft, markMailThreadRead } from "@/lib/mail/inbox";
import {
  listMailAutoReplies,
  setMailAutoReply,
} from "@/lib/mail/mail-autoreply";
import { countActiveSnoozes } from "@/lib/mail/mail-snooze-count";
import {
  createMailFolder,
  deleteMailFolder,
  listMailFolders,
  renameMailFolder,
  moveMailThreadToFolder,
  unmoveMailThreadFromFolder,
} from "@/lib/mail/folders";
import {
  createMailContactList,
  deleteMailContactList,
  listMailContactLists,
  updateMailContactList,
} from "@/lib/mail/contact-lists";
import {
  hasUnsyncedContactSources,
  hideHistorySuggestion,
  listContactSourceStatuses,
  listMergedMailContacts,
  setContactSourceEnabled,
  syncAllContactSources,
} from "@/lib/mail/contact-sources";
import { fetchMailAttachment } from "@/lib/mail/inbox";
import {
  ATTACHMENT_SNIFF_HEADERS,
  attachmentContentDisposition,
  safeAttachmentMimeType,
} from "@/lib/mail/attachment-mime";
import {
  getSenderNameSettings,
} from "@/lib/mail/sender-identity";
import {
  getMailSignatureSettings,
  setMailSignatureSettings,
} from "@/lib/mail/settings";
import {
  ensureThreadConversation,
  getChatForThread,
  listChatParts,
  prepareChatSend,
  recordChatSend,
  setThreadChatStyle,
} from "@/lib/mail/chats";
import { chatTitleFromCounterpart } from "@/lib/mail/chat-types";
import {
  listProviderDrafts,
  markMailThreadJunk,
  markMailThreadNotJunk,
  sendMailMessage,
  listScheduledMailMessages,
  listAllScheduledMailMessages,
  cancelScheduledMailMessage,
  sendScheduledMailMessageNow,
} from "@/lib/mail/inbox";
import { listConnectedMailAccounts } from "@/lib/mail/providers";
import { invalidateMailCaches, invalidateInboxCache } from "@/lib/mail/inbox-cache";
import {
  deleteGmailAccount,
  listGmailAccounts,
  reorderGmailAccounts,
  setAccountInMailTab,
} from "@/lib/gmail/accounts";
import {
  deleteOutlookAccount,
  listOutlookAccounts,
  reorderOutlookAccounts,
  setOutlookAccountInMailTab,
} from "@/lib/outlook/accounts";
import {
  MAIL_PUBLIC_AI_DISABLED_MESSAGE,
  MAIL_PUBLIC_CRM_DISABLED_MESSAGE,
  mailOrgAiAllowed,
  mailUsesCrmPeople,
} from "@/lib/mail/product-flavor";
import { PlanError } from "@/lib/plan/errors";

import { connectConfigError } from "./oauth-config";
import { plannerJson } from "./planner-api";

/** Single user, so every call is for the same owner. */
const OWNER_ID = "local";

/**
 * The thread as the planner's CRM functions read it. The pane holds the
 * thread; the planner has no mailbox token to load one with, so it goes in
 * the request. Bodies are cut: the server cuts them again for the model, and
 * an attachment-heavy thread should not travel whole.
 */
async function threadForPlanner(account: string, threadId: string) {
  const thread = await getMailThread(account, threadId, { limit: 50, markRead: false });
  return {
    subject: thread.subject,
    messages: thread.messages.map((m) => ({
      fromEmail: m.fromEmail,
      fromName: m.fromName,
      toEmails: m.toEmails,
      ccEmails: m.ccEmails,
      sentAt: m.sentAt,
      own: m.own,
      bodyText: (m.bodyText || "").slice(0, 8000),
    })),
  };
}

/** What the composer sends. Mirrors the planner route's schema. */
type SendInput = {
  account: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  html?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  includeSignature?: boolean;
  messageCount?: number;
  noQuote?: boolean;
  chatMode?: boolean;
  startChat?: boolean;
  forward?: Parameters<typeof sendMailMessage>[0]["forward"];
  quote?: Parameters<typeof sendMailMessage>[0]["quote"];
  appendix?: Parameters<typeof sendMailMessage>[0]["appendix"];
  attachments?: Parameters<typeof sendMailMessage>[0]["attachments"];
  /** A provider draft this send replaces; discarded once the mail is away. */
  discardProviderDraft?: string;
  /** Hold until this time (ISO 8601). Outlook only — see sendMailMessage. */
  sendAt?: string;
  /** Put a note on the matching CRM records after the send. Team layer only. */
  updateCrmNotes?: boolean;
};

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/**
 * An error, with the status the core meant.
 *
 * The core says what went wrong by throwing a PlanError carrying a status, and
 * the planner's route helper passes it through. Flattening every one of those
 * to 500 would turn "not found" and "not allowed" into "something broke".
 */
function failed(error: unknown, status?: number): Response {
  const message = error instanceof Error ? error.message : String(error);
  const fromError =
    error instanceof PlanError && error.status >= 400 ? error.status : undefined;
  return new Response(JSON.stringify({ error: message }), {
    status: status ?? fromError ?? 500,
    headers: { "content-type": "application/json" },
  });
}

/** Routes one path to the core. Unknown paths say so, with the path. */
export async function handleStandaloneMailApi(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = new URL(path, "http://local.invalid");
  const q = url.searchParams;
  const method = (init?.method ?? "GET").toUpperCase();
  const body = async <T>(): Promise<T> =>
    init?.body ? (JSON.parse(String(init.body)) as T) : ({} as T);

  try {
    switch (url.pathname) {
      case "/api/mail/threads": {
        const result = await listUnifiedInbox({
          clerkUserId: OWNER_ID,
          account: q.get("account") ?? undefined,
          // The core takes a closed set, so anything else is not a folder.
          folder:
            q.get("folder") === "sent"
              ? "sent"
              : q.get("folder") === "trash"
                ? "trash"
                : q.get("folder") === "junk"
                  ? "junk"
                  : undefined,
          label: q.get("label") ?? undefined,
          q: q.get("q") ?? undefined,
          includeDeleted: q.get("includeDeleted") === "1",
          cursor: q.get("cursor") ?? undefined,
          fresh: q.get("fresh") === "1",
          incremental: q.get("incremental") === "1",
        });
        return ok({ success: true, ...result });
      }

      case "/api/mail/thread": {
        const account = q.get("account");
        const id = q.get("id");
        if (!account || !id) return failed("account and id are required", 400);
        const count = Number(q.get("count"));
        const rawLimit = Number(q.get("limit"));
        const thread = await getMailThread(account, id, {
          before: q.get("before") ?? undefined,
          after: q.get("after") ?? undefined,
          around: q.get("around") ?? undefined,
          // The oldest page, for the header's "started" peek and the jump.
          oldest: q.get("oldest") === "1",
          limit:
            Number.isFinite(rawLimit) && rawLimit > 0
              ? Math.min(rawLimit, 100)
              : undefined,
          markRead: q.get("markRead") !== "0",
          messageCountHint:
            Number.isFinite(count) && count > 0 ? count : undefined,
        });
        return ok({ success: true, thread });
      }

      /** Messages the provider is holding for a thread, and the two ways out. */
      case "/api/mail/scheduled": {
        if (method === "GET") {
          const account = q.get("account");
          const threadId = q.get("threadId");
          // No account named: everything held, for the group at the top of
          // the list. One thread named: just that conversation.
          const messages = account
            ? await listScheduledMailMessages({
                account,
                threadId: threadId ?? undefined,
              })
            : await listAllScheduledMailMessages({ clerkUserId: OWNER_ID });
          return ok({ success: true, messages });
        }
        if (method === "POST") {
          const input = await body<{
            account?: string;
            id?: string;
            action?: "cancel" | "sendNow";
          }>();
          if (!input.account || !input.id) {
            return failed("account and id are required", 400);
          }
          if (input.action === "sendNow") {
            await sendScheduledMailMessageNow({
              account: input.account,
              id: input.id,
            });
          } else {
            await cancelScheduledMailMessage({
              account: input.account,
              id: input.id,
            });
          }
          return ok({ success: true });
        }
        return failed("method not allowed", 405);
      }

      case "/api/mail/folders": {
        // The provider work is in the core and is the same for both hosts —
        // Gmail renames the label, Graph renames the folder. Only the wiring
        // was missing here, which is why Rename looked available and was not.
        if (method === "POST") {
          const input = await body<{ name?: string; account?: string }>();
          if (!input.name?.trim()) {
            return failed("A folder name is required", 400);
          }
          const folder = await createMailFolder({
            name: input.name,
            account: input.account,
            clerkUserId: OWNER_ID,
          });
          return ok({ folder });
        }
        if (method === "PATCH") {
          const input = await body<{
            name?: string;
            newName?: string;
            account?: string;
          }>();
          if (!input.name?.trim() || !input.newName?.trim()) {
            return failed("Both the old and the new name are required", 400);
          }
          const folder = await renameMailFolder({
            name: input.name,
            newName: input.newName,
            account: input.account,
            clerkUserId: OWNER_ID,
          });
          return ok({ folder });
        }
        if (method === "DELETE") {
          const input = await body<{ name?: string; account?: string }>();
          if (!input.name?.trim()) {
            return failed("A folder name is required", 400);
          }
          // Named account only, the way the rename is: a row in the rail
          // stands under one heading, and means that mailbox's folder.
          // The two providers differ in what deleting means, and the core
          // knows which is which — Gmail takes a label off its
          // conversations and leaves them in All Mail, Graph moves the
          // folder into Deleted Items with everything inside it.
          const deleted = await deleteMailFolder({
            name: input.name,
            account: input.account,
            clerkUserId: OWNER_ID,
          });
          return ok(deleted);
        }
        if (method !== "GET") {
          return failed(`${method} on folders is not built yet`, 501);
        }
        const folders = await listMailFolders({
          clerkUserId: OWNER_ID,
          account: q.get("account") ?? undefined,
        });
        return ok({ folders });
      }

      case "/api/mail/drafts": {
        if (method !== "GET") {
          return failed(`${method} on drafts is not built yet`, 501);
        }
        const only = q.get("account");
        const accounts = only
          ? [only]
          : (await listConnectedMailAccounts(OWNER_ID)).map((a) => a.email);
        // One unreachable mailbox must not empty the whole list.
        const perAccount = await Promise.all(
          accounts.map((account) =>
            listProviderDrafts(account).catch((err) => {
              console.warn(`[mail] drafts failed for ${account}:`, err);
              return [];
            })
          )
        );
        const drafts = perAccount
          .flat()
          .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
        return ok({ drafts });
      }

      case "/api/mail/archive":
      case "/api/mail/unarchive":
      case "/api/mail/trash":
      case "/api/mail/untrash":
      case "/api/mail/junk":
      case "/api/mail/not-junk":
      case "/api/mail/unread": {
        const input = await body<{ account: string; threadId: string }>();
        if (!input.account || !input.threadId) {
          return failed("account and threadId are required", 400);
        }
        const act = {
          "/api/mail/archive": archiveMailThread,
          "/api/mail/unarchive": unarchiveMailThread,
          "/api/mail/trash": trashMailThread,
          "/api/mail/untrash": untrashMailThread,
          "/api/mail/junk": markMailThreadJunk,
          "/api/mail/not-junk": markMailThreadNotJunk,
          "/api/mail/unread": markMailThreadUnread,
        }[url.pathname]!;
        // The owner is passed so the ones that take a thread out of the inbox
        // can drop it from the stored list page too. The others ignore it.
        await act(input.account, input.threadId, OWNER_ID);
        return ok({ success: true });
      }

      case "/api/mail/snooze": {
        const input = await body<{
          account: string;
          threadId: string;
          until: string;
        }>();
        await snoozeMailThread(input.account, input.threadId, input.until);
        return ok({ success: true });
      }

      case "/api/mail/unsnooze": {
        const input = await body<{ account: string; threadId: string }>();
        await unsnoozeMailThread(input.account, input.threadId);
        return ok({ success: true });
      }

      case "/api/mail/snoozed": {
        if (q.get("countOnly") === "1") {
          const count = await countActiveSnoozes({
            clerkUserId: OWNER_ID,
            account: q.get("account") ?? undefined,
          });
          return ok({ success: true, count });
        }
        const result = await listSnoozedThreads({
          clerkUserId: OWNER_ID,
          account: q.get("account") ?? undefined,
        });
        return ok({ success: true, ...result });
      }

      case "/api/mail/contacts": {
        const contacts = await listMergedMailContacts(OWNER_ID);
        return ok({ contacts, sources: [] });
      }

      case "/api/mail/signature": {
        if (method === "GET") {
          const account = q.get("account");
          if (!account) return failed("account is required", 400);
          return ok(await getMailSignatureSettings(account));
        }
        const { account, ...settings } = await body<{
          account: string;
          signature: string;
          includeOnNew: boolean;
          includeOnReplies: boolean;
        }>();
        await setMailSignatureSettings(account, settings);
        return ok({ ok: true });
      }

      // Read only: the provider owns the name, and Mail keeps none of its own.
      case "/api/mail/sender-name": {
        const account = q.get("account");
        if (!account) return failed("account is required", 400);
        return ok(await getSenderNameSettings(account));
      }

      /**
       * Sending, mirroring the planner route step for step.
       *
       * The one thing left out is the CRM note it writes afterwards, which
       * belongs to a layer this build does not have.
       *
       * A conversation binding can rotate to a new provider thread mid-send, so
       * the thread the message goes to is the one prepareChatSend names, not
       * the one the composer started from.
       */
      case "/api/mail/send": {
        const input = await body<SendInput>();
        if (!input.account || !input.to?.length) {
          return failed("account and at least one recipient are required", 400);
        }
        const wantNoQuote = Boolean(
          input.noQuote || input.chatMode || input.startChat
        );

        // A new message with chat style on: send it, then remember the choice.
        if (input.startChat) {
          const counterpartEmail = input.to[0]!;
          const title = chatTitleFromCounterpart("", counterpartEmail);
          const sent = await sendMailMessage({
            account: input.account,
            to: input.to,
            cc: input.cc,
            bcc: input.bcc,
            subject: input.subject,
            body: input.body,
            html: input.html,
            attachments: input.attachments,
            discardProviderDraft: input.discardProviderDraft,
            includeSignature: false,
          });
          if (!sent.threadId) {
            return ok({ success: true, chat: null, rotated: false });
          }
          const chat = await ensureThreadConversation({
            account: input.account,
            threadId: sent.threadId,
            title,
            subject: input.subject,
            counterpartName: title,
            counterpartEmail,
            participantEmails: input.to,
            messageCount: 1,
            noQuote: true,
          });
          return ok({
            success: true,
            chat,
            threadId: sent.threadId,
            messageId: sent.messageId,
            rotated: false,
          });
        }

        if (input.threadId) {
          let bound = await getChatForThread(input.account, input.threadId);
          // A thread long enough to need parts gets bound even without chat
          // style, so it can rotate before it becomes slow in every client.
          const shouldBindForParts = !bound && (input.messageCount ?? 0) >= 1000;
          if (!bound && (wantNoQuote || shouldBindForParts)) {
            bound = await ensureThreadConversation({
              account: input.account,
              threadId: input.threadId,
              subject: input.subject,
              counterpartName: "",
              counterpartEmail: input.to[0] ?? "",
              participantEmails: input.to,
              messageCount: input.messageCount,
              noQuote: wantNoQuote,
            });
          }

          if (bound) {
            const prep = await prepareChatSend({
              account: input.account,
              threadId: input.threadId,
            });
            const noQuote = wantNoQuote || prep.chat.noQuote;
            const sent = await sendMailMessage({
              account: input.account,
              to: input.to,
              cc: input.cc,
              bcc: input.bcc,
              subject: prep.subject,
              body: input.body,
              html: input.html,
              forward: input.forward,
              attachments: input.attachments,
              discardProviderDraft: input.discardProviderDraft,
              quote: noQuote ? undefined : input.quote,
              appendix: noQuote ? undefined : input.appendix,
              threadId: prep.sendThreadId ?? undefined,
              inReplyTo: prep.sendThreadId ? input.inReplyTo : undefined,
              references: prep.sendThreadId ? input.references : undefined,
              // Whatever the composer asked for. Chat style used to force the
          // signature off here, which quietly undid the composer's own
          // choice: leaving the history out says nothing about signing.
          includeSignature: input.includeSignature,
            });
            const bindThreadId = sent.threadId || prep.sendThreadId;
            if (!bindThreadId) {
              return ok({
                success: true,
                chat: prep.chat,
                rotated: prep.rotated,
              });
            }
            const chat = await recordChatSend({
              account: input.account,
              chatId: prep.chat.chatId,
              subject: prep.subject,
              providerThreadId: bindThreadId,
              tipMessageId: sent.messageId,
            });
            return ok({
              success: true,
              chat,
              threadId: bindThreadId,
              messageId: sent.messageId,
              rotated: prep.rotated,
            });
          }
        }

        await sendMailMessage({
          account: input.account,
          to: input.to,
          cc: input.cc,
          bcc: input.bcc,
          subject: input.subject,
          body: input.body,
          html: input.html,
          threadId: input.threadId,
          inReplyTo: input.inReplyTo,
          references: input.references,
          forward: input.forward,
          attachments: input.attachments,
          discardProviderDraft: input.discardProviderDraft,
          quote: wantNoQuote ? undefined : input.quote,
          appendix: wantNoQuote ? undefined : input.appendix,
          includeSignature: input.includeSignature,
          sendAt: input.sendAt,
        });
        // The composer's "propose CRM updates" switch. The planner reads the
        // thread and the message just sent, and proposes; the interface
        // shows the proposals and applies the ones the reader keeps.
        let crmProposal: unknown;
        if (input.updateCrmNotes && mailUsesCrmPeople()) {
          try {
            const thread = input.threadId
              ? await threadForPlanner(input.account, input.threadId)
              : { subject: input.subject, messages: [] };
            thread.messages.push({
              fromEmail: input.account,
              fromName: "",
              toEmails: input.to,
              ccEmails: input.cc ?? [],
              sentAt: new Date().toISOString(),
              own: true,
              bodyText: input.body.slice(0, 8000),
            });
            crmProposal = await plannerJson<Record<string, unknown>>("/api/agent/mail/propose", {
              method: "POST",
              body: { account: input.account, thread },
            });
          } catch (err) {
            crmProposal = { error: err instanceof Error ? err.message : String(err) };
          }
        }
        return ok({ success: true, crmProposal });
      }

      case "/api/mail/chat-style": {
        const input = await body<{
          account: string;
          threadId: string;
          noQuote: boolean;
          title?: string;
          subject?: string;
          participantEmails?: string[];
          counterpartName?: string;
          counterpartEmail?: string;
          messageCount?: number;
        }>();
        return ok({ success: true, chat: await setThreadChatStyle(input) });
      }

      case "/api/mail/folders/move": {
        const input = await body<{
          account: string;
          threadId: string;
          folderName: string;
          create?: boolean;
        }>();
        return ok({ success: true, ...(await moveMailThreadToFolder(input)) });
      }

      case "/api/mail/folders/unmove": {
        const input = await body<{
          account: string;
          threadId: string;
          folderName: string;
        }>();
        await unmoveMailThreadFromFolder(input);
        return ok({ success: true });
      }

      case "/api/mail/contact-lists": {
        if (method === "GET") {
          return ok({ lists: await listMailContactLists() });
        }
        if (method === "DELETE") {
          const id = q.get("id")?.trim();
          if (!id) return failed("id is required", 400);
          await deleteMailContactList(id);
          return ok({ success: true });
        }
        if (method === "PATCH") {
          const input = await body<{
            id: string;
            name?: string;
            members?: { email: string; name?: string; initials?: string }[];
          }>();
          return ok({ list: await updateMailContactList(input) });
        }
        const input = await body<{
          name: string;
          members: { email: string; name?: string; initials?: string }[];
        }>();
        return ok({ list: await createMailContactList(input) });
      }

      /**
       * The connected mailboxes, per provider. Two paths rather than one,
       * because that is what the planner serves and the interface calls both.
       *
       * `configError` disables the matching connect button. Here it means the
       * build has no client for that provider, not that a server is missing a
       * secret.
       */
      case "/api/gmail/accounts":
      case "/api/outlook/accounts": {
        const provider =
          url.pathname === "/api/outlook/accounts" ? "outlook" : "gmail";
        const owner = { clerkUserId: OWNER_ID };

        if (method === "GET") {
          const accounts =
            provider === "gmail"
              ? await listGmailAccounts(owner)
              : await listOutlookAccounts(owner);
          return ok({
            success: true,
            accounts,
            configError: connectConfigError(provider),
          });
        }

        if (method === "PATCH") {
          const input = await body<{
            order?: string[];
            email?: string;
            inMailTab?: boolean;
          }>();
          if (Array.isArray(input.order)) {
            if (provider === "gmail") {
              await reorderGmailAccounts(input.order, OWNER_ID);
            } else {
              await reorderOutlookAccounts(input.order, OWNER_ID);
            }
            return ok({ ok: true, success: true });
          }
          if (!input.email || typeof input.inMailTab !== "boolean") {
            return failed("email and inMailTab required", 400);
          }
          if (provider === "gmail") {
            await setAccountInMailTab(input.email, input.inMailTab, OWNER_ID);
          } else {
            await setOutlookAccountInMailTab(
              input.email,
              input.inMailTab,
              OWNER_ID
            );
          }
          // Drop list caches so the next read omits a hidden mailbox.
          invalidateInboxCache();
          return ok({ ok: true, success: true });
        }

        if (method === "DELETE") {
          const email = q.get("email")?.trim();
          if (!email) return failed("email required", 400);
          const removed =
            provider === "gmail"
              ? await deleteGmailAccount(email, OWNER_ID)
              : await deleteOutlookAccount(email, OWNER_ID);
          if (!removed) return failed("Account not found", 404);
          invalidateInboxCache();
          return ok({ ok: true, success: true });
        }

        return failed(`${method} is not allowed here`, 405);
      }

      /**
       * Out of office.
       *
       * Not a team-layer feature: it is the provider's own vacation setting,
       * and this build asks for `gmail.settings.basic` already — the scope the
       * signature needs covers it. Only the button that writes the message
       * with AI is absent, and the interface hides that one.
       */
      case "/api/mail/autoreply": {
        if (method === "GET") {
          return ok({ autoReplies: await listMailAutoReplies("all", OWNER_ID) });
        }
        const input = await body<Parameters<typeof setMailAutoReply>[0]>();
        return ok({ autoReply: await setMailAutoReply(input) });
      }

      case "/api/mail/read": {
        const input = await body<{ account: string; threadId: string }>();
        await markMailThreadRead(input.account, input.threadId);
        return ok({ success: true });
      }

      case "/api/mail/drafts/discard": {
        const input = await body<{
          account: string;
          ref: string;
          threadId?: string;
        }>();
        if (!input.account || !input.ref) {
          return failed("account and ref are required", 400);
        }
        await discardProviderDraft(input);
        return ok({ success: true });
      }

      case "/api/mail/attachment": {
        const account = q.get("account");
        const messageId = q.get("messageId");
        const attachmentId = q.get("attachmentId");
        if (!account || !messageId || !attachmentId) {
          return failed(
            "account, messageId, and attachmentId are required",
            400
          );
        }
        const { bytes } = await fetchMailAttachment({
          account,
          messageId,
          attachmentId,
        });
        const filename = q.get("filename") || "attachment";
        const download = q.get("download") === "1";
        const body = new Uint8Array(bytes);
        // Not JSON: the caller reads this as bytes or points an element at it.
        return new Response(body, {
          status: 200,
          headers: {
            // The sender chose both of these. See @/lib/mail/attachment-mime.
            "Content-Type": safeAttachmentMimeType(q.get("mimeType"), {
              download,
              bytes: body,
            }),
            "Content-Length": String(bytes.length),
            "Content-Disposition": attachmentContentDisposition(filename, {
              download,
            }),
            ...ATTACHMENT_SNIFF_HEADERS,
          },
        });
      }

      case "/api/mail/contact-sources": {
        if (method === "GET") {
          return ok({ sources: await listContactSourceStatuses(OWNER_ID) });
        }
        const input = await body<{
          hideEmail?: string;
          key?: string;
          enabled?: boolean;
        }>();
        if (input.hideEmail) {
          await hideHistorySuggestion(input.hideEmail);
          return ok({ ok: true });
        }
        if (!input.key) return failed("key is required", 400);
        // The panel replaces its list from the answer, so the answer carries
        // the list. Settings alone left it with nothing to render.
        const settings = await setContactSourceEnabled(
          input.key,
          input.enabled !== false
        );
        return ok({
          settings,
          sources: await listContactSourceStatuses(OWNER_ID),
        });
      }

      case "/api/mail/contact-sources/sync": {
        if (
          q.get("ifStale") === "1" &&
          !(await hasUnsyncedContactSources(OWNER_ID))
        ) {
          return ok({ skipped: true, results: [] });
        }
        const results = await syncAllContactSources({
          clerkUserId: OWNER_ID,
        });
        // The classifier holds its index for minutes. Without this, contacts
        // that just arrived are not treated as contacts until it expires.
        invalidateMailCaches();
        return ok({ skipped: false, results });
      }

      case "/api/mail/chat/parts": {
        const account = q.get("account");
        const chatId = q.get("chatId");
        if (!account || !chatId) {
          return failed("account and chatId are required", 400);
        }
        return ok({ parts: await listChatParts(account, chatId) });
      }

      /*
       * The team layer, over the planner API. The CRM and the organization's
       * model key are on the planner server; mail is here. The pane sends
       * the thread it holds and gets the same answer the planner route gave.
       * The public flavor never gets here: the interface hides these
       * actions, and the answer says why if it asks anyway.
       */
      case "/api/mail/add-to-crm": {
        if (!mailUsesCrmPeople()) return failed(MAIL_PUBLIC_CRM_DISABLED_MESSAGE, 403);
        const input = await body<{
          account: string;
          threadId: string;
          targets: string[];
          note?: string;
        }>();
        if (!input.account || !input.threadId) {
          return failed("account and threadId are required", 400);
        }
        const answer = await plannerJson<{ results: unknown[] }>(
          "/api/agent/mail/add-to-crm",
          {
            method: "POST",
            body: {
              account: input.account,
              thread: await threadForPlanner(input.account, input.threadId),
              targets: input.targets,
              note: input.note,
            },
          }
        );
        invalidateMailCaches();
        return ok({ success: true, results: answer.results });
      }

      case "/api/mail/update-crm": {
        if (!mailUsesCrmPeople()) return failed(MAIL_PUBLIC_CRM_DISABLED_MESSAGE, 403);
        const input = await body<{ account: string; threadId: string; phase?: string }>();
        if (!input.account || !input.threadId) {
          return failed("account and threadId are required", 400);
        }
        const answer = await plannerJson<{ crmNotes: unknown }>("/api/agent/mail/update-crm", {
          method: "POST",
          body: {
            account: input.account,
            thread: await threadForPlanner(input.account, input.threadId),
            phase: input.phase,
          },
        });
        return ok({ success: true, crmNotes: answer.crmNotes });
      }

      /*
       * The AI proposes; the reader applies. crm-propose sends the thread
       * (and, after a send, the message just sent, which the provider may
       * not list yet) to the planner and gets candidate records and proposed
       * tool calls back. crm-apply runs the ones the reader kept.
       */
      case "/api/mail/crm-propose": {
        if (!mailUsesCrmPeople()) return failed(MAIL_PUBLIC_CRM_DISABLED_MESSAGE, 403);
        const input = await body<{
          account: string;
          threadId?: string;
          hint?: string;
          phase?: "match" | "propose";
          sent?: { to: string[]; cc?: string[]; subject: string; body: string };
          attachments?: { filename: string; text: string }[];
        }>();
        if (!input.account) return failed("account is required", 400);
        const thread = input.threadId
          ? await threadForPlanner(input.account, input.threadId)
          : { subject: input.sent?.subject ?? "", messages: [] };
        if (input.sent) {
          thread.messages.push({
            fromEmail: input.account,
            fromName: "",
            toEmails: input.sent.to,
            ccEmails: input.sent.cc ?? [],
            sentAt: new Date().toISOString(),
            own: true,
            bodyText: input.sent.body.slice(0, 8000),
          });
          if (!thread.subject) thread.subject = input.sent.subject;
        }
        const answer = await plannerJson<Record<string, unknown>>("/api/agent/mail/propose", {
          method: "POST",
          body: {
            account: input.account,
            thread,
            hint: input.hint,
            phase: input.phase,
            attachments: input.attachments,
          },
        });
        return ok(answer);
      }

      case "/api/mail/crm-find-logo": {
        if (!mailUsesCrmPeople()) return failed(MAIL_PUBLIC_CRM_DISABLED_MESSAGE, 403);
        const input = await body<{ site: string }>();
        return ok(
          await plannerJson<Record<string, unknown>>("/api/agent/mail/find-logo", {
            method: "POST",
            body: { site: input.site },
          })
        );
      }

      case "/api/mail/crm-apply": {
        if (!mailUsesCrmPeople()) return failed(MAIL_PUBLIC_CRM_DISABLED_MESSAGE, 403);
        const input = await body<{ proposals: unknown[] }>();
        const answer = await plannerJson<Record<string, unknown>>("/api/agent/mail/apply", {
          method: "POST",
          body: { proposals: input.proposals },
        });
        invalidateMailCaches();
        return ok(answer);
      }

      case "/api/mail/autoreply/draft": {
        if (!mailOrgAiAllowed()) return failed(MAIL_PUBLIC_AI_DISABLED_MESSAGE, 403);
        const input = await body<Record<string, unknown>>();
        const answer = await plannerJson<{ draft: unknown }>("/api/agent/mail/autoreply-draft", {
          method: "POST",
          body: input,
        });
        return ok({ draft: answer.draft });
      }

      default:
        return failed(`No local handler for ${url.pathname} yet`, 501);
    }
  } catch (error) {
    return failed(error);
  }
}

/**
 * Paths this build answers. The rest still report 501 by name.
 *
 * Every path the interface calls is answered here, except the ones this flavor
 * does not have: add-to-CRM, CRM notes, and the two AI drafts, which all belong
 * to the team layer. The interface hides those, so they are unreachable rather
 * than broken.
 *
 * Calendar invites need nothing here. `isNativeShell()` is true in this build,
 * so an invite goes straight to the shell's open_calendar_invite command and
 * never reaches a path at all. Creating and renaming labels is the same story
 * in reverse: the interface offers it only where a planner route exists.
 *
 * Remote images do not come through here at all. An `img` inside the message
 * frame is loaded by the webview, not by our code, so the shell answers a
 * scheme of its own instead. See `products/mail/crates/mail-native/src/images.rs`.
 */
export const STANDALONE_MAIL_PATHS = [
  "/api/mail/threads",
  "/api/mail/thread",
  "/api/mail/folders",
  "/api/mail/drafts",
  "/api/mail/junk",
  "/api/mail/not-junk",
  "/api/mail/archive",
  "/api/mail/unarchive",
  "/api/mail/trash",
  "/api/mail/untrash",
  "/api/mail/unread",
  "/api/mail/read",
  "/api/mail/drafts/discard",
  "/api/mail/autoreply",
  "/api/mail/snooze",
  "/api/mail/unsnooze",
  "/api/mail/snoozed",
  "/api/mail/contacts",
  "/api/mail/signature",
  "/api/mail/sender-name",
  "/api/mail/chat/parts",
  "/api/mail/attachment",
  "/api/mail/contact-sources",
  "/api/mail/contact-sources/sync",
  "/api/mail/send",
  "/api/mail/chat-style",
  "/api/mail/folders/move",
  "/api/mail/folders/unmove",
  "/api/mail/contact-lists",
  "/api/gmail/accounts",
  "/api/outlook/accounts",
] as const;
