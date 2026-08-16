"use client";

/**
 * The open thread: its messages, the actions above them, and the reply box.
 *
 * Everything it needs arrives as a prop — it holds no page state of its own,
 * which is why 2,389 lines could leave MailPage without untangling anything.
 */

import * as React from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock,
  Forward,
  Loader2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PictureInPicture2,
  Printer,
  Reply,
  ReplyAll,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { AddToCrmMenu } from "@/components/mail/AddToCrmMenu";
import { FromAccountMenu } from "@/components/mail/FromAccountMenu";
import { MailDotIcon } from "@/components/mail/MailDotIcon";
import {
  SettingsDialog,
  settingsSecondaryButton,
} from "@/components/mail/settings-ui";
import {
  ComposerSignature,
  SentPreview,
  SignatureMetaControls,
} from "@/components/mail/composer-preview";
import {
  EmailHtmlView,
  sanitizeEmailHtml,
  stripQuotedHtml,
} from "@/components/mail/EmailHtmlView";
import { ThreadFindBar } from "@/components/mail/ThreadFindBar";
import { useThreadFind } from "@/components/mail/use-thread-find";
import {
  AttachmentPreviewDialog,
  AttachmentSizeSummary,
  AttachToolbarButton,
  attachmentUrl,
  ComposerDropOverlay,
  DraftAttachmentChips,
  ThreadAttachmentsRollup,
  useComposerFileDrop,
  useComposerPaste,
  useDraftAttachments,
} from "@/components/mail/MailAttachments";
import {
  isPendingLocalMessage,
  MailBubble,
  messageSnippet,
  readImageChoices,
  useLoadImagesByDefault,
  type OutboxStatus,
} from "@/components/mail/MailBubble";
import { printMailMessages } from "@/components/mail/print-mail";
import {
  quotedReplyMessage,
  reactionMessage,
  reactionQuoteText,
} from "@/lib/mail/reaction-message";
import {
  draftBodyForComposer,
  shouldImportProviderDraft,
} from "@/lib/mail/import-provider-draft";
import {
  actionForEvent,
  formatShortcut,
  shortcutMatchesEvent,
} from "@/lib/mail/shortcuts";
import { useMailShortcuts } from "@/lib/mail/use-mail-shortcuts";
import { MoveToFolderMenu } from "@/components/mail/MailFolders";
import {
  RecipientField,
  SaveAsListControl,
} from "@/components/mail/RecipientField";
import {
  fetchSignatureSettings,
  SignatureDialog,
  type SignatureSettings,
} from "@/components/mail/SignatureDialog";
import { SendLaterMenu } from "@/components/mail/SendLaterMenu";
import { sendWithUndo } from "@/components/mail/undo-send";
import {
  formatSnoozeWakeLabel,
  SnoozeMenu,
} from "@/components/mail/SnoozeMenu";
import { notifyScheduledChanged } from "@/lib/mail/scheduled-events";
import { useCanSendLater } from "@/lib/mail/use-outlook-accounts";
import {
  THREAD_ACTION_ACTIVE_CLASS,
  THREAD_ACTION_CLASS,
} from "@/components/mail/thread-actions";
import {
  isInteractiveDoubleClickTarget,
  useComposerWidthPct,
  usePinchZoom,
} from "@/components/mail/use-mail-layout";
import { ZoomControls } from "@/components/mail/ZoomControls";
import { EmojiPickerButton, EmojiReactionButton } from "@/components/ui/EmojiPicker";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/ui/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { MailPopoverContent } from "@/components/mail/MailPopoverContent";
import { bodyToEmailHtml, htmlToPlainText } from "@/lib/client-email-html";
import { formatEmailBody, stripQuotedReplies } from "@/lib/email-mime";
import { decodeHtmlEntities } from "@/lib/html-entities";
import {
  buildQuoteHistory,
  REPLY_HISTORY_CAP,
} from "@/lib/mail/quote-history";
import { mailApiFetch, mailApiJson as apiJson } from "@/lib/mail/api";
import {
  chatTitleFromCounterpart,
  partJumpLabel,
  type MailChatPartSummary,
  type MailChatRef,
} from "@/lib/mail/chat-types";
import {
  emailsOfRecipients,
  flattenRecipientsForSend,
  formatRecipientSummary,
  recipientsFromEmails,
  type MailRecipient,
} from "@/lib/mail/contact-list-types";
import {
  chatDayLabel,
  messageStamp,
  sameDay,
  shortDate,
  timeOfDay,
} from "@/lib/mail/date-format";
import {
  messageMeta,
  threadAuthorship,
  type MessageMeta,
} from "@/lib/mail/message-meta";
import type { MailFolder } from "@/lib/mail/folder-types";
import {
  deleteDraft,
  getDraft,
  readyAttachmentsForDraft,
  saveThreadDraft,
  threadDraftKey,
  type ThreadMailDraft,
} from "@/lib/mail/local-drafts";
import {
  cancelPendingDiscard,
  DISCARD_UNDO_MS,
  schedulePendingDiscard,
} from "@/lib/mail/pending-discard";
import { openMailChatPopout } from "@/lib/mail/popout";
import {
  CrmProposalDialog,
  type CrmProposeResult,
} from "@/components/mail/CrmProposalDialog";
import {
  canReadAttachmentText,
  isReadableAttachment,
  readAttachmentText,
} from "@/lib/mail/attachment-text";
import { mailUsesCrmPeople } from "@/lib/mail/product-flavor";
import {
  focusChatPopout,
  handBackChatPopout,
  isChatPopoutOpen,
} from "@/lib/native-shell";
import {
  getCachedMailThread,
  isMailThreadCacheFresh,
  loadCachedMailThread,
  setCachedMailThread,
} from "@/lib/mail/thread-cache";
import type {
  MailAttachment,
  MailMessage,
  MailScheduledMessage,
  MailThreadDetail,
} from "@/lib/mail/types";
import { mailSay, useMailT } from "@/lib/mail/i18n";
import { cn } from "@/lib/utils";

/**
 * How long to watch for the pop-out to go after asking it to hand back.
 *
 * The ask returns as soon as it has been made — the saving and the closing
 * happen in the other window a moment later. Three seconds is far longer
 * than that takes and short enough that a window which never goes (it was
 * closed by hand in the meantime) stops being waited for.
 */
/**
 * Where the reply actions stop having room for their words.
 *
 * Reply, Reply all and Forward with their icons, the gaps between them and
 * the padding around them come to about this. Below it they wrapped.
 */
const THREAD_ACTIONS_MIN_WIDTH = 480;

/** The always-there controls, once the row has folded: Aa, clip, emoji. */
const COMPOSER_CIRCLE_CLASS =
  "mail-light-surface flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 hover:bg-stone-50";

/**
 * Where the gutter beside a bubble stops being room and starts being waste.
 *
 * A bubble leaves 40px on the side it is not on, so the column reads as one
 * side of a conversation rather than as the whole pane. On a pane this
 * narrow that 40px, and the pane's own padding with it, is a sixth of the
 * width — a stripe of nothing down the right of every message that arrived.
 */
const BUBBLE_GUTTER_MIN_WIDTH = 480;

/** Where the composer stops being a card and becomes the whole pane. */
const COMPOSER_MIN_WIDTH = 700;

/**
 * Where a composer narrower than the pane stops being worth the gutter.
 *
 * The box matches the width of your own bubbles and sits against the right,
 * which reads well with a thread beside it. On a narrow pane that gutter is
 * a third of the room, and the recipient field left in what remains is too
 * narrow to hold two addresses side by side — thirty of them became thirty
 * lines. Below this the box takes the whole width and the addresses get it.
 */
const COMPOSER_FULL_WIDTH = 900;

/** Close enough to the end of a thread to count as being at it. */
const NEAR_LATEST_PX = 120;

/**
 * Where the action strip runs out of room for everything on it.
 *
 * Below this, the four that are about looking at the thread rather than
 * doing anything to it — print, pop out, text size, focus mode — go
 * behind an ellipsis. The ones that act on the mail stay out.
 */
const TOOLBAR_MIN_WIDTH = 640;

/** The secondary reply actions: a labelled button, or a circle with a name
 *  on hover once there is no room for the label. */
/* No light island: Reply and Forward are our own words on our own buttons,
   with no email in them, so they take the theme like the rest of the chrome.
   As a light island they were two white slabs at the foot of a dark pane. */
const threadActionClass =
  "inline-flex shrink-0 items-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-2.5 text-[15px] font-semibold text-stone-800 hover:bg-stone-50";
const circleActionClass = "h-11 w-11 justify-center rounded-full px-0";

const POPOUT_HAND_BACK_POLL_MS = 120;
const POPOUT_HAND_BACK_TRIES = 25;

/** Named in full up to this many; beyond it, the rest are counted. */
const THREAD_PARTICIPANTS_SHOWN = 4;

/**
 * The people on the thread, cut down to a line.
 *
 * A club circular goes to thirty addresses, and naming all of them buried
 * the message count, the dates and the mailbox under eight lines of
 * strangers. Four are named and the rest are counted, with the count as the
 * way to see them: "and 25 others" opens, "show fewer" closes.
 *
 * Not a hover or a tooltip. Who a mail went to is worth reading at leisure,
 * and often worth copying, neither of which a thing that vanishes allows.
 */
function ThreadParticipants({
  people,
  others,
  meta,
}: {
  people: string[];
  /** The same people, addressable — what a saved list would hold. */
  others: { email: string; name?: string }[];
  /** The rest of the header line: count, dates, which mailbox. */
  meta: React.ReactNode;
}) {
  const t = useMailT();
  const [expanded, setExpanded] = React.useState(false);
  const hidden = people.length - THREAD_PARTICIPANTS_SHOWN;
  /*
    "Save as list…" waits for the names to be out.

    Fifty-two people are counted, not named, and the offer to keep them
    made no sense beside a line that had four addresses and a number on
    it: keep whom? Once the reader opens the names they can see what they
    would be keeping, and that is when it is worth asking. A short thread
    hides nobody, so there is nothing to wait for.
  */
  const showSave = others.length > 1 && (hidden <= 0 || expanded);
  /*
    Beside the names, not at the end of the line.

    It belongs to the people — it is what to do with the ones just opened —
    and the rest of the line is a message count and two dates it has
    nothing to do with. Small letter for the same reason: after "show
    fewer" it is one more thing this sentence offers, not a control of its
    own the way it is in the composer.
  */
  const saveList = showSave ? (
    <>
      {" · "}
      <SaveAsListControl
        people={others}
        align="start"
        noteKey="saveListNoteThread"
        labelKey="saveAsListInline"
      />
    </>
  ) : null;
  if (hidden <= 0) {
    return (
      <span>
        {people.join(", ")}
        {saveList} {meta}
      </span>
    );
  }
  const shown = expanded ? people : people.slice(0, THREAD_PARTICIPANTS_SHOWN);
  return (
    <span>
      {shown.join(", ")}{" "}
      <button
        type="button"
        className="font-medium text-teal-700 hover:underline"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded
          ? t("threadShowFewer")
          : hidden === 1
            ? t("threadOtherOne")
            : t("threadOtherMany", { count: hidden })}
      </button>
      {saveList} {meta}
    </span>
  );
}

/**
 * Who is on the thread, with their addresses: "Roe, Jane
 * (jane.roe@example.org)". A name alone is what the list rows show, and
 * enough there; the header is where the reader checks who a person actually
 * is, and that is the address.
 *
 * Senders and recipients both. Senders alone left a thread of sent mail
 * saying nobody but "You", with no sign of who it went to. A recipient is
 * known by address only unless they wrote in the thread as well, in which
 * case their name comes from that.
 *
 * "You" stands in for every own address — the mailboxes connected here, and
 * whoever sent the messages marked as ours — and says which they were:
 * "You (ulrik@a.com, ulrik@b.com)". Own is not one address, and the header
 * is the one place to see which of yours a thread ran through.
 */
function threadPeople(
  messages: MailMessage[],
  ownAddresses: string[]
): { others: { email: string; name?: string }[]; yours: string[] } {
  const own = new Set(ownAddresses.map((a) => a.trim().toLowerCase()));
  for (const m of messages) {
    if (m.own && m.fromEmail) own.add(m.fromEmail.trim().toLowerCase());
  }
  const nameByAddress = new Map<string, string>();
  for (const m of messages) {
    const key = m.fromEmail.trim().toLowerCase();
    const name = m.fromName.split("<")[0].trim();
    if (key && name && name.toLowerCase() !== key && !nameByAddress.has(key)) {
      nameByAddress.set(key, name);
    }
  }
  const others: { email: string; name?: string }[] = [];
  const yours: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const email = raw.trim();
    const key = email.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    if (own.has(key)) {
      yours.push(email);
      return;
    }
    others.push({ email, name: nameByAddress.get(key) });
  };
  for (const m of messages) {
    add(m.fromEmail);
    for (const to of m.toEmails) add(to);
    for (const cc of m.ccEmails) add(cc);
  }
  return { others, yours };
}

function participantsWithAddresses(
  messages: MailMessage[],
  ownAddresses: string[]
): string[] {
  const { others, yours } = threadPeople(messages, ownAddresses);
  return [
    ...others.map((p) => (p.name ? `${p.name} (${p.email})` : p.email)),
    ...(yours.length ? [`You (${yours.join(", ")})`] : []),
  ];
}

/**
 * Every message of a provider thread, oldest first.
 *
 * The thread API answers a window — up to a hundred messages — so this asks
 * for the oldest window and then each one after it until the provider says
 * there is nothing newer. Local pending sends are left out: they are not in
 * the thread yet, and a forward should carry what was sent.
 */
async function loadWholeThread(
  account: string,
  threadId: string
): Promise<MailMessage[]> {
  const out: MailMessage[] = [];
  let after: string | null = null;
  // Twenty pages is two thousand messages. A thread past that is not one
  // anybody forwards whole; the cap is there so a provider that always says
  // "newer" cannot keep this going for ever.
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({
      account,
      id: threadId,
      markRead: "0",
      limit: "100",
    });
    if (after) params.set("after", after);
    else params.set("oldest", "1");
    const json = await apiJson<{ thread: MailThreadDetail }>(
      `/api/mail/thread?${params.toString()}`
    );
    const got = json.thread.messages.filter(
      (m) => !isPendingLocalMessage(m.id)
    );
    out.push(...got);
    const last = json.thread.messages[json.thread.messages.length - 1];
    if (!json.thread.hasNewer || !last) break;
    after = last.id;
  }
  return out;
}

export function ThreadPane({
  account,
  accounts,
  threadId,
  focusMessageId,
  zoom,
  onZoomAdjust,
  focusMode,
  onToggleFocus,
  onArchive,
  onTrash,
  onRestore,
  inTrash = false,
  onJunk,
  onNotJunk,
  inJunk = false,
  forwardMessageId,
  onForwardStarted,
  onMoveToFolder,
  folders,
  onSnooze,
  onCancelSnooze,
  snoozedUntil,
  onToggleUnread,
  unread = false,
  onTogglePin,
  refreshToken,
  messageCount,
  inCrm,
  showAddToCrm,
  counterpartName,
  counterpartEmail,
  onChatPromoted,
  onChatThreadChanged,
  onCrmChanged,
  onSent,
}: {
  account: string;
  accounts: string[];
  threadId: string;
  /** Search hit — open centered on this message instead of the tip. */
  focusMessageId?: string;
  zoom: number;
  onZoomAdjust: (delta: number) => void;
  /** Hide the mail list so the thread fills the pane. */
  focusMode: boolean;
  onToggleFocus: () => void;
  onArchive: () => void;
  onTrash: () => void;
  /** Put a deleted thread back. Only reachable from the Trash view. */
  onRestore?: () => void;
  /** True when this thread was opened from Trash — it is already deleted. */
  inTrash?: boolean;
  /** File it as junk. Filing, not reporting — see markMailThreadJunk. */
  onJunk?: () => void;
  /** Take it back out of Junk. The reason a Junk view is worth having. */
  onNotJunk?: () => void;
  /** True when this thread was opened from Junk. */
  inJunk?: boolean;
  /** A forward asked for from a chat popout — see MailPage. */
  forwardMessageId?: string;
  onForwardStarted?: () => void;
  onMoveToFolder: (folderName: string, create: boolean) => Promise<void>;
  folders: MailFolder[];
  onSnooze: (untilIso: string) => void;
  onCancelSnooze?: () => void;
  snoozedUntil?: string;
  /**
   * Read becomes unread and unread becomes read, the same as the quick action
   * on the list row. This used to only ever mark unread, which made the
   * button on an unread thread do the thing it already was.
   */
  onToggleUnread: () => void;
  /** Whether the open thread is unread, so the button can say which way. */
  unread?: boolean;
  /** Pin the thread to the top of the list, or take it back down. */
  onTogglePin?: () => void;
  /** Newest-message timestamp from the list; a change means new mail arrived. */
  refreshToken?: string;
  /** Message count from the list row — a short thread loads in one Gmail call. */
  messageCount?: number;
  /** Thread involves CRM contacts — remote images load by default. */
  inCrm: boolean;
  showAddToCrm: boolean;
  counterpartName: string;
  counterpartEmail: string;
  onChatPromoted: (chat: MailChatRef) => void;
  /** Rotate / jump-to-part: open a different provider thread in this conversation. */
  /**
   * Move the pane to another provider thread of the same conversation.
   *
   * `focusMessageId` says where to land in it. Without one the part opens at
   * its newest message, which is right for a seam and wrong for a jump to the
   * beginning.
   */
  onChatThreadChanged: (
    threadId: string,
    chat: MailChatRef,
    focusMessageId?: string
  ) => void;
  onCrmChanged: () => void;
  /** Refresh Sent for the mailbox that just sent. */
  onSent?: (accountEmail: string) => void;
}) {
  const t = useMailT();
  const [thread, setThread] = React.useState<MailThreadDetail | null>(null);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [loadingNewer, setLoadingNewer] = React.useState(false);
  const [highlightMessageId, setHighlightMessageId] = React.useState<
    string | null
  >(null);
  const [error, setError] = React.useState<string | null>(null);
  const [chatStyleBusy, setChatStyleBusy] = React.useState(false);
  /** Per-send: ask Grok to update CRM Notes after this reply goes out. */
  const [updateCrmNotes, setUpdateCrmNotes] = React.useState(false);
  /**
   * The AI's proposals for this thread, in a dialog: null when closed. The
   * ✨ button opens it loading; a send with the switch on opens it with what
   * the planner proposed from the thread and the message just sent.
   */
  const [crmProposal, setCrmProposal] = React.useState<
    { loading: boolean; result: CrmProposeResult | null; stage?: string } | null
  >(null);
  /** The last propose asked, so the dialog can run it again with attachments. */
  const lastProposeRef = React.useRef<{ hint?: string; includeAttachments: boolean }>({
    includeAttachments: false,
  });

  /** The thread's PDFs, which the reader may choose to give the AI as context. */
  const readableAttachments = React.useMemo(() => {
    if (!canReadAttachmentText || !thread) return [];
    const out: { messageId: string; filename: string; mimeType: string; attachmentId: string }[] = [];
    for (const m of thread.messages) {
      for (const a of m.attachments ?? []) {
        if (isReadableAttachment(a.mimeType, a.filename)) {
          out.push({ messageId: m.id, filename: a.filename, mimeType: a.mimeType, attachmentId: a.attachmentId });
        }
      }
    }
    return out;
  }, [thread]);
  const [updatingCrm, setUpdatingCrm] = React.useState(false);
  /** Print carries the reader's image choice, so a print matches the screen. */
  const [loadImagesByDefault] = useLoadImagesByDefault();
  const shortcuts = useMailShortcuts();
  // Bumping these opens a menu that owns its own open state.
  const [snoozeMenuSignal, setSnoozeMenuSignal] = React.useState(0);
  /** The provider draft this composer was opened from, if any. */
  const importedDraftRef = React.useRef<string | null>(null);
  /**
   * Null until the local draft has been looked for, then whether one was
   * found. State rather than a ref: the thread can paint from the RAM cache
   * before IndexedDB answers, and the import effect has to run again once it
   * does.
   */
  const [localDraftAt, setLocalDraftAt] = React.useState<number | null>(
    null
  );
  /** null = still looking, false = none, a number = written then. */
  const localDraftFound = localDraftAt === null ? null : localDraftAt >= 0;
  /** The thread whose provider draft has already been offered. */
  const importedForThreadRef = React.useRef<string | null>(null);
  const [moveMenuSignal, setMoveMenuSignal] = React.useState(0);
  const [partMenuOpen, setPartMenuOpen] = React.useState(false);
  const [chatParts, setChatParts] = React.useState<MailChatPartSummary[]>([]);
  /** Older chat parts prepended above the open root thread (asc by partIndex). */
  const [olderParts, setOlderParts] = React.useState<
    {
      partIndex: number;
      threadId: string;
      subject: string;
      openedAt: string | null;
      messages: MailMessage[];
      hasOlder: boolean;
    }[]
  >([]);
  const [reply, setReply] = React.useState("");
  // Remounts the editor (feeding Quill's HTML back as a controlled value
  // makes it re-parse on every keystroke and eat trailing spaces).
  const [editorKey, setEditorKey] = React.useState(0);
  const [sending, setSending] = React.useState(false);
  /** Optimistic sends keyed by local-* message id (pending / failed). */
  const [outbox, setOutbox] = React.useState<Record<string, OutboxEntry>>({});
  /** Brief color-in flash after the provider accepts a send. */
  const [confirmingIds, setConfirmingIds] = React.useState<Set<string>>(
    () => new Set()
  );
  const [includeSignature, setIncludeSignature] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(false);
  // Which mailbox the reply goes out from; defaults to the thread's account.
  const [fromAccount, setFromAccount] = React.useState(account);
  /** Send later is Outlook's to promise — see `use-outlook-accounts`. */
  const canSendLater = useCanSendLater(fromAccount);

  /**
   * Messages the provider is holding for this thread.
   *
   * They live at the end of the thread rather than in Drafts, because that is
   * where the reader left them: a scheduled reply is part of this
   * conversation, and a folder they never open is where it goes to be
   * forgotten about.
   */
  const [scheduled, setScheduled] = React.useState<MailScheduledMessage[]>([]);
  const loadScheduled = React.useCallback(async () => {
    try {
      const json = await apiJson<{ messages?: MailScheduledMessage[] }>(
        `/api/mail/scheduled?account=${encodeURIComponent(
          account
        )}&threadId=${encodeURIComponent(threadId)}`
      );
      setScheduled(json.messages ?? []);
    } catch {
      // Nothing held, or the provider would not say. Either way, show none.
      setScheduled([]);
    }
  }, [account, threadId]);
  React.useEffect(() => {
    void loadScheduled();
  }, [loadScheduled]);

  const actOnScheduled = React.useCallback(
    async (id: string, action: "cancel" | "sendNow") => {
      // Off the screen first: the reader has decided, and a row that lingers
      // while the provider is asked reads as a button that did nothing.
      setScheduled((current) => current.filter((m) => m.id !== id));
      try {
        await apiJson("/api/mail/scheduled", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account, id, action }),
        });
        if (action === "sendNow") {
          toast.success(mailSay("sent"));
          scheduleThreadRefetchAfterSend(account, threadId, setThread);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't change the message"
        );
      }
      // Not straight away. The row is already off the screen, and Graph can
      // still answer with a message it has only just been told to drop —
      // which would put it back, and read as a cancel that did not work.
      window.setTimeout(() => {
        void loadScheduled();
        notifyScheduledChanged();
      }, 1500);
    },
    [account, threadId, loadScheduled]
  );

  const [sigSettings, setSigSettings] = React.useState<SignatureSettings | null>(
    null
  );
  const [sigDialogOpen, setSigDialogOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void fetchSignatureSettings(fromAccount)
      .then((s) => {
        if (!cancelled) setSigSettings(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fromAccount]);
  // Reply (sender only), reply-all, or forward; null while the composer is
  // closed. Recipients are always visible and editable once it opens, so no
  // mode can quietly widen the audience.
  const [mode, setMode] = React.useState<ComposerMode | null>(null);
  /**
   * A pop-out window is open for this thread.
   *
   * One message being written has one place. While the pop-out is that
   * place, the thread shows a strip where the reply box would be, rather
   * than a second box for the same reply.
   */
  const [popoutOpen, setPopoutOpen] = React.useState(false);
  const [toList, setToList] = React.useState<MailRecipient[]>([]);
  const [ccList, setCcList] = React.useState<MailRecipient[]>([]);
  const [showCc, setShowCc] = React.useState(false);
  // Recipients show as a compact "Replying to …" line; clicking it expands
  // the full chip editors.
  const [editRecipients, setEditRecipients] = React.useState(false);
  const replyRef = React.useRef<HTMLDivElement>(null);
  const replyEditorHandle = React.useRef<RichTextEditorHandle | null>(null);
  const recipientInputRef = React.useRef<HTMLInputElement>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  /**
   * The same element as `scrollRef`, but as state.
   *
   * An effect that wants to listen to the stream has to run when the
   * stream is there, and a ref does not say when that is. This pane
   * returns early while a thread loads, so an effect keyed on the thread
   * id alone runs once against nothing and never runs again — which is
   * how the button offering to go back to the newest message came to
   * appear only when the window itself fell short of the end, and never
   * from scrolling.
   */
  const [streamNode, setStreamNode] = React.useState<HTMLDivElement | null>(
    null
  );
  const setScrollNode = React.useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setStreamNode(node);
  }, []);
  /** Whole reading column — pinch hits header, gaps, and iframe chrome. */
  const pinchRef = React.useRef<HTMLDivElement | null>(null);
  /** Hide the thread and grow the reply/forward composer to fill the pane. */
  const [replyFocus, setReplyFocus] = React.useState(false);
  /** Forward the whole conversation, not only one message. */
  const [forwardWhole, setForwardWhole] = React.useState(false);
  const [forwardWholeBusy, setForwardWholeBusy] = React.useState(false);
  /** The full thread, fetched when the box above is ticked. */
  const [forwardConversation, setForwardConversation] = React.useState<
    MailMessage[] | null
  >(null);
  /** What was in the attachment strip before the conversation's files. */
  const preWholeAttachIdsRef = React.useRef<Set<string>>(new Set());
  /** The strip as of this render, for callbacks that outlive one. */
  const attachItemsRef = React.useRef<
    { id: string; filename: string }[]
  >([]);
  const {
    items: attachItems,
    totalBytes: attachTotalBytes,
    ready: attachmentsReady,
    addFiles: addAttachFiles,
    remove: removeAttach,
    clear: clearAttachments,
    replaceAll: replaceAttachments,
    payload: attachmentPayload,
  } = useDraftAttachments();
  attachItemsRef.current = attachItems;
  const { dragging: attachDragging, dropHandlers: attachDropHandlers } =
    useComposerFileDrop(addAttachFiles);
  const { pasteHandlers: attachPasteHandlers } =
    useComposerPaste(addAttachFiles);
  const [attachmentPreview, setAttachmentPreview] = React.useState<{
    messageId: string;
    attachment: MailAttachment;
  } | null>(null);
  const { pct: composerWidthPct, startResize: startComposerResize } =
    useComposerWidthPct();
  const forwarding = mode === "forward";
  usePinchZoom(pinchRef, onZoomAdjust, thread !== null && !replyFocus);

  // Local draft: skip saves until hydrate finishes; discard suppresses flush.
  const draftReadyRef = React.useRef(false);
  const draftDiscardedRef = React.useRef(false);
  const draftSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const composerSnapshotRef = React.useRef({
    mode,
    reply,
    toList,
    ccList,
    showCc,
    editRecipients,
    includeSignature,
    fromAccount,
    replyFocus,
    attachItems,
  });
  composerSnapshotRef.current = {
    mode,
    reply,
    toList,
    ccList,
    showCc,
    editRecipients,
    includeSignature,
    fromAccount,
    replyFocus,
    attachItems,
  };
  const threadDefaultsRef = React.useRef<{
    to: MailRecipient[];
    cc: MailRecipient[];
    allTo: MailRecipient[];
    allCc: MailRecipient[];
  }>({ to: [], cc: [], allTo: [], allCc: [] });
  if (thread) {
    threadDefaultsRef.current = {
      to: recipientsFromEmails(thread.reply.to),
      cc: recipientsFromEmails(thread.reply.cc),
      allTo: recipientsFromEmails(thread.reply.allTo ?? thread.reply.to),
      allCc: recipientsFromEmails(thread.reply.allCc ?? thread.reply.cc),
    };
  }

  const persistThreadDraft = React.useCallback(
    (snapshot = composerSnapshotRef.current) => {
      if (!snapshot.mode || draftDiscardedRef.current) return;
      const defaults = threadDefaultsRef.current;
      const defaultTo =
        snapshot.mode === "forward"
          ? []
          : snapshot.mode === "replyAll"
            ? defaults.allTo
            : defaults.to;
      const defaultCc =
        snapshot.mode === "forward"
          ? []
          : snapshot.mode === "replyAll"
            ? defaults.allCc
            : defaults.cc;
      const draft: ThreadMailDraft = {
        key: threadDraftKey(account, threadId),
        kind: "thread",
        account,
        threadId,
        mode: snapshot.mode,
        body: snapshot.reply,
        toList: snapshot.toList,
        ccList: snapshot.ccList,
        showCc: snapshot.showCc,
        editRecipients: snapshot.editRecipients,
        includeSignature: snapshot.includeSignature,
        fromAccount: snapshot.fromAccount,
        replyFocus: snapshot.replyFocus,
        attachments: readyAttachmentsForDraft(snapshot.attachItems),
        updatedAt: Date.now(),
      };
      void saveThreadDraft(draft, defaultTo, defaultCc);
    },
    [account, threadId]
  );

  // The composer opening shrinks the scroller from its bottom edge, and
  // that is the whole of what happens. There used to be a compensation
  // here that scrolled the thread up by the composer's height so the last
  // message stayed visible above the box — which meant the messages moved
  // every time the box opened, grew a line, or closed. They hold still
  // now: the box covers the tail of the thread, and the tail is a scroll
  // away if it is wanted, since the room to scroll grows by exactly the
  // room the box took.

  // The composer has only just opened and Quill mounts asynchronously, so keep
  // looking for the editor for a few frames before giving up on focusing it.
  /**
   * Put the caret in the reply box, and check that it landed.
   *
   * Not "focus the first editor you find". Adopting a draft remounts the
   * editor — a new key, so Quill is built again from the new body — and the
   * editor found on the first frame is thrown away a frame later, taking
   * the focus with it. That is why a message handed back from a pop-out
   * arrived in the box with the caret nowhere, and had to be clicked.
   *
   * So it keeps asking until the caret is actually in the box. It gives up
   * the moment the reader puts it somewhere themselves — focus that fights
   * the person typing is worse than no focus at all.
   *
   * "Somewhere themselves" means somewhere they went after asking for the
   * box. Where the focus already was when they asked is not a choice to be
   * left alone: a thread row is focusable, so clicking one and then
   * pressing Cmd+R left the focus on the row, and this read that as the
   * reader having chosen the row — the box opened with the caret nowhere
   * and had to be clicked.
   */
  const focusReply = (caret: number | null = null) => {
    const asked = document.activeElement;
    let frames = 0;
    const tryFocus = () => {
      const box = replyRef.current;
      const editor = box?.querySelector<HTMLElement>(".ql-editor");
      const active = document.activeElement;
      if (editor && active === editor) {
        // Landed. Put the caret where the message was left, once — after
        // this the reader owns it, and moving it again would be the app
        // taking the place they had just chosen.
        if (caret != null) {
          replyEditorHandle.current?.setCaret(caret);
          caret = null;
        }
        return;
      }
      // Somewhere else, and not where it was when the box was asked for,
      // and not the body focus a window hands back on its way to being
      // active: the reader has chosen. Leave them alone.
      if (
        active &&
        active !== document.body &&
        active !== asked &&
        !box?.contains(active)
      )
        return;
      editor?.focus();
      // Longer than it takes Quill to mount, which is a lazy chunk and a
      // couple of frames of layout after that.
      if (frames++ < 60) requestAnimationFrame(tryFocus);
    };
    requestAnimationFrame(tryFocus);
  };

  const applyThreadChrome = React.useCallback(
    (detail: MailThreadDetail) => {
      // Don't wipe the composer — local drafts restore into it, and revalidation
      // must not clobber in-progress replies. Defaults are applied when Reply /
      // Forward is clicked (or when a draft is hydrated).
      if (
        focusMessageId &&
        detail.messages.some((m) => m.id === focusMessageId)
      ) {
        setHighlightMessageId(focusMessageId);
      } else {
        setHighlightMessageId(null);
      }
    },
    [focusMessageId]
  );

  // Hydrate local draft for this thread (if any), then enable saves.
  React.useEffect(() => {
    let cancelled = false;
    draftReadyRef.current = false;
    draftDiscardedRef.current = false;
    setLocalDraftAt(null);
    importedDraftRef.current = null;
    importedForThreadRef.current = null;
    void getDraft(threadDraftKey(account, threadId)).then((raw) => {
      if (cancelled) return;
      if (raw?.kind === "thread") {
        setMode(raw.mode);
        setReply(raw.body);
        setToList(raw.toList);
        setCcList(raw.ccList);
        setShowCc(raw.showCc);
        setEditRecipients(raw.editRecipients);
        setIncludeSignature(raw.includeSignature);
        setFromAccount(raw.fromAccount);
        setReplyFocus(raw.replyFocus);
        replaceAttachments(raw.attachments);
        setEditorKey((k) => k + 1);
        setShowPreview(false);
      }
      // -1 stands for "looked, found none" so null can keep meaning
      // "still looking" — the difference the whole import turns on.
      setLocalDraftAt(raw?.kind === "thread" ? (raw.updatedAt ?? 0) : -1);
      draftReadyRef.current = true;
    });
    return () => {
      cancelled = true;
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      // Flush latest keystrokes when switching threads.
      if (draftReadyRef.current && !draftDiscardedRef.current) {
        persistThreadDraft();
      }
    };
  }, [account, threadId, replaceAttachments, persistThreadDraft]);

  /**
   * A reply the reader started in Gmail or Outlook, opened in the composer.
   *
   * Ours wins when both exist: a local draft is what they were editing here,
   * and it was saved on a keystroke. This also runs once per thread, so
   * closing the composer does not reopen it on the next render.
   */
  React.useEffect(() => {
    const providerDraft = thread?.providerDraft;
    const go = shouldImportProviderDraft({
      hasProviderDraft: Boolean(providerDraft),
      localDraftFound,
      localDraftAt: localDraftAt != null && localDraftAt >= 0 ? localDraftAt : null,
      providerDraftAt: providerDraft?.updatedAt
        ? Date.parse(providerDraft.updatedAt)
        : null,
      importedForThread: importedForThreadRef.current,
      threadId,
      composerOpen: Boolean(mode),
    });
    if (!go || !providerDraft) return;
    importedForThreadRef.current = threadId;
    importedDraftRef.current = providerDraft.ref;
    setMode("reply");
    // Only what the reader wrote. The quoted thread under it comes off — this
    // composer adds its own quote when it sends.
    const htmlSplit = providerDraft.bodyHtml
      ? stripQuotedHtml(providerDraft.bodyHtml)
      : null;
    setReply(
      // Only trust the HTML when it actually had a quote block to cut. HTML
      // that is really flat text with ">" markers has no block to find, and
      // taking it whole is what put the entire conversation in the box.
      htmlSplit?.hadQuote
        ? htmlSplit.html
        : draftBodyForComposer(providerDraft)
    );
    setToList(recipientsFromEmails(providerDraft.to));
    setCcList(recipientsFromEmails(providerDraft.cc));
    setShowCc(providerDraft.cc.length > 0);
    setEditorKey((k) => k + 1);
    setShowPreview(false);
  }, [thread, threadId, mode, localDraftFound, localDraftAt]);

  // Debounced persist while the composer is open.
  React.useEffect(() => {
    if (!draftReadyRef.current || draftDiscardedRef.current || !mode) return;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      draftSaveTimerRef.current = null;
      persistThreadDraft();
    }, 400);
    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [
    mode,
    reply,
    toList,
    ccList,
    showCc,
    editRecipients,
    includeSignature,
    fromAccount,
    replyFocus,
    attachItems,
    persistThreadDraft,
  ]);

  // Tracks list tip while this pane is open (also set on cache-fresh opens).
  const seenRefreshToken = React.useRef(refreshToken);

  React.useEffect(() => {
    let cancelled = false;
    setLoadingOlder(false);
    setLoadingNewer(false);
    setError(null);

    const entryCanPaint = (entry: {
      thread: MailThreadDetail;
    }) =>
      !focusMessageId ||
      entry.thread.messages.some((m) => m.id === focusMessageId);

    const paintEntry = (
      entry: NonNullable<ReturnType<typeof getCachedMailThread>>
    ): "fresh" | "stale" | "skip" => {
      if (!entryCanPaint(entry)) return "skip";
      setThread(entry.thread);
      applyThreadChrome(entry.thread);
      if (isMailThreadCacheFresh(entry, refreshToken, focusMessageId)) {
        seenRefreshToken.current = refreshToken;
        return "fresh";
      }
      return "stale";
    };

    const ram = getCachedMailThread(account, threadId);
    if (ram) {
      const status = paintEntry(ram);
      if (status === "fresh") {
        return () => {
          cancelled = true;
        };
      }
      if (status === "skip") {
        setThread(null);
        setHighlightMessageId(null);
      }
      // stale: keep showing cache while we revalidate below
    } else {
      setThread(null);
      setHighlightMessageId(null);
    }

    void (async () => {
      try {
        // Disk hydrate when RAM missed (or could not paint for focus).
        if (!ram || !entryCanPaint(ram)) {
          const disk = await loadCachedMailThread(account, threadId);
          if (cancelled) return;
          if (disk) {
            const status = paintEntry(disk);
            if (status === "fresh") return;
          }
        } else if (
          isMailThreadCacheFresh(ram, refreshToken, focusMessageId)
        ) {
          return;
        }

        const params = new URLSearchParams({ account, id: threadId });
        if (focusMessageId) params.set("around", focusMessageId);
        // Deep links open a window mid-thread, which still needs the id list.
        else if (messageCount) params.set("count", String(messageCount));
        const json = await apiJson<{ thread: MailThreadDetail }>(
          `/api/mail/thread?${params.toString()}`
        );
        if (cancelled) return;
        setThread((current) => {
          if (current) {
            const currentLast = current.messages[current.messages.length - 1];
            const nextLast =
              json.thread.messages[json.thread.messages.length - 1];
            if (currentLast?.id === nextLast?.id) return current;
          }
          return json.thread;
        });
        setCachedMailThread(account, threadId, json.thread, refreshToken);
        applyThreadChrome(json.thread);
        seenRefreshToken.current = refreshToken;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Couldn't load thread");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // refreshToken read on open for freshness; live tip changes use the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, threadId, focusMessageId, applyThreadChrome]);

  // Keep the LRU in sync as the open pane grows (older pages, sends, merges).
  React.useEffect(() => {
    if (!thread) return;
    setCachedMailThread(account, threadId, thread, refreshToken);
  }, [account, threadId, thread, refreshToken]);

  React.useEffect(() => {
    setOlderParts([]);
  }, [threadId]);

  React.useEffect(() => {
    const chatId = thread?.chat?.chatId;
    if (!chatId) {
      setChatParts([]);
      return;
    }
    let cancelled = false;
    void apiJson<{ parts: MailChatPartSummary[] }>(
      `/api/mail/chat/parts?${new URLSearchParams({
        account,
        chatId,
      }).toString()}`
    )
      .then((json) => {
        if (!cancelled) setChatParts(json.parts);
      })
      .catch(() => {
        if (!cancelled) setChatParts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [account, thread?.chat?.chatId]);

  const loadOlderMessages = React.useCallback(async () => {
    if (loadingOlder || !thread) return;
    const head = olderParts[0];
    const headPartIndex = head?.partIndex ?? thread.chat?.partIndex ?? 1;
    const headThreadId = head?.threadId ?? threadId;
    const headMessages = head?.messages ?? thread.messages;
    const headHasOlder = head ? head.hasOlder : thread.hasOlder;
    const canCrossPart =
      Boolean(thread.chat) && !headHasOlder && headPartIndex > 1;
    if (!headHasOlder && !canCrossPart) return;
    if (headHasOlder && !headMessages.length) return;

    const scroller = scrollRef.current;
    const prevHeight = scroller?.scrollHeight ?? 0;
    const prevTop = scroller?.scrollTop ?? 0;
    setLoadingOlder(true);
    try {
      if (headHasOlder) {
        const oldestId = headMessages[0].id;
        const params = new URLSearchParams({
          account,
          id: headThreadId,
          before: oldestId,
        });
        const json = await apiJson<{ thread: MailThreadDetail }>(
          `/api/mail/thread?${params.toString()}`
        );
        if (head) {
          setOlderParts((parts) => {
            if (!parts.length) return parts;
            const [first, ...rest] = parts;
            const seen = new Set(first.messages.map((m) => m.id));
            const older = json.thread.messages.filter((m) => !seen.has(m.id));
            if (!older.length) {
              return [{ ...first, hasOlder: false }, ...rest];
            }
            return [
              {
                ...first,
                messages: [...older, ...first.messages],
                hasOlder: json.thread.hasOlder,
              },
              ...rest,
            ];
          });
        } else {
          setThread((current) => {
            if (!current) return current;
            const seen = new Set(current.messages.map((m) => m.id));
            const older = json.thread.messages.filter((m) => !seen.has(m.id));
            if (!older.length) {
              return { ...current, hasOlder: false };
            }
            return {
              ...current,
              messages: [...older, ...current.messages],
              hasOlder: json.thread.hasOlder,
            };
          });
        }
      } else if (canCrossPart && thread.chat) {
        let partsList = chatParts;
        if (!partsList.length) {
          const listed = await apiJson<{ parts: MailChatPartSummary[] }>(
            `/api/mail/chat/parts?${new URLSearchParams({
              account,
              chatId: thread.chat.chatId,
            }).toString()}`
          );
          partsList = listed.parts;
          setChatParts(partsList);
        }
        const prev = partsList.find((p) => p.partIndex === headPartIndex - 1);
        if (!prev) return;
        const params = new URLSearchParams({
          account,
          id: prev.providerThreadId,
        });
        const json = await apiJson<{ thread: MailThreadDetail }>(
          `/api/mail/thread?${params.toString()}`
        );
        setOlderParts((parts) => [
          {
            partIndex: prev.partIndex,
            threadId: prev.providerThreadId,
            subject: prev.subject,
            openedAt: prev.openedAt,
            messages: json.thread.messages,
            hasOlder: json.thread.hasOlder,
          },
          ...parts,
        ]);
      }
      // Keep the same messages under the viewport after prepending.
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = prevTop + (el.scrollHeight - prevHeight);
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't load earlier messages"
      );
    } finally {
      setLoadingOlder(false);
    }
  }, [
    account,
    loadingOlder,
    thread,
    threadId,
    olderParts,
    chatParts,
  ]);

  const loadNewerMessages = React.useCallback(async () => {
    if (!thread?.hasNewer || loadingNewer || !thread.messages.length) return;
    const newestId = thread.messages[thread.messages.length - 1].id;
    setLoadingNewer(true);
    try {
      const params = new URLSearchParams({
        account,
        id: threadId,
        after: newestId,
      });
      const json = await apiJson<{ thread: MailThreadDetail }>(
        `/api/mail/thread?${params.toString()}`
      );
      setThread((current) => {
        if (!current) return current;
        const seen = new Set(current.messages.map((m) => m.id));
        const newer = json.thread.messages.filter((m) => !seen.has(m.id));
        if (!newer.length) {
          return { ...current, hasNewer: false };
        }
        return {
          ...current,
          messages: [...current.messages, ...newer],
          hasNewer: json.thread.hasNewer,
        };
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't load newer messages"
      );
    } finally {
      setLoadingNewer(false);
    }
  }, [account, loadingNewer, thread, threadId]);

  // Avoid fetching older/newer pages while the open-thread pin is still settling.
  const canAutoloadPagesRef = React.useRef(false);
  React.useEffect(() => {
    canAutoloadPagesRef.current = false;
    const t = window.setTimeout(() => {
      canAutoloadPagesRef.current = true;
    }, 700);
    return () => window.clearTimeout(t);
  }, [threadId]);

  const headOlder = olderParts[0];
  const headHasOlderInPart = headOlder
    ? headOlder.hasOlder
    : Boolean(thread?.hasOlder);
  const headPartIndexForScroll =
    headOlder?.partIndex ?? thread?.chat?.partIndex ?? 1;
  const canLoadOlderAcrossParts =
    Boolean(thread?.chat) &&
    !headHasOlderInPart &&
    headPartIndexForScroll > 1;
  React.useEffect(() => {
    const el = scrollRef.current;
    if (
      !el ||
      (!headHasOlderInPart &&
        !canLoadOlderAcrossParts &&
        !thread?.hasNewer)
    ) {
      return;
    }
    const onScroll = () => {
      if (!canAutoloadPagesRef.current) return;
      if (
        (headHasOlderInPart || canLoadOlderAcrossParts) &&
        el.scrollTop < 80
      ) {
        void loadOlderMessages();
      }
      if (
        thread?.hasNewer &&
        el.scrollHeight - el.scrollTop - el.clientHeight < 120
      ) {
        void loadNewerMessages();
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [
    loadOlderMessages,
    loadNewerMessages,
    headHasOlderInPart,
    canLoadOlderAcrossParts,
    thread?.hasNewer,
  ]);

  /**
   * Scrolled up, with the newest message somewhere below.
   *
   * A long thread is read from the bottom, and reading back through it
   * leaves no way down but the same scrolling again. This is the button
   * every chat window has in that corner.
   *
   * "Near enough" rather than exactly at the end: a thread pinned to its
   * last message still sits a pixel or two off it after a resize, and a
   * button that appears for that is a button that flickers.
   */
  /**
   * Where the reader is in the thread, for zoom to hold on to.
   *
   * Zooming scales the whole stream, so a scroll position measured in
   * pixels means somewhere else afterwards — the further down a long
   * thread, the further it threw them.
   *
   * Two ways of remembering the place, and which one is used is decided
   * by measurement rather than by belief. See `rectsMoveWithScroll`.
   */
  type ZoomAnchor =
    /** A message, and how far down it the top of the pane cuts. */
    | { kind: "message"; id: string; into: number }
    /** How far down the content the top edge sits, and how tall it was. */
    | { kind: "fraction"; top: number; content: number };
  const zoomAnchorRef = React.useRef<ZoomAnchor | null>(null);

  /** The scroller's own padding, which does not scale with the stream. */
  const scrollerPadding = (el: HTMLElement) => {
    const style = window.getComputedStyle(el);
    return {
      top: Number.parseFloat(style.paddingTop) || 0,
      bottom: Number.parseFloat(style.paddingBottom) || 0,
    };
  };

  /**
   * Can a message's rectangle be compared with the scroller's numbers?
   *
   * The messages sit inside the zoomed element and the scroller sits
   * outside it, and whether a rectangle measured in there comes back in
   * the same pixels as `scrollTop` is up to the engine. Twice now this
   * has been assumed and twice it has been wrong, so it is measured:
   * while the reader scrolls, a message's rectangle has to move by
   * exactly what `scrollTop` moved by. Anything else and the two are in
   * different units and must not be mixed.
   *
   * Null until a scroll has been long enough to tell. Until then, and
   * whenever the answer is no, the fraction below is used instead: it
   * reads nothing but the scroller, so it cannot be caught out this way.
   */
  const rectsMoveWithScroll = React.useRef<boolean | null>(null);
  const rectProbeRef = React.useRef<{
    id: string;
    top: number;
    scrollTop: number;
  } | null>(null);
  const probeRectSpace = (el: HTMLElement) => {
    const node = el.querySelector<HTMLElement>("[data-message-id]");
    const id = node?.dataset.messageId;
    if (!node || !id) return;
    const top = node.getBoundingClientRect().top;
    const previous = rectProbeRef.current;
    // The reading to compare against is kept until it has been used, not
    // replaced on every scroll event. A trackpad delivers a dozen events
    // for one flick of a finger, so replacing it each time left every
    // comparison a few pixels wide — never enough to answer anything,
    // and the exact anchoring below therefore never once ran.
    if (!previous || previous.id !== id) {
      rectProbeRef.current = { id, top, scrollTop: el.scrollTop };
      return;
    }
    const scrolled = el.scrollTop - previous.scrollTop;
    // Far enough that rounding cannot account for the answer.
    if (Math.abs(scrolled) < 40) return;
    const moved = -(top - previous.top) / scrolled;
    rectsMoveWithScroll.current = Math.abs(moved - 1) < 0.05;
    rectProbeRef.current = { id, top, scrollTop: el.scrollTop };
  };

  const captureZoomAnchor = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (rectsMoveWithScroll.current) {
      // The message at the top of the pane, and where its own top sits
      // against that edge. The top is what the eye is on and what the
      // reader named, and it is the least forgiving place to be wrong,
      // which makes it the right one to be exact about.
      const line = el.getBoundingClientRect().top;
      const nodes = el.querySelectorAll<HTMLElement>("[data-message-id]");
      for (const node of Array.from(nodes)) {
        const box = node.getBoundingClientRect();
        // The first message still on screen: the one the edge cuts, or
        // the next one down when the edge falls in the gap above it.
        if (box.bottom < line) continue;
        const id = node.dataset.messageId;
        if (!id) break;
        zoomAnchorRef.current = {
          kind: "message",
          id,
          into: box.height ? (line - box.top) / box.height : 0,
        };
        return;
      }
    }
    // Every number off the scroller, which is outside the zoom. Close
    // rather than exact — text rewraps, so the same fraction of the
    // stream is a slightly different place — but it cannot be wrong
    // about which units it is in.
    const pad = scrollerPadding(el);
    const content = el.scrollHeight - pad.top - pad.bottom;
    if (content <= 0) return;
    zoomAnchorRef.current = {
      kind: "fraction",
      top: el.scrollTop - pad.top,
      content,
    };
  }, []);

  /**
   * Put that place back under the middle at the new size.
   *
   * A layout effect, so the correction lands in the same frame the new
   * size does and there is nothing to see.
   */
  const lastZoomRef = React.useRef(zoom);
  React.useLayoutEffect(() => {
    const previous = lastZoomRef.current;
    lastZoomRef.current = zoom;
    if (previous === zoom) return;
    const el = scrollRef.current;
    const anchor = zoomAnchorRef.current;
    if (!el || !anchor) return;
    // The probe compares one reading with the one before it and reads
    // the difference as scrolling. A size change between the two moves
    // the rectangle for a second reason, so the reading before this one
    // is no longer something to compare against.
    rectProbeRef.current = null;

    if (anchor.kind === "message") {
      const selector = `[data-message-id="${anchor.id
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')}"]`;
      const node = el.querySelector<HTMLElement>(selector);
      if (node) {
        const box = node.getBoundingClientRect();
        const line = el.getBoundingClientRect().top;
        el.scrollTop += box.top + box.height * anchor.into - line;
        captureZoomAnchor();
        return;
      }
      // The message went while the size changed. Nothing to hold on to.
      return;
    }

    if (anchor.content <= 0) return;
    const pad = scrollerPadding(el);
    const content = el.scrollHeight - pad.top - pad.bottom;
    if (content <= 0) return;
    // The scale is measured rather than worked out from the zoom values:
    // text rewraps, so the stream does not grow by exactly the ratio
    // between them, and what it actually grew by is there to be read.
    el.scrollTop = (anchor.top * content) / anchor.content + pad.top;
    // Where it is now, for the next step of a pinch to hold on to.
    captureZoomAnchor();
  }, [zoom, captureZoomAnchor]);

  const [awayFromLatest, setAwayFromLatest] = React.useState(false);
  React.useEffect(() => {
    const el = streamNode;
    if (!el) return;
    const check = () => {
      setAwayFromLatest(
        el.scrollHeight - el.scrollTop - el.clientHeight > NEAR_LATEST_PX
      );
      // Scrolling is the only chance to find out what a rectangle
      // measured inside the zoom is worth, so it is taken every time.
      probeRectSpace(el);
      // The same moments tell zoom what to hold on to: wherever the
      // reader has come to rest is what zooming should keep in front of
      // them. Reading it now costs nothing and saves reading it later,
      // when the new size has already been applied and the old view is
      // gone.
      captureZoomAnchor();
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    // Messages arriving make the stream taller under a reader who has not
    // moved, which is the other way this becomes true.
    const observer = new ResizeObserver(check);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => {
      el.removeEventListener("scroll", check);
      observer.disconnect();
    };
    // streamNode: the element itself, so this runs the moment there is
    // one to listen to rather than once before there is.
  }, [streamNode, captureZoomAnchor]);

  /**
   * The newest window as it was, so coming back to it costs nothing.
   *
   * A thread is opened at its newest page, so by the time anybody can ask
   * to go back there, that page has been fetched already. Going to the
   * start replaces the window with the oldest page, and this is what was
   * put down. Kept per thread; the next thread opens its own.
   */
  const latestWindowRef = React.useRef<MailThreadDetail | null>(null);
  React.useEffect(() => {
    latestWindowRef.current = null;
  }, [threadId]);
  React.useEffect(() => {
    // A window with nothing newer beyond it is the newest window.
    if (thread && !thread.hasNewer) latestWindowRef.current = thread;
  }, [thread]);

  /**
   * Back to the newest message in the thread, not the newest one loaded.
   *
   * Scrolling to the bottom of the window is only the end of the thread
   * when the window reaches it. Read back to the start of a long thread
   * and the bottom of what is on screen is the middle of the conversation
   * — which is where this used to stop.
   *
   * A jump, not a walk, and the mirror of `goToFirstMessage`: the window
   * is replaced with the newest page outright. Paging forward through
   * everything in between would fetch the whole thread to reach a message
   * that has already been fetched once.
   */
  const goToLatestMessage = React.useCallback(async () => {
    const toEnd = (smooth: boolean) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({
        top: el.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    };
    // The window already reaches the end. Only the scroll is between the
    // reader and the newest message.
    if (!thread?.hasNewer) {
      toEnd(true);
      return;
    }

    // The pin that opens a thread at its bottom wakes when the newest
    // message changes, which replacing the window does. Claimed before
    // the change, as the jump to the start claims it.
    skipOpenPinRef.current = true;
    const cached = latestWindowRef.current;
    if (cached) {
      setOlderParts([]);
      setThread(cached);
    } else {
      // Nothing put down to go back to — the pane was opened on a search
      // hit in the middle of the thread and has never been at the end.
      // One request for the newest page, the same one opening it makes.
      setLoadingNewer(true);
      try {
        const params = new URLSearchParams({ account, id: threadId });
        if (messageCount) params.set("count", String(messageCount));
        const json = await apiJson<{ thread: MailThreadDetail }>(
          `/api/mail/thread?${params.toString()}`
        );
        setOlderParts([]);
        setThread(json.thread);
      } catch (err) {
        skipOpenPinRef.current = false;
        toast.error(
          err instanceof Error ? err.message : "Couldn't open the latest"
        );
        return;
      } finally {
        setLoadingNewer(false);
      }
    }

    // The new page has to be laid out before there is a bottom to go to.
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      const el = scrollRef.current;
      if (!el) continue;
      const wasAtEnd =
        el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_LATEST_PX;
      toEnd(false);
      // Settled: the last two goes landed in the same place, so the page
      // has stopped growing under it.
      if (wasAtEnd) return;
    }
  }, [account, messageCount, thread, threadId]);

  // A list refresh showing this thread gained mail refetches the newest page
  // and merges it — older prepended history is kept. Skip while mid-thread
  // (search deep-link) so we don't create a gap to the tip.
  React.useEffect(() => {
    if (!refreshToken || seenRefreshToken.current === refreshToken) return;
    seenRefreshToken.current = refreshToken;
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams({ account, id: threadId });
        if (messageCount) params.set("count", String(messageCount));
        const json = await apiJson<{ thread: MailThreadDetail }>(
          `/api/mail/thread?${params.toString()}`
        );
        if (cancelled) return;
        setThread((current) => {
          if (!current) return json.thread;
          if (current.hasNewer) return current;
          const currentLast = current.messages[current.messages.length - 1];
          const nextLast = json.thread.messages[json.thread.messages.length - 1];
          if (currentLast?.id === nextLast?.id) return current;
          return mergeNewestThreadPage(current, json.thread);
        });
      } catch {
        // Background refresh is best-effort; the pane keeps what it has.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshToken, account, threadId, messageCount]);

  const newestMessageId =
    thread?.messages[thread.messages.length - 1]?.id ?? null;
  /**
   * Set when the reader asked to go somewhere specific in this thread.
   *
   * Replacing the window changes the newest message, which is what wakes
   * the open-at-the-bottom pin below. Without this it would drag the view
   * back down — twice, because its observer re-pins as the new page lays
   * out. Cleared when the thread changes, which is the next time opening
   * at the bottom is the right thing to do.
   */
  const skipOpenPinRef = React.useRef(false);
  const scrolledToFocusRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    scrolledToFocusRef.current = null;
  }, [threadId, focusMessageId]);

  /**
   * A search hit that is not the newest message: land on it.
   *
   * Only then. The newest message is where a thread opens anyway (below),
   * and a hit the loaded window does not hold has nowhere to land, so both
   * fall through to that rule rather than leaving the pane where it started
   * — which was the top, and read as the thread opening on its oldest
   * message.
   */
  const deepLinkTarget =
    focusMessageId &&
    focusMessageId !== newestMessageId &&
    thread?.messages.some((m) => m.id === focusMessageId)
      ? focusMessageId
      : null;

  React.useEffect(() => {
    // Search deep-link: pin the hit in view (once), then stop.
    const el = scrollRef.current;
    if (!thread || !el || !deepLinkTarget) return;
    if (scrolledToFocusRef.current === deepLinkTarget) return;

    const pin = () => {
      const target = el.querySelector<HTMLElement>(
        `[data-message-id="${deepLinkTarget.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`
      );
      if (!target) return false;
      const paneTop = el.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;
      el.scrollTop = Math.max(
        0,
        el.scrollTop + (targetTop - paneTop) - el.clientHeight * 0.25
      );
      scrolledToFocusRef.current = deepLinkTarget;
      return true;
    };
    if (pin()) return;

    const observer = new ResizeObserver(() => {
      if (pin()) observer.disconnect();
    });
    observer.observe(el.firstElementChild ?? el);
    const timer = setTimeout(() => observer.disconnect(), 2000);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [thread, deepLinkTarget]);

  React.useEffect(() => {
    if (!highlightMessageId) return;
    const t = window.setTimeout(() => setHighlightMessageId(null), 2200);
    return () => window.clearTimeout(t);
  }, [highlightMessageId]);

  /**
   * Where a thread opens.
   *
   * One message: the very top. There is nothing above it to hint at.
   *
   * More than one: twenty pixels above the head of the newest message. Not
   * the bottom — the bottom of a long message is its tail, and a reader put
   * there has to scroll up to find out what the message says and then come
   * back down. The top of the newest message is where reading it starts,
   * and the twenty pixels show the tail of the one before, which is the
   * sign, without scrolling, that the conversation goes on above the fold.
   * A short newest message near the end works out the same — the scroll
   * clamps and the pane sits at the bottom.
   *
   * Skipped only when a search hit older than the newest message is being
   * landed on, which has its own place to be. A hit that is the newest
   * message, or one the loaded window does not hold, opens by this rule.
   */
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!thread || !el || !newestMessageId || deepLinkTarget) return;
    if (skipOpenPinRef.current) return;

    const pin = () => {
      const bubbles = el.querySelectorAll<HTMLElement>(
        '[data-mail-bubble="1"]'
      );
      const newest = bubbles[bubbles.length - 1];
      if (!newest) {
        el.scrollTop = el.scrollHeight;
        return;
      }
      if (bubbles.length === 1) {
        el.scrollTop = 0;
        return;
      }
      const paneTop = el.getBoundingClientRect().top;
      const bubbleTop = newest.getBoundingClientRect().top;
      const air = 20;
      el.scrollTop = Math.max(0, el.scrollTop + (bubbleTop - paneTop) - air);
    };
    pin();

    const observer = new ResizeObserver(pin);
    observer.observe(el.firstElementChild ?? el);
    const stop = () => observer.disconnect();
    el.addEventListener("wheel", stop, { passive: true, once: true });
    el.addEventListener("touchstart", stop, { passive: true, once: true });
    const timer = setTimeout(stop, 2000);

    return () => {
      clearTimeout(timer);
      stop();
      el.removeEventListener("wheel", stop);
      el.removeEventListener("touchstart", stop);
    };
  }, [threadId, newestMessageId, deepLinkTarget]);

  /**
   * How much room the reply actions have, measured rather than guessed.
   *
   * The pane is resizable and sits beside two other resizable things, so
   * nothing about the window says how wide this row is.
   */
  const [paneWidth, setPaneWidth] = React.useState(0);
  /**
   * Measured through the ref itself, not from an effect.
   *
   * This pane returns early while a thread is loading, so on the render an
   * effect would have run against there was no element to observe — and an
   * effect that runs once, finds nothing and never looks again leaves the
   * width at nought for the life of the pane. Everything that asks how wide
   * it is then gets the same answer: wide enough. Which is why none of this
   * appeared to work at any size.
   *
   * A callback ref is told each time the node arrives or goes, which is
   * exactly when there is something to measure or stop measuring.
   */
  const paneObserverRef = React.useRef<ResizeObserver | null>(null);
  const setPaneNode = React.useCallback((node: HTMLDivElement | null) => {
    pinchRef.current = node;
    paneObserverRef.current?.disconnect();
    paneObserverRef.current = null;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setPaneWidth(entry.contentRect.width);
    });
    observer.observe(node);
    paneObserverRef.current = observer;
    // The first answer now, rather than a frame later.
    setPaneWidth(node.getBoundingClientRect().width);
  }, []);
  const compactThreadActions =
    paneWidth > 0 && paneWidth < THREAD_ACTIONS_MIN_WIDTH;
  const compactToolbar = paneWidth > 0 && paneWidth < TOOLBAR_MIN_WIDTH;
  const narrowBubbles =
    paneWidth > 0 && paneWidth < BUBBLE_GUTTER_MIN_WIDTH;
  /**
   * The reply box takes the whole pane, edge to edge.
   *
   * At its ordinary width the composer is a card: inset from the pane and
   * narrower than it, so a reply looks like the message it will become.
   * Below this width there is no room to be a card in — the inset and the
   * percentage together were leaving a box a few words wide, with its
   * toolbar wrapped into four rows underneath.
   */
  const compactComposer = paneWidth > 0 && paneWidth < COMPOSER_MIN_WIDTH;
  /** Narrow enough that the composer should take the pane, gutter and all. */
  const fullWidthComposer =
    paneWidth > 0 && paneWidth < COMPOSER_FULL_WIDTH;
  /*
   * B, I, U, the lists and the link have no bar of their own at this width.
   * The editor is built in Quill's bubble theme instead: select some words
   * and the controls appear over them, which is the moment you want them.
   *
   * Send, a file and an emoji are wanted constantly and keep their places.
   * All of them together wrapped the row into four lines here, and the
   * formatting is what nobody was reaching for.
   */

  const replyText = htmlToPlainText(reply);

  const closeComposer = React.useCallback(() => {
    draftDiscardedRef.current = true;
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    void deleteDraft(threadDraftKey(account, threadId));
    setMode(null);
    setReplyFocus(false);
    setToList(recipientsFromEmails(thread?.reply.to ?? []));
    setCcList(recipientsFromEmails(thread?.reply.cc ?? []));
    setReply("");
    setEditorKey((k) => k + 1);
    setShowPreview(false);
    setEditRecipients(false);
    setShowCc(false);
    setUpdateCrmNotes(false);
    // Along with everything else the closed composer leaves behind. A
    // question about a reply that has gone would otherwise be waiting,
    // still true, over the next reply written here.
    setConfirmDiscard(false);
    setForwardWhole(false);
    setForwardConversation(null);
    preWholeAttachIdsRef.current = new Set();
    clearAttachments();
  }, [thread, clearAttachments, account, threadId]);

  /**
   * Throw the reply away, here and at the provider.
   *
   * The provider's copy is not deleted yet. A Gmail draft cannot be
   * un-deleted, so Undo has to mean the request was never sent — it is held
   * for the length of the toast, outside this component, because this
   * component is gone the moment the composer closes.
   *
   * Everything needed to put the composer back is taken before it is cleared.
   * Undo restores it and takes the request back; letting the toast run out
   * sends it.
   */
  const discardComposer = React.useCallback(() => {
    const snapshot = composerSnapshotRef.current;
    /**
     * The draft at the provider, if this thread has one.
     *
     * Not only the one this mount imported. A draft imported from Gmail
     * saves a copy here, and once that copy exists the composer opens from
     * it instead — so a discard after any remount deleted our copy and left
     * the provider's, which the next poll imported again, which saved a new
     * copy, which put the Draft badge back on a thread the reader had just
     * cleared. Discarding a reply means the reply is gone, on both sides.
     */
    const providerRef =
      importedDraftRef.current ?? thread?.providerDraft?.ref ?? null;
    const restoreAttachments = readyAttachmentsForDraft(snapshot.attachItems);
    const hadSomething =
      Boolean(htmlToPlainText(snapshot.reply).trim()) ||
      restoreAttachments.length > 0;
    const key = threadDraftKey(account, threadId);

    closeComposer();
    /**
     * And this thread's provider draft has now been dealt with.
     *
     * The loaded thread still carries it until the next fetch, and the
     * import runs off what is loaded — so without this the discard was
     * followed straight away by the same draft opening again, from a copy
     * that no longer exists anywhere.
     */
    importedForThreadRef.current = threadId;

    if (providerRef) {
      schedulePendingDiscard(key, () => {
        void apiJson("/api/mail/drafts/discard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account, ref: providerRef, threadId }),
        }).catch((err) => {
          console.warn("[mail] could not discard the provider's draft:", err);
        });
      });
    }

    // An empty composer being closed is not a discard worth offering back.
    if (!hadSomething && !providerRef) return;

    toast(mailSay("draftDiscarded"), {
      duration: DISCARD_UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          cancelPendingDiscard(key);
          draftDiscardedRef.current = false;
          importedDraftRef.current = providerRef;
          setMode(snapshot.mode);
          setReply(snapshot.reply);
          setToList(snapshot.toList);
          setCcList(snapshot.ccList);
          setShowCc(snapshot.showCc);
          setEditRecipients(snapshot.editRecipients);
          setIncludeSignature(snapshot.includeSignature);
          setFromAccount(snapshot.fromAccount);
          setReplyFocus(snapshot.replyFocus);
          replaceAttachments(restoreAttachments);
          setEditorKey((k) => k + 1);
          setShowPreview(false);
        },
      },
    });
  }, [
    account,
    threadId,
    closeComposer,
    replaceAttachments,
    thread?.providerDraft?.ref,
  ]);

  /**
   * Ask before throwing away something that was written — on Escape only.
   *
   * The bin does it on the spot. Nothing else on the card throws the reply
   * away, so reaching for it is already the whole of the decision, and a
   * question after it only asks whether you meant the thing you just took
   * aim at.
   *
   * Escape is the other case. It is pressed to get out of a menu, a field,
   * a mode — and if none of those is open it lands here, on the message
   * instead. That one is worth asking about.
   */
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const composerHasWords =
    Boolean(replyText.trim()) || attachItems.length > 0;

  const requestDiscard = React.useCallback(() => {
    if (!composerHasWords) {
      discardComposer();
      return;
    }
    setConfirmDiscard(true);
  }, [composerHasWords, discardComposer]);

  /**
   * Escape closes the composer.
   *
   * It asks first when there is something written — see above for why this
   * one asks and the bin does not. A second Escape then answers the
   * asking, which is what Escape means the rest of the time.
   *
   * While the asking stands, Enter answers it the other way. The button is
   * focused and would take Enter by itself; this is for the rest of the
   * dialog, where a click on the words leaves focus on nothing a key can
   * reach. `preventDefault` is what keeps the two from both firing.
   */
  React.useEffect(() => {
    if (!mode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Enter") {
        if (!confirmDiscard) return;
        event.preventDefault();
        setConfirmDiscard(false);
        discardComposer();
        return;
      }
      if (event.key !== "Escape") return;
      if (confirmDiscard) {
        event.preventDefault();
        setConfirmDiscard(false);
        return;
      }
      event.preventDefault();
      requestDiscard();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, confirmDiscard, requestDiscard, discardComposer]);

  /**
   * Is there a pop-out for this thread? Ask the shell, every time.
   *
   * Asked rather than remembered: the pop-out can be closed from its own
   * title bar or by Escape in it, and neither says anything to this window.
   * The shell answers from the live window list, so it cannot go stale.
   * Outside the desktop app the answer is always no, and the composer
   * behaves as it always did.
   */
  const popoutKeyRef = React.useRef("");
  popoutKeyRef.current = `${account}|${threadId}`;

  const refreshPopoutOpen = React.useCallback(async () => {
    const key = `${account}|${threadId}`;
    const open = await isChatPopoutOpen({ account, threadId });
    // The reader may have moved to another thread while this was in flight.
    if (popoutKeyRef.current === key) setPopoutOpen(open);
    return open;
  }, [account, threadId]);

  /**
   * Ask on arrival, and again whenever this window comes to the front.
   *
   * Focus is the signal: closing the pop-out hands focus back here, which
   * is also how a draft written in it finds its way home.
   */
  React.useEffect(() => {
    // Another thread's answer is not this one's.
    setPopoutOpen(false);
    void refreshPopoutOpen();
    const onFocus = () => void refreshPopoutOpen();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshPopoutOpen]);

  /**
   * The pop-out is where this thread is answered while it is open.
   *
   * So everything that would otherwise open the reply box brings that
   * window forward instead. A second box behind the strip is a box nobody
   * can see, and the key or the button that opened it would look broken.
   *
   * @returns true when the pop-out took the job.
   */
  const answerInPopout = React.useCallback(() => {
    if (!popoutOpen) return false;
    void focusChatPopout({ account, threadId });
    return true;
  }, [popoutOpen, account, threadId]);

  // Clicking the already-active toolbar icon closes the composer again.
  const startReply = (all: boolean) => {
    if (answerInPopout()) return;
    const next = all ? "replyAll" : "reply";
    if (mode === next) {
      closeComposer();
      return;
    }
    draftDiscardedRef.current = false;
    setMode(next);
    setToList(
      recipientsFromEmails(
        all ? (thread?.reply.allTo ?? []) : (thread?.reply.to ?? [])
      )
    );
    setCcList(
      recipientsFromEmails(
        all ? (thread?.reply.allCc ?? []) : (thread?.reply.cc ?? [])
      )
    );
    setEditRecipients(false);
    setIncludeSignature(sigSettings?.includeOnReplies ?? false);
    setUpdateCrmNotes(false);
    focusReply();
  };

  /**
   * Print every message the thread has loaded, oldest first.
   *
   * Older pages that were never fetched are not in it. What prints is what the
   * reader can scroll to. The image choice is resolved the same way a bubble
   * resolves it, so a print matches what is on the screen.
   */
  /**
   * The thread in a window of its own.
   *
   * Shared by the toolbar button and the shortcut, so the two cannot come to
   * mean different things.
   */
  const popOutThread = React.useCallback(() => {
    if (!thread) return;
    const counterpart = thread.messages.find((m) => !m.own && m.fromEmail);
    const email = counterpart?.fromEmail ?? thread.reply.to[0] ?? "";
    // What is being written travels with the conversation, formatting and
    // all: both boxes hold rich text now, so bold stays bold across the
    // move. It used to go as words only, because the pop-out's box was a
    // plain one.
    //
    // A reply travels. A forward does not: it goes to somebody the pop-out
    // has no picker to name, so it stays in the box that can send it.
    const answering = mode === "reply" || mode === "replyAll";
    // Whether anything has been written is still a question about words:
    // an empty editor is not an empty string, it is an empty paragraph.
    const carried =
      answering && htmlToPlainText(reply).trim() ? reply : "";
    // Where in it the writing had got to. Read before the composer closes,
    // because a box that has gone has no caret to ask about.
    const carriedCaret = carried ? replyEditorHandle.current?.getCaret() : null;
    void openMailChatPopout({
      account,
      threadId,
      name: counterpart?.fromName || email,
      email,
      subject: thread.subject,
      seedThread: thread,
      seedDraft: carried || undefined,
      seedCaret: carriedCaret,
    })
      .then(() => {
        // Handed over, not copied. The same words waiting in two boxes is an
        // invitation to send them twice, and Bring back returns them here.
        //
        // An empty box goes with them: the strip stands where it was, and a
        // box behind a strip that says the answer is elsewhere is the very
        // confusion the strip is there to end. A box holding files stays —
        // they were picked here, and the pop-out cannot take them. So does a
        // forward, which was never going to the pop-out in the first place.
        if (answering && (carried || !composerHasWords)) closeComposer();
        void refreshPopoutOpen();
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Couldn't pop out")
      );
  }, [
    thread,
    account,
    threadId,
    reply,
    mode,
    composerHasWords,
    closeComposer,
    refreshPopoutOpen,
  ]);

  const printThread = React.useCallback(() => {
    if (!thread) return;
    const choices = readImageChoices();
    const messages = [
      ...olderParts.flatMap((part) => part.messages),
      ...thread.messages,
    ].map((message) => ({
      ...message,
      allowRemoteImages:
        loadImagesByDefault ||
        (choices[message.fromEmail.trim().toLowerCase()] ?? inCrm),
    }));
    printMailMessages({ subject: thread.subject, messages });
  }, [thread, olderParts, loadImagesByDefault, inCrm]);

  /**
   * Reply, quoting this message rather than the newest one.
   *
   * The composer opens at its ordinary height. It used to take the whole
   * pane, which hides the thread — and the thread is what the reader was
   * looking at when they picked one message out of it to answer.
   *
   * Opening it also has to say who the reply goes to. Nothing here did, so
   * the recipient list stayed empty and Send stayed dead: the only things
   * that ever filled it were the toolbar's own Reply and closing the
   * composer, so this worked only on a thread where one of those had already
   * run. An open composer is left alone, draft and recipients and all.
   */
  const replyQuoting = React.useCallback(
    (messageId: string) => {
      // The pop-out answers this thread while it is open, and it has its own
      // reply-to-one-message on every bubble.
      if (answerInPopout()) return;
      setQuoteMessageId(messageId);
      draftDiscardedRef.current = false;
      if (!mode) {
        // Answering one message answers the person who wrote it. On our own
        // message there is nobody to answer, so the thread decides.
        const picked = [
          ...olderParts.flatMap((p) => p.messages),
          ...(thread?.messages ?? []),
        ].find((m) => m.id === messageId);
        const to =
          picked && !picked.own && picked.fromEmail
            ? [picked.fromEmail]
            : (thread?.reply.to ?? []);
        setToList(recipientsFromEmails(to));
        setCcList(recipientsFromEmails(thread?.reply.cc ?? []));
        setEditRecipients(false);
        setIncludeSignature(sigSettings?.includeOnReplies ?? false);
        setUpdateCrmNotes(false);
        setMode("reply");
      }
      focusReply();
    },
    [mode, olderParts, thread, sigSettings, answerInPopout]
  );

  const forwardMessage = React.useCallback((messageId: string) => {
    setQuoteMessageId(messageId);
    draftDiscardedRef.current = false;
    setMode("forward");
    setToList([]);
    setCcList([]);
    setShowPreview(false);
    setReply("");
    setEditorKey((k) => k + 1);
    setUpdateCrmNotes(false);
    setEditRecipients(true);
    requestAnimationFrame(() => recipientInputRef.current?.focus());
  }, []);

  const startForward = () => {
    if (mode === "forward") {
      closeComposer();
      return;
    }
    draftDiscardedRef.current = false;
    setMode("forward");
    setToList([]);
    setCcList([]);
    setShowPreview(false);
    setReply("");
    setEditorKey((k) => k + 1);
    setIncludeSignature(sigSettings?.includeOnReplies ?? false);
    setUpdateCrmNotes(false);
    // Forwards start without recipients, so open the chip editor right away.
    setEditRecipients(true);
    requestAnimationFrame(() => recipientInputRef.current?.focus());
  };

  /**
   * Keyboard shortcuts, while a thread is open.
   *
   * They live here rather than in MailPage because this is where the actions
   * are. A key press is ignored while the focus is in a field, so Cmd+R still
   * reloads the page everywhere else, and typing a reply is never intercepted.
   */
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = actionForEvent(event, shortcuts);
      if (!action) return;
      const target = event.target as HTMLElement | null;
      const typing = Boolean(
        target?.closest('input, textarea, [contenteditable="true"]')
      );
      /**
       * Nearly all of these stand down while a reply is being written, so
       * Cmd+R still reloads and the letter R still types.
       *
       * Pop out is not one of them. It moves the conversation into a window
       * of its own, which is a thing to want most while answering it — and
       * the composer here keeps what was written, so nothing is left behind.
       */
      if (typing && action !== "popOut") return;
      event.preventDefault();
      /**
       * A held key repeats, and the second archive is not a second wish.
       *
       * Archiving hands the selection to the next thread, so a repeat acts
       * on a conversation the reader has never opened — hold Cmd+Shift+A a
       * beat too long and it machine-guns down the list, one toast per
       * thread nobody meant to touch. The same for delete, which is
       * Backspace with nothing held. One press, one act; after
       * preventDefault, so the held key does not fall back to the browser
       * (a repeating Cmd+R would reload).
       */
      if (event.repeat) return;
      switch (action) {
        case "reply":
          startReply(false);
          break;
        case "replyAll":
          startReply(true);
          break;
        case "forward":
          startForward();
          break;
        case "snooze":
          setSnoozeMenuSignal((n) => n + 1);
          break;
        case "moveToFolder":
          setMoveMenuSignal((n) => n + 1);
          break;
        case "archive":
          onArchive();
          break;
        case "delete":
          // Nothing to delete when it is already deleted, and the key must
          // not quietly mean something else in this one view.
          if (!inTrash) onTrash();
          break;
        case "toggleUnread":
          onToggleUnread();
          break;
        case "print":
          printThread();
          break;
        case "popOut":
          popOutThread();
          break;
        case "togglePin":
          onTogglePin?.();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // No dependency list on purpose: the handler closes over composer state
    // that changes on nearly every keystroke, and one listener swapped per
    // render is cheaper than a list that goes stale.
  });

  /** The message being forwarded or quoted: the newest one in the thread. */
  /**
   * The message a reply or a forward quotes.
   *
   * The newest one, unless the reader picked one from its hover actions. A
   * reply to something said three messages back should quote that, not
   * whatever happens to be last.
   */
  const [quoteMessageId, setQuoteMessageId] = React.useState<string | null>(
    null
  );
  const forwardSource =
    (quoteMessageId
      ? [...olderParts.flatMap((p) => p.messages), ...(thread?.messages ?? [])]
          .find((m) => m.id === quoteMessageId)
      : undefined) ?? thread?.messages[thread.messages.length - 1];

  /**
   * What each message still has to say above itself, and where a day turns.
   *
   * Both are answered against the message before, so they are worked out once
   * over the thread rather than by each bubble about itself.
   *
   * A part is a run of messages we hold; between two parts there is a seam and
   * an unknown number of messages we do not. The first message after a seam is
   * therefore compared with nothing — we cannot say what changed across a gap
   * we cannot see.
   */
  const { metaById, newDayIds } = React.useMemo(() => {
    const segments = [
      ...olderParts.map((part) => part.messages),
      thread?.messages ?? [],
    ];
    const everything = segments.flat();
    const authorship = threadAuthorship(everything, account);
    const metaById = new Map<string, MessageMeta>();
    for (const segment of segments) {
      segment.forEach((message, i) => {
        metaById.set(
          message.id,
          messageMeta(message, segment[i - 1] ?? null, authorship)
        );
      });
    }
    const newDayIds = new Set<string>();
    everything.forEach((message, i) => {
      const previous = everything[i - 1];
      if (!message.sentAt) return;
      if (!previous || !sameDay(previous.sentAt, message.sentAt)) {
        newDayIds.add(message.id);
      }
    });
    return { metaById, newDayIds };
  }, [olderParts, thread?.messages, account]);
  const forwardSubject = thread
    ? /^fwd?:/i.test(thread.subject)
      ? thread.subject
      : `Fwd: ${thread.subject}`
    : "";

  // Replies quote the newest message Gmail-style; built once so the preview
  // shows exactly what goes out.
  const quoteFromMessage = React.useCallback(
    (source: MailMessage | undefined) => {
      if (!source) return undefined;
      return {
        fromName:
          source.fromName === "You" ||
          source.fromName.toLowerCase() === source.fromEmail.toLowerCase()
            ? ""
            : source.fromName,
        fromEmail: source.fromEmail,
        date: messageStamp(source.sentAt),
        text: decodeHtmlEntities(formatEmailBody(source.bodyText)).trim(),
        html: source.bodyHtml ? sanitizeEmailHtml(source.bodyHtml) : undefined,
      };
    },
    []
  );

  /**
   * The message the reader picked to answer, when they picked one.
   *
   * Not `forwardSource`, which falls back to the newest message so that a
   * plain reply still has something to quote. This is only ever the pick, so
   * the strip above the composer appears for a pick and for nothing else.
   */
  const quotedForReply = React.useMemo(() => {
    if (!quoteMessageId) return undefined;
    return [
      ...olderParts.flatMap((p) => p.messages),
      ...(thread?.messages ?? []),
    ].find((m) => m.id === quoteMessageId);
  }, [quoteMessageId, olderParts, thread]);

  const quotePayload = React.useMemo(() => {
    if (!forwardSource) return undefined;
    return {
      // Gmail sometimes reports the address itself as the display name.
      fromName:
        forwardSource.fromName === "You" ||
        forwardSource.fromName.toLowerCase() ===
          forwardSource.fromEmail.toLowerCase()
          ? ""
          : forwardSource.fromName,
      fromEmail: forwardSource.fromEmail,
      date: messageStamp(forwardSource.sentAt),
      text: decodeHtmlEntities(formatEmailBody(forwardSource.bodyText)).trim(),
      // Sanitized so we never relay scripts/embeds from the original.
      html: forwardSource.bodyHtml
        ? sanitizeEmailHtml(forwardSource.bodyHtml)
        : undefined,
    };
  }, [forwardSource]);

  /**
   * The message's own words, shaped for the rebuilt history.
   *
   * Each entry goes in stripped of its own quoted tail: quoting bodies
   * whole would nest every mail's tail inside the new one and send the
   * thread many times over. A message that is nothing but a quote falls
   * back to its full text rather than vanishing.
   */
  const historyEntryOf = React.useCallback((m: MailMessage) => {
    const full = decodeHtmlEntities(formatEmailBody(m.bodyText)).trim();
    const ownWords = stripQuotedReplies(full).trim();
    let html: string | undefined;
    if (m.bodyHtml) {
      const safe = sanitizeEmailHtml(m.bodyHtml);
      const split = stripQuotedHtml(safe);
      html = split.hadQuote && split.html.trim() ? split.html : safe;
    }
    return {
      fromName:
        m.fromName === "You" ||
        m.fromName.toLowerCase() === m.fromEmail.toLowerCase()
          ? ""
          : m.fromName,
      fromEmail: m.fromEmail,
      date: messageStamp(m.sentAt),
      text: ownWords || full,
      html,
    };
  }, []);

  /**
   * The thread's history, rebuilt for the tail of the next reply.
   *
   * Classic mail inherits its tail from the mail it answers, so one mail
   * sent without one — chat style here, a trimmed reply anywhere — starves
   * every mail after it, and ticking "Quote history" back on could never
   * reach past the break. Built from the thread instead, the box means
   * what it says. See lib/mail/quote-history for the whole story.
   */
  const historyAppendix = React.useMemo(() => {
    if (!thread) return null;
    const all = [
      ...olderParts.flatMap((p) => p.messages),
      ...thread.messages,
    ].filter((m) => !isPendingLocalMessage(m.id));
    if (!all.length) return null;
    // What the thread holds beyond what is loaded still counts: the note
    // under the tail says how much of the conversation it is not.
    const total =
      olderParts.reduce((n, p) => n + p.messages.length, 0) +
      (thread.totalMessageCount ?? thread.messages.length);
    const kept = all.slice(-REPLY_HISTORY_CAP);
    return buildQuoteHistory(kept.map(historyEntryOf), {
      omittedBeyond: Math.max(0, total - kept.length),
    });
  }, [thread, olderParts, historyEntryOf]);

  /**
   * Tick: fetch the full thread and put its files into the ordinary
   * attachment strip — chips, a running total, and a remove each, all
   * already there. Untick: take back the conversation's files and leave
   * what the writer added themselves; matching name as well as newness so
   * a file of their own added since ticking is not swept up with ours.
   */
  const setForwardWholeConversation = React.useCallback(
    async (on: boolean) => {
      if (!on) {
        const names = new Set(
          (forwardConversation ?? []).flatMap((m) =>
            (m.attachments ?? []).map((a) => a.filename)
          )
        );
        for (const item of attachItemsRef.current) {
          if (
            !preWholeAttachIdsRef.current.has(item.id) &&
            names.has(item.filename)
          ) {
            removeAttach(item.id);
          }
        }
        setForwardWhole(false);
        setForwardConversation(null);
        return;
      }
      if (!thread) return;
      setForwardWholeBusy(true);
      try {
        // The whole thread, fresh, from its first message. The window on
        // screen may be the middle of it, and one request answers at most
        // a page — asking for "the thread" got the newest fifty and no
        // more — so this walks the pages from the oldest until there is no
        // newer one. A conversation that has rotated through parts is
        // walked part by part, oldest part first.
        const currentPart = chatParts.find(
          (p) => p.providerThreadId === threadId
        );
        const partIds = [
          ...chatParts
            .filter(
              (p) =>
                currentPart && p.partIndex < currentPart.partIndex
            )
            .sort((a, b) => a.partIndex - b.partIndex)
            .map((p) => p.providerThreadId),
          threadId,
        ];
        const messages: MailMessage[] = [];
        for (const partThreadId of partIds) {
          messages.push(...(await loadWholeThread(account, partThreadId)));
        }
        preWholeAttachIdsRef.current = new Set(
          attachItemsRef.current.map((i) => i.id)
        );
        const refs = messages.flatMap((m) =>
          (m.attachments ?? []).map((attachment) => ({
            messageId: m.id,
            attachment,
          }))
        );
        const files: File[] = [];
        let failed = 0;
        for (const ref of refs) {
          try {
            // Through the mail transport, not the window's fetch: in the
            // desktop app nothing answers /api/mail/attachment over HTTP,
            // and the dev server's fallback page came back as the "file" —
            // 578 bytes of HTML with every attachment's name.
            const res = await mailApiFetch(
              attachmentUrl({
                account,
                messageId: ref.messageId,
                attachment: ref.attachment,
              })
            );
            if (!res.ok) throw new Error(String(res.status));
            const blob = await res.blob();
            files.push(
              new File([blob], ref.attachment.filename, {
                type: ref.attachment.mimeType || blob.type,
              })
            );
          } catch {
            failed += 1;
          }
        }
        if (files.length) addAttachFiles(files);
        if (failed) {
          toast.warning(
            `${failed} file${failed === 1 ? "" : "s"} from the conversation could not be fetched`
          );
        }
        setForwardConversation(messages);
        setForwardWhole(true);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "Couldn't load the conversation"
        );
      } finally {
        setForwardWholeBusy(false);
      }
    },
    [
      thread,
      chatParts,
      account,
      threadId,
      forwardConversation,
      removeAttach,
      addAttachFiles,
    ]
  );

  /** The forwarded conversation, oldest first — a story, not a chain. */
  const forwardWholeAppendix = React.useMemo(() => {
    if (!forwardWhole || !forwardConversation?.length || !thread) return null;
    return buildQuoteHistory(forwardConversation.map(historyEntryOf), {
      order: "oldest-first",
      heading: `Forwarded conversation — ${thread.subject} (${forwardConversation.length} messages)`,
    });
  }, [forwardWhole, forwardConversation, thread, historyEntryOf]);

  /** First name of the first recipient, for the preview header. */
  const recipientName = React.useMemo(() => {
    const first = toList[0];
    if (!first) return "the recipient";
    if (first.kind === "list") return first.name;
    const match = thread?.messages.find(
      (m) => m.fromEmail.toLowerCase() === first.email.toLowerCase()
    );
    return (
      match?.fromName?.split(" ")[0] ||
      first.name?.split(" ")[0] ||
      first.email
    );
  }, [thread, toList]);

  /** Display name Gmail will attach to the sending account, if we know it. */
  const senderName = React.useMemo(() => {
    const own = thread?.messages.find(
      (m) =>
        m.own &&
        m.fromName !== "You" &&
        m.fromName.toLowerCase() !== m.fromEmail.toLowerCase() &&
        m.fromEmail.toLowerCase() === fromAccount.toLowerCase()
    );
    return own?.fromName ?? "";
  }, [thread, fromAccount]);

  const sendForward = React.useCallback(async () => {
    const flatTo = flattenRecipientsForSend(toList);
    const flatCc = flattenRecipientsForSend(ccList);
    if (!thread || !forwardSource || !flatTo.emails.length || sending) return;
    if (!attachmentsReady) {
      toast.error(mailSay("stillPreparingAttachments"));
      return;
    }
    const attachments = attachmentPayload();
    const bcc = [...flatTo.bccEmails, ...flatCc.bccEmails];
    setSending(true);
    try {
      await apiJson("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account: fromAccount,
          to: flatTo.emails,
          cc: flatCc.emails.length ? flatCc.emails : undefined,
          bcc: bcc.length ? bcc : undefined,
          subject: forwardSubject,
          body: replyText,
          html: replyText.trim() ? bodyToEmailHtml(reply) : undefined,
          includeSignature,
          attachments: attachments.length ? attachments : undefined,
          // One message, or the whole story. The conversation goes as a
          // rebuilt transcript — its files are already in `attachments`,
          // put there when the box was ticked.
          forward: forwardWholeAppendix
            ? undefined
            : {
                fromName: forwardSource.fromName,
                fromEmail: forwardSource.fromEmail,
                date: messageStamp(forwardSource.sentAt),
                subject: thread.subject,
                to: forwardSource.toEmails,
                text: decodeHtmlEntities(
                  formatEmailBody(forwardSource.bodyText)
                ).trim(),
                // Sanitized so we never relay scripts/embeds from the original.
                html: forwardSource.bodyHtml
                  ? sanitizeEmailHtml(forwardSource.bodyHtml)
                  : undefined,
              },
          appendix: forwardWholeAppendix
            ? {
                text: forwardWholeAppendix.text,
                html: forwardWholeAppendix.html,
              }
            : undefined,
        }),
      });
      toast.success(
        mailSay("forwardedTo", { who: formatRecipientSummary(toList) })
      );
      closeComposer();
      onSent?.(fromAccount);
      scheduleThreadRefetchAfterSend(account, threadId, setThread);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't forward");
    } finally {
      setSending(false);
    }
  }, [
    thread,
    forwardSource,
    forwardWholeAppendix,
    toList,
    ccList,
    forwardSubject,
    sending,
    fromAccount,
    account,
    threadId,
    reply,
    replyText,
    includeSignature,
    closeComposer,
    attachmentsReady,
    attachmentPayload,
    onSent,
  ]);

  const markOutboxConfirmed = React.useCallback((localId: string) => {
    setOutbox((prev) => {
      if (!(localId in prev)) return prev;
      const next = { ...prev };
      delete next[localId];
      return next;
    });
    setConfirmingIds((cur) => new Set(cur).add(localId));
    window.setTimeout(() => {
      setConfirmingIds((cur) => {
        if (!cur.has(localId)) return cur;
        const next = new Set(cur);
        next.delete(localId);
        return next;
      });
    }, 220);
  }, []);

  const dispatchOutboxSendRef = React.useRef<
    ((localId: string, entry: OutboxEntry) => Promise<void>) | null
  >(null);
  const dispatchOutboxSend = React.useCallback(
    async (localId: string, entry: OutboxEntry) => {
      setOutbox((prev) => ({
        ...prev,
        [localId]: { ...entry, status: "sending" },
      }));
      setSending(true);
      try {
        const json = await apiJson<{
          chat?: MailChatRef;
          threadId?: string;
          rotated?: boolean;
          crmNotes?: {
            updated: string[];
            skipped?: string;
            errors: string[];
          };
          crmProposal?: CrmProposeResult;
        }>("/api/mail/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry.request),
        });
        if (entry.request.updateCrmNotes && json.crmNotes) {
          toastCrmNotesResult(json.crmNotes, { onApplied: onCrmChanged });
        }
        if (entry.request.updateCrmNotes && json.crmProposal) {
          setCrmProposal({ loading: false, result: json.crmProposal });
        }
        if (
          json.rotated &&
          json.threadId &&
          json.threadId !== threadId &&
          json.chat
        ) {
          setOutbox((prev) => {
            const next = { ...prev };
            delete next[localId];
            return next;
          });
          setThread((current) =>
            current
              ? {
                  ...current,
                  messages: current.messages.filter((m) => m.id !== localId),
                }
              : current
          );
          onChatThreadChanged(json.threadId, json.chat);
          return;
        }
        if (json.chat) {
          setThread((current) =>
            current ? { ...current, chat: json.chat } : current
          );
          onChatPromoted(json.chat);
        }
        // Provider accepted the send — color the bubble in. Thread refetch
        // still replaces local-* with the real message id when it appears.
        markOutboxConfirmed(localId);
        onSent?.(entry.request.account);
        scheduleThreadRefetchAfterSend(account, threadId, setThread);
      } catch (err) {
        setOutbox((prev) => ({
          ...prev,
          [localId]: { ...entry, status: "failed" },
        }));
        /**
         * Said out loud, not only shown. The red bubble with its retry is
         * in this pane — and the count between Send and the send means the
         * reader may have archived the thread and be somewhere else by the
         * time it fails. A failure nobody is looking at is a reply that
         * silently never went.
         *
         * The toast's own retry works from anywhere: the request was
         * captured whole when Send was pressed, so posting it again needs
         * nothing from a pane that may be gone.
         */
        const firstTo = entry.request.to[0] ?? "the thread";
        toast.error(`Your reply to ${firstTo} did not send`, {
          description:
            err instanceof Error ? err.message : undefined,
          duration: 15_000,
          action: {
            label: "Retry",
            onClick: () => void dispatchOutboxSendRef.current?.(localId, entry),
          },
        });
      } finally {
        setSending(false);
      }
    },
    [
      account,
      threadId,
      onChatPromoted,
      onChatThreadChanged,
      onCrmChanged,
      markOutboxConfirmed,
      onSent,
    ]
  );
  /* Through a ref so the failure toast's Retry reaches the newest version
     of the dispatch rather than the one closed over when it was shown. */
  dispatchOutboxSendRef.current = dispatchOutboxSend;

  const send = React.useCallback(async (sendAt?: string) => {
    const attachments = attachmentPayload();
    const flatTo = flattenRecipientsForSend(toList);
    const flatCc = flattenRecipientsForSend(ccList);
    if (
      !thread ||
      !flatTo.emails.length ||
      sending ||
      (!replyText.trim() && !attachments.length) ||
      !mode ||
      mode === "forward"
    ) {
      return;
    }
    if (!attachmentsReady) {
      toast.error(mailSay("stillPreparingAttachments"));
      return;
    }
    // Sending from another account: its Gmail doesn't know this threadId, so
    // we drop it and bcc the receiving account instead — the copy lands back
    // in the original thread there (threaded via the References header).
    const crossAccount = fromAccount !== account;
    const bcc = [
      ...flatTo.bccEmails,
      ...flatCc.bccEmails,
      ...(crossAccount ? [account] : []),
    ];
    // Missing noQuote on older rows = former chat-mode (treat as on).
    const chatNoQuote = Boolean(
      thread.chat && thread.chat.noQuote !== false
    );
    /**
     * A reply to one message the reader picked, rather than to the thread.
     *
     * It carries that message in its body, in the card a reaction uses. Sent
     * as the quoted history it was folded away behind a "…" by the reader,
     * and a chat-style thread drops the history altogether — so the message
     * that was picked never showed up at either end.
     */
    const pickedQuote = quoteMessageId ? quotePayload : undefined;
    const noQuote = chatNoQuote || Boolean(pickedQuote);
    const localId = `local-${Date.now()}`;
    const localQuote =
      !noQuote && historyAppendix
        ? { text: historyAppendix.text, html: historyAppendix.html }
        : null;
    const composed = quotedReplyMessage(
      replyText,
      pickedQuote,
      replyText.trim() ? bodyToEmailHtml(reply) : undefined
    );
    const replyHtml = replyText.trim() || pickedQuote
      ? composed.html
      : undefined;
    const entry: OutboxEntry = {
      status: "sending",
      mode,
      reply,
      toList,
      ccList,
      showCc,
      editRecipients,
      includeSignature,
      fromAccount,
      request: {
        account: fromAccount,
        to: flatTo.emails,
        cc: flatCc.emails.length ? flatCc.emails : undefined,
        bcc: bcc.length ? bcc : undefined,
        subject: thread.subject.startsWith("Re:")
          ? thread.subject
          : `Re: ${thread.subject}`,
        body: composed.text,
        html: replyHtml,
        // Whatever was asked for. Not quoting the history used to turn the
        // signature off with it, which made one answer out of two
        // questions: a reply can leave the history out and still be signed.
        includeSignature,
        threadId: crossAccount ? undefined : threadId,
        inReplyTo: thread.reply.inReplyTo,
        references: thread.reply.references,
        // The tail is rebuilt from the thread, not inherited from the
        // mail being answered — so it survives a chat-style mail in the
        // middle, and ticking the box back on really brings it back.
        appendix:
          noQuote || !historyAppendix
            ? undefined
            : { text: historyAppendix.text, html: historyAppendix.html },
        noQuote: noQuote || undefined,
        // Sent from a draft the provider was holding — let it go once the
        // mail is away, or Outlook/Gmail keeps an unsent copy of it.
        discardProviderDraft: importedDraftRef.current ?? undefined,
        messageCount:
          olderParts.reduce((n, p) => n + p.messages.length, 0) +
          thread.messages.length,
        updateCrmNotes:
          updateCrmNotes && (mode === "reply" || mode === "replyAll")
            ? true
            : undefined,
        attachments: attachments.length ? attachments : undefined,
        sendAt,
      },
    };

    /**
     * A message that has not gone yet does not belong in the conversation.
     *
     * The ordinary path paints the bubble straight away, because the send is
     * on its way and the bubble is only ahead of the provider's copy. This
     * one is not on its way — Exchange is holding it until the time — so the
     * thread would be showing the reader something they have not said.
     */
    if (sendAt) {
      setSending(true);
      try {
        await apiJson("/api/mail/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry.request),
        });
        toast.success(`Sends ${formatSnoozeWakeLabel(sendAt)}`);
        closeComposer();
        // Twice: the message is held as a draft, and Exchange takes a moment
        // to have it. The first look usually finds it; the second is for
        // when it does not.
        void loadScheduled();
        notifyScheduledChanged();
        window.setTimeout(() => {
          void loadScheduled();
          notifyScheduledChanged();
        }, 1500);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't schedule the message"
        );
      } finally {
        setSending(false);
      }
      return;
    }

    setOutbox((prev) => ({ ...prev, [localId]: entry }));
    setThread((current) =>
      current
        ? {
            ...current,
            messages: [
              ...current.messages,
              {
                id: localId,
                fromName: "You",
                fromEmail: fromAccount,
                toEmails: flatTo.emails,
                ccEmails: flatCc.emails,
                sentAt: new Date().toISOString(),
                // The bubble before the provider's copy lands shows what
                // actually went, quote card and all.
                bodyText: localQuote
                  ? `${composed.text.trimEnd()}\n\n${localQuote.text}`
                  : composed.text,
                bodyHtml: localQuote
                  ? `${composed.html}${localQuote.html}`
                  : composed.html,
                attachments: attachments.length
                  ? attachments.map((a, i) => ({
                      attachmentId: `local-${i}`,
                      filename: a.filename,
                      mimeType: a.mimeType,
                      size: Math.floor(
                        (a.contentBase64.replace(/\s+/g, "").length * 3) / 4
                      ),
                    }))
                  : undefined,
                own: true,
              },
            ],
          }
        : current
    );
    closeComposer();
    /**
     * A few seconds before it leaves.
     *
     * The bubble is already in the thread and the composer is already shut,
     * which is what the reader wanted; what has not happened is the send.
     * Undo is the edit that was always there — it takes the bubble back out
     * and puts the words back in the box.
     */
    sendWithUndo({
      onSend: () => void dispatchOutboxSend(localId, entry),
      onUndo: () => editOutboxSendRef.current?.(localId),
    });
  }, [
    thread,
    reply,
    replyText,
    toList,
    ccList,
    sending,
    account,
    fromAccount,
    threadId,
    includeSignature,
    quotePayload,
    historyAppendix,
    closeComposer,
    attachmentsReady,
    attachmentPayload,
    olderParts,
    mode,
    showCc,
    editRecipients,
    inCrm,
    updateCrmNotes,
    dispatchOutboxSend,
    loadScheduled,
  ]);

  const retryOutboxSend = React.useCallback(
    (localId: string) => {
      const entry = outbox[localId];
      if (!entry || entry.status !== "failed" || sending) return;
      void dispatchOutboxSend(localId, entry);
    },
    [outbox, sending, dispatchOutboxSend]
  );

  /**
   * Held in a ref because `send` is defined above this and needs it: naming
   * it in that callback's dependencies would read it before it exists.
   */
  const editOutboxSendRef = React.useRef<((localId: string) => void) | null>(
    null
  );

  const editOutboxSend = React.useCallback(
    (localId: string) => {
      const entry = outbox[localId];
      if (!entry) return;
      draftDiscardedRef.current = false;
      setOutbox((prev) => {
        const next = { ...prev };
        delete next[localId];
        return next;
      });
      setThread((current) =>
        current
          ? {
              ...current,
              messages: current.messages.filter((m) => m.id !== localId),
            }
          : current
      );
      setMode(entry.mode);
      setReply(entry.reply);
      setToList(entry.toList);
      setCcList(entry.ccList);
      setShowCc(entry.showCc);
      setEditRecipients(entry.editRecipients);
      setIncludeSignature(entry.includeSignature);
      setFromAccount(entry.fromAccount);
      setUpdateCrmNotes(Boolean(entry.request.updateCrmNotes));
      setEditorKey((k) => k + 1);
      focusReply();
    },
    [outbox, focusReply]
  );
  editOutboxSendRef.current = editOutboxSend;

  /**
   * A draft written in the pop-out, once that window has gone.
   *
   * The pop-out saves what was typed as this thread's reply draft and closes,
   * which hands focus back here — and the thread is already open, so nothing
   * would otherwise look at the store again until it was reopened.
   *
   * Focus is the signal rather than a message between the windows: the stored
   * pages already showed what a Tauri window can be trusted to tell another
   * one, and this needs no channel at all. Bring back is the one caller that
   * cannot use it, and says why where it asks.
   *
   * Only when there is nothing here to lose. A reply half-written in this
   * window is not something to overwrite with one written somewhere else.
   */
  const adoptStoredDraft = React.useCallback(() => {
    if (replyText.trim()) return;
    void getDraft(threadDraftKey(account, threadId)).then((raw) => {
      if (raw?.kind !== "thread" || !raw.body.trim()) return;
      draftDiscardedRef.current = false;
      setMode(raw.mode);
      setReply(raw.body);
      setToList(raw.toList);
      setCcList(raw.ccList);
      setShowCc(raw.showCc);
      setEditRecipients(raw.editRecipients);
      setIncludeSignature(raw.includeSignature);
      setFromAccount(raw.fromAccount);
      setEditorKey((k) => k + 1);
      focusReply(raw.caret ?? null);
    });
  }, [account, threadId, replyText]);

  React.useEffect(() => {
    window.addEventListener("focus", adoptStoredDraft);
    return () => window.removeEventListener("focus", adoptStoredDraft);
  }, [adoptStoredDraft]);

  /**
   * Bring the answer back here: the pop-out hands its draft over and goes.
   *
   * Then wait for the window to actually be gone. Focus cannot be the
   * signal this once — the click that asks for it happens in this window,
   * which therefore never loses focus and never regains it — so this is the
   * one place that watches for itself. The draft is taken up the moment the
   * pop-out is no longer there.
   */
  const handingBackRef = React.useRef(false);

  const bringBackPopout = React.useCallback(async () => {
    // Asking twice is one click too many: the second watch would still be
    // running when the draft lands in the box, and would put it there again
    // over whatever had been typed on top of it.
    if (handingBackRef.current) return;
    handingBackRef.current = true;
    const key = `${account}|${threadId}`;
    try {
      await handBackChatPopout({ account, threadId });
      for (let i = 0; i < POPOUT_HAND_BACK_TRIES; i++) {
        await new Promise((resolve) =>
          setTimeout(resolve, POPOUT_HAND_BACK_POLL_MS)
        );
        // The reader has moved on. Whatever came back belongs to a thread
        // this pane is no longer showing.
        if (popoutKeyRef.current !== key) return;
        if (await refreshPopoutOpen()) continue;
        adoptStoredDraft();
        return;
      }
    } finally {
      handingBackRef.current = false;
    }
  }, [account, threadId, refreshPopoutOpen, adoptStoredDraft]);

  /** Take it back into the composer: it stops being held, and it is a draft. */
  const editScheduled = React.useCallback(
    (message: MailScheduledMessage) => {
      draftDiscardedRef.current = false;
      setMode("reply");
      setReply(message.bodyHtml || message.bodyText);
      setEditorKey((k) => k + 1);
      void actOnScheduled(message.id, "cancel");
      focusReply();
    },
    [actOnScheduled, focusReply]
  );

  /** Gmail-style quick reaction: replies with just the emoji (+ quoted history). */
  const sendQuickReply = React.useCallback(
    async (emoji: string, quoteOverride?: ReturnType<typeof quoteFromMessage>) => {
      if (!thread || sending) return;
      const quoted = quoteOverride ?? quotePayload;
      /**
       * The emoji, and a line of what it answers.
       *
       * Mail cannot attach a reaction to a message the way a messaging app
       * does, so it goes as another message — and the emoji on its own
       * arrives with nothing to say which message it was for. The context
       * travels inside the body instead of as the quoted history below it:
       * one line is the point, and a chat-style thread leaves the history off
       * anyway. See `lib/mail/reaction-message`.
       */
      const reaction = reactionMessage(emoji, quoted);
      const emojiHtml = reaction.html;
      // A reaction never carries the whole conversation under it. It carries
      // the one line it is about.
      const noQuote = true;
      const localId = `local-${Date.now()}`;
      const entry: OutboxEntry = {
        status: "sending",
        mode: "reply",
        reply: emojiHtml,
        toList: recipientsFromEmails(thread.reply.to),
        ccList: [],
        showCc: false,
        editRecipients: false,
        includeSignature: false,
        fromAccount: account,
        request: {
          account,
          to: thread.reply.to,
          subject: thread.subject.startsWith("Re:")
            ? thread.subject
            : `Re: ${thread.subject}`,
          body: reaction.text,
          html: emojiHtml,
          includeSignature: false,
          threadId,
          inReplyTo: thread.reply.inReplyTo,
          references: thread.reply.references,
          noQuote: noQuote || undefined,
          messageCount:
            olderParts.reduce((n, p) => n + p.messages.length, 0) +
            thread.messages.length,
        },
      };
      setOutbox((prev) => ({ ...prev, [localId]: entry }));
      setThread((current) =>
        current
          ? {
              ...current,
              messages: [
                ...current.messages,
                {
                  id: localId,
                  fromName: "You",
                  fromEmail: account,
                  toEmails: thread.reply.to,
                  ccEmails: [],
                  sentAt: new Date().toISOString(),
                  // The bubble that appears before the provider's copy
                  // lands shows exactly what went out.
                  bodyText: reaction.text,
                  bodyHtml: reaction.html,
                  own: true,
                },
              ],
            }
          : current
      );
      await dispatchOutboxSend(localId, entry);
    },
    [
      thread,
      sending,
      account,
      threadId,
      quotePayload,
      olderParts,
      dispatchOutboxSend,
    ]
  );

  const bubbleActions = React.useCallback(
    (m: MailMessage) => ({
      onReact: (emoji: string) =>
        void sendQuickReply(emoji, quoteFromMessage(m)),
      onReplyTo: () => replyQuoting(m.id),
      onForward: () => forwardMessage(m.id),
    }),
    [sendQuickReply, quoteFromMessage, replyQuoting, forwardMessage]
  );

  /**
   * Start the forward another window asked for, once the message is here.
   *
   * The thread has to load first, so this waits for it rather than firing on
   * the request. Reported back so the request is not acted on twice.
   */
  React.useEffect(() => {
    if (!forwardMessageId || !thread) return;
    const known = [
      ...olderParts.flatMap((p) => p.messages),
      ...thread.messages,
    ].some((m) => m.id === forwardMessageId);
    if (!known) return;
    forwardMessage(forwardMessageId);
    onForwardStarted?.();
  }, [forwardMessageId, thread, olderParts, forwardMessage, onForwardStarted]);

  React.useEffect(() => {
    skipOpenPinRef.current = false;
    setOutbox({});
    setConfirmingIds(new Set());
    setQuoteMessageId(null);
  }, [threadId]);

  // Drop outbox rows once the provider message replaced the local-* bubble.
  React.useEffect(() => {
    if (!thread) return;
    const ids = new Set(thread.messages.map((m) => m.id));
    setOutbox((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (!ids.has(id)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [thread]);

  const latestId = thread?.messages[thread.messages.length - 1]?.id;

  /**
   * True when the thread is taller than the pane it sits in.
   *
   * The chip in the header exists to reach a beginning that has scrolled out
   * of sight. On a thread that fits, it would point at something already on
   * screen, so it is not offered.
   */
  const [threadOverflows, setThreadOverflows] = React.useState(false);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // A few pixels of slack: a thread one line over is not one you lose your
    // place in, and a chip that flickers on a resize is worse than no chip.
    const measure = () =>
      setThreadOverflows(el.scrollHeight > el.clientHeight + 24);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const content = el.firstElementChild;
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, [thread, olderParts]);

  const [firstPeekOpen, setFirstPeekOpen] = React.useState(false);
  React.useEffect(() => {
    setFirstPeekOpen(false);
  }, [threadId]);

  /**
   * Put a message in view, the same way the search deep-link does.
   *
   * A message that has just been prepended is not in the document yet, so
   * this waits a few frames for it rather than doing nothing.
   */
  const scrollToMessage = React.useCallback(async (id: string) => {
    const selector = `[data-message-id="${id
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')}"]`;
    for (let attempt = 0; attempt < 20; attempt++) {
      const el = scrollRef.current;
      const target = el?.querySelector<HTMLElement>(selector);
      if (el && target) {
        const paneTop = el.getBoundingClientRect().top;
        const targetTop = target.getBoundingClientRect().top;
        el.scrollTo({
          top: Math.max(0, el.scrollTop + (targetTop - paneTop) - 16),
          behavior: "auto",
        });
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  }, []);

  /**
   * The message the thread opened with, fetched on its own.
   *
   * One request, whatever the thread's size: the provider's id list already
   * says where a thread begins, so the oldest page is directly addressable and
   * `limit: 1` asks for that one message. Reading back to it a window at a
   * time would fetch the whole thread to show its first line.
   */
  const [firstMessage, setFirstMessage] = React.useState<MailMessage | null>(
    null
  );

  /**
   * The provider thread holding this conversation's beginning.
   *
   * A rotated conversation keeps its first message in part one, which is a
   * different provider thread from the one on screen. Asking the open thread
   * for its oldest message names the day that part started — on a long chat,
   * days or years after the conversation did.
   *
   * Null while a chat's parts are still arriving. No chip is better than a
   * chip that names the wrong day and corrects itself a moment later.
   */
  const firstPartThreadId = React.useMemo(() => {
    if (!thread?.chat) return threadId;
    if (!chatParts.length) return null;
    return (
      chatParts.find((p) => p.partIndex === 1)?.providerThreadId ?? threadId
    );
  }, [thread?.chat, chatParts, threadId]);

  React.useEffect(() => {
    setFirstMessage(null);
    if (!firstPartThreadId || !account) return;
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams({
          account,
          id: firstPartThreadId,
          oldest: "1",
          limit: "1",
          // Reading the first line of a thread is not reading the thread.
          markRead: "0",
        });
        const json = await apiJson<{ thread: MailThreadDetail }>(
          `/api/mail/thread?${params.toString()}`
        );
        if (!cancelled) setFirstMessage(json.thread.messages[0] ?? null);
      } catch {
        // The chip simply does not appear. Nothing else depends on it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firstPartThreadId, account]);

  /**
   * The first message as the thread shows it, not as a stripped-down line.
   *
   * The peek held a plain-text snippet, and a plain-text snippet is a
   * different message from the one below it: a sender who writes in HTML
   * puts links, headings and pictures in tags, and the text alternative
   * beside it — where there is one at all — carries that markup as words.
   * A GitHub notification opened this peek with `<img width="393"
   * height="924" src="…">` sitting in the middle of a sentence.
   *
   * Quoted history is dropped, the same as the bubble's own first view of a
   * message: a peek is the last place to spend six lines on a reply's
   * quotation of what came before it.
   */
  const firstPeekHtml = React.useMemo(() => {
    if (!firstMessage?.bodyHtml) return null;
    const split = stripQuotedHtml(firstMessage.bodyHtml);
    return split.hadQuote ? split.html : firstMessage.bodyHtml;
  }, [firstMessage?.bodyHtml]);

  /**
   * Whether this sender's pictures may load here.
   *
   * The same question the bubble asks, answered from the same two places,
   * so the peek cannot fetch anything the thread would have refused.
   */
  const firstPeekAllowImages = React.useMemo(() => {
    if (!firstMessage) return false;
    const sender = firstMessage.fromEmail.trim().toLowerCase();
    return loadImagesByDefault || (readImageChoices()[sender] ?? inCrm);
  }, [firstMessage, loadImagesByDefault, inCrm]);

  const [loadingToStart, setLoadingToStart] = React.useState(false);

  /**
   * Move the window to the beginning of the thread.
   *
   * A jump, not a walk. The pane already renders a window that has newer
   * messages beyond it — that is what a search deep-link leaves it in — so the
   * oldest page is one request, and scrolling back down pages forward from
   * there.
   */
  const goToFirstMessage = React.useCallback(async () => {
    if (!firstMessage || !account || !firstPartThreadId) return;

    // The beginning sits in an earlier part, so this is a move between
    // provider threads rather than a wider window on this one. It goes the
    // way a search hit goes: the pane reopens on that part, centred on that
    // message. Widening this thread could never reach it.
    const chatRef = thread?.chat;
    if (firstPartThreadId !== threadId && chatRef) {
      const part = chatParts.find((p) => p.partIndex === 1);
      setFirstPeekOpen(false);
      onChatThreadChanged(
        firstPartThreadId,
        {
          ...chatRef,
          partIndex: 1,
          subject: part?.subject ?? chatRef.subject,
          isOpenPart: part?.status === "open",
        },
        firstMessage.id
      );
      return;
    }

    setLoadingToStart(true);
    // Claimed before the fetch, so the pin cannot win a race with it.
    skipOpenPinRef.current = true;
    try {
      const params = new URLSearchParams({
        account,
        id: threadId,
        oldest: "1",
        markRead: "0",
      });
      const json = await apiJson<{ thread: MailThreadDetail }>(
        `/api/mail/thread?${params.toString()}`
      );
      setOlderParts([]);
      setThread(json.thread);
      await scrollToMessage(firstMessage.id);
      setFirstPeekOpen(false);
    } catch (err) {
      skipOpenPinRef.current = false;
      toast.error(
        err instanceof Error ? err.message : "Couldn't open the start"
      );
    } finally {
      setLoadingToStart(false);
    }
  }, [
    firstMessage,
    account,
    threadId,
    firstPartThreadId,
    thread?.chat,
    chatParts,
    onChatThreadChanged,
    scrollToMessage,
  ]);



  // Above the early returns below: hooks must run in the same order every
  // render. The key re-runs the search when messages arrive or expand, since
  // each one brings its own frame of text with it.
  const find = useThreadFind({
    rootRef: scrollRef,
    enabled: Boolean(thread),
    contentKey: [
      threadId,
      thread?.messages.length ?? 0,
      olderParts.length,
    ].join(":"),
  });

  /**
   * Send from inside the reply being written.
   *
   * The thread handler above stands down whenever the focus is in a field, so
   * a reply can contain the letter R. This one has to work from exactly
   * there, so it listens separately. Both send paths guard their own
   * preconditions, so a press with nothing to send does nothing.
   */
  const sendShortcutRef = React.useRef<() => void>(() => {});
  sendShortcutRef.current = () => {
    void (forwarding ? sendForward() : send());
  };
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!shortcutMatchesEvent(event, shortcuts.send)) return;
      event.preventDefault();
      sendShortcutRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts]);

  if (error) {
    return <p className="px-8 py-8 text-sm text-red-600">{error}</p>;
  }
  if (!thread) {
    return (
      <div className="mail-thread-surface flex min-h-0 flex-1 flex-col bg-[var(--mail-thread)]">
        <div
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-8 text-sm text-stone-500"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          {t("loadingMessage")}
        </div>
      </div>
    );
  }

  const first = thread.messages[0];
  const last = thread.messages[thread.messages.length - 1];
  /* Everyone on the thread but us — who a saved list would hold. Plainly,
     not memoized: this sits after the early returns above, where a hook
     would change the order React counts. */
  const threadOthers = threadPeople(thread.messages, [account, ...accounts])
    .others;
  const dateRange =
    first?.sentAt && last?.sentAt && shortDate(first.sentAt) !== shortDate(last.sentAt)
      ? `${shortDate(first.sentAt)} – ${shortDate(last.sentAt)}`
      : shortDate(last?.sentAt ?? null);
  // The thread's own total when the provider gave one, so the header does
  // not undercount a thread that is only partly loaded. Older parts still
  // count what is on hand — their totals are not known here.
  const totalMessageCount =
    olderParts.reduce((n, p) => n + p.messages.length, 0) +
    (thread.totalMessageCount ?? thread.messages.length);

  const chat = thread.chat;
  // Missing noQuote on older cached rows means former chat-mode threads.
  const chatStyle = Boolean(chat && chat.noQuote !== false);
  const headerTitle = thread.subject.replace(/^((re|fwd?):\s*)+/i, "");
  // Gmail-style bottom bar: Reply all only when it reaches more people than Reply.
  const showReplyAll =
    new Set(
      [...thread.reply.allTo, ...thread.reply.allCc]
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ).size > 1;

  const setChatStyle = async (noQuote: boolean) => {
    setChatStyleBusy(true);
    try {
      const json = await apiJson<{ chat: MailChatRef }>(
        "/api/mail/chat-style",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account,
            threadId,
            noQuote,
            title: counterpartName || chatTitleFromCounterpart(
              counterpartName,
              counterpartEmail
            ),
            subject: thread.subject,
            counterpartName,
            counterpartEmail: counterpartEmail || undefined,
            participantEmails: [
              ...new Set(
                [
                  counterpartEmail,
                  ...thread.reply.to,
                  ...thread.reply.allTo,
                ].filter(Boolean)
              ),
            ],
            messageCount: thread.messages.length,
          }),
        }
      );
      setThread((current) =>
        current ? { ...current, chat: json.chat } : current
      );
      onChatPromoted(json.chat);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't update chat style"
      );
    } finally {
      setChatStyleBusy(false);
    }
  };

  /**
   * ✨: ask the planner what this thread changes, and show the proposals.
   * Nothing is written until the reader applies. The thread's participants,
   * the addresses in its text and, failing those, the AI's guess decide
   * which records it is about — so a forward from yourself works too.
   */
  const updateCrmFromThread = async (
    hint?: string,
    options: { includeAttachments?: boolean } = {}
  ) => {
    if (updatingCrm) return;
    const includeAttachments = Boolean(options.includeAttachments) && readableAttachments.length > 0;
    lastProposeRef.current = { hint, includeAttachments };
    setUpdatingCrm(true);
    setCrmProposal({ loading: true, result: null });
    try {
      // Opt-in: the reader chose to give the AI the thread's PDFs. The text
      // comes out in this webview; only the text goes to the planner.
      let attachments: { filename: string; text: string }[] | undefined;
      if (includeAttachments) {
        attachments = [];
        const picked = readableAttachments.slice(0, 3);
        for (const [i, a] of picked.entries()) {
          setCrmProposal({
            loading: true,
            result: null,
            stage: `Reading ${a.filename} (${i + 1} of ${picked.length})…`,
          });
          try {
            const text = await readAttachmentText(
              attachmentUrl({
                account,
                messageId: a.messageId,
                attachment: { attachmentId: a.attachmentId, filename: a.filename, mimeType: a.mimeType, size: 0 },
              }),
              a.mimeType
            );
            if (text?.trim()) attachments.push({ filename: a.filename, text });
          } catch (err) {
            toast.error(`Couldn't read ${a.filename}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        setCrmProposal({ loading: true, result: null });
      }
      // Two calls: the match is a second, the model is longer. The dialog
      // says what the thread is about as soon as the first answers.
      const matched = await apiJson<CrmProposeResult>("/api/mail/crm-propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, threadId, phase: "match" }),
      });
      setCrmProposal({ loading: true, result: matched });
      const result = await apiJson<CrmProposeResult>("/api/mail/crm-propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, threadId, hint, attachments }),
      });
      setCrmProposal({ loading: false, result });
    } catch (err) {
      setCrmProposal({
        loading: false,
        result: {
          candidates: [],
          proposals: [],
          statusOptions: {},
          dropped: [],
          error: err instanceof Error ? err.message : "Couldn't ask the AI",
        },
      });
    } finally {
      setUpdatingCrm(false);
    }
  };

  const jumpToPart = (p: MailChatPartSummary) => {
    if (!chat || p.providerThreadId === threadId) return;
    onChatThreadChanged(p.providerThreadId, {
      ...chat,
      partIndex: p.partIndex,
      subject: p.subject,
      isOpenPart: p.status === "open",
    });
  };

  return (
    <div
      ref={setPaneNode}
      className="mail-thread-surface relative flex min-h-0 flex-1 flex-col bg-[var(--mail-thread)]"
    >
      <div
        onDoubleClick={(e) => {
          if (isInteractiveDoubleClickTarget(e.target)) return;
          onToggleFocus();
        }}
      >
        {/* Cream action strip. Slightly tighter than the New email row.
            Pull left over the w-2 resize gutter so cream meets the list
            border — only this band, not the full-height sidebar chrome. */}
        <div className="relative z-[1] -ml-2 w-[calc(100%+0.5rem)] border-b border-[var(--mail-chrome-border)] bg-[var(--mail-chrome)] pt-1.5">
          <div className="flex h-10 w-full items-center gap-1 pl-7 pr-5">
          <ThreadAction
            label={`${t("actionReply")} (${formatShortcut(
              shortcuts.reply
            )})`}
            icon={Reply}
            className={mode === "reply" ? THREAD_ACTION_ACTIVE_CLASS : undefined}
            onClick={() => startReply(false)}
          />
          <ThreadAction
            label={`${t("actionReplyAll")} (${formatShortcut(
              shortcuts.replyAll
            )})`}
            icon={ReplyAll}
            className={
              mode === "replyAll" ? THREAD_ACTION_ACTIVE_CLASS : undefined
            }
            onClick={() => startReply(true)}
          />
          <ThreadAction
            label={`${t("actionForward")} (${formatShortcut(
              shortcuts.forward
            )})`}
            icon={Forward}
            className={
              mode === "forward" ? THREAD_ACTION_ACTIVE_CLASS : undefined
            }
            onClick={startForward}
          />
          <span
            aria-hidden
            className="mx-1.5 h-5 w-px shrink-0 bg-[var(--mail-chrome-border)]"
          />
          <ThreadAction
            label={`${t(unread ? "markAsRead" : "markAsUnread")} (${formatShortcut(
              shortcuts.toggleUnread
            )})`}
            icon={MailDotIcon}
            onClick={onToggleUnread}
          />
          <SnoozeMenu
            onSnooze={onSnooze}
            onCancelSnooze={onCancelSnooze}
            currentUntil={snoozedUntil}
            openSignal={snoozeMenuSignal}
            title={`${t("actionSnooze")} (${formatShortcut(
              shortcuts.snooze
            )})`}
          />
          <span
            aria-hidden
            className="mx-1.5 h-5 w-px shrink-0 bg-[var(--mail-chrome-border)]"
          />
          <MoveToFolderMenu
            folders={folders}
            onMoved={onMoveToFolder}
            onMoveToJunk={onJunk}
            openSignal={moveMenuSignal}
            title={`${t("moveToFolder")} (${formatShortcut(
              shortcuts.moveToFolder
            )})`}
          />
          <ThreadAction
            label={`${t("actionArchive")} (${formatShortcut(
              shortcuts.archive
            )})`}
            icon={Archive}
            onClick={onArchive}
          />
          {/* Already in the bin: the useful action is getting it out again.
              There is no permanent delete here on purpose — it is the one
              action with nothing behind it. */}
          {/* Junk itself is in the move menu — filing something is a move.
              Getting it back out is not, so that keeps its own action. */}
          {inJunk && onNotJunk ? (
            <ThreadAction
              label={t("notJunk")}
              icon={ShieldCheck}
              onClick={onNotJunk}
            />
          ) : null}
          {inTrash && onRestore ? (
            <ThreadAction
              label={t("restore")}
              icon={ArchiveRestore}
              onClick={onRestore}
            />
          ) : (
            <ThreadAction
              label={`${t("actionDelete")} (${formatShortcut(
                shortcuts.delete
              )})`}
              icon={Trash2}
              onClick={onTrash}
            />
          )}
          <span
            aria-hidden
            className="mx-1.5 h-5 w-px shrink-0 bg-[var(--mail-chrome-border)]"
          />
          {compactToolbar ? null : (
            <>
              <ThreadAction
                label={`${t("actionPrint")} (${formatShortcut(
                  shortcuts.print
                )})`}
                icon={Printer}
                onClick={printThread}
              />
              <ThreadAction
                label={`${t("popOutChat")} (${formatShortcut(
                  shortcuts.popOut
                )})`}
                icon={PictureInPicture2}
                onClick={popOutThread}
              />
            </>
          )}
          {mailUsesCrmPeople() ? (
            <ThreadAction
              label={t(updatingCrm ? "askingAi" : "updateCrm")}
              icon={updatingCrm ? Loader2 : Sparkles}
              disabled={updatingCrm}
              className={updatingCrm ? "[&_svg]:animate-spin" : undefined}
              onClick={() => void updateCrmFromThread()}
            />
          ) : null}
          {showAddToCrm ? (
            <AddToCrmMenu
              attachmentCount={readableAttachments.length}
              onPropose={(hint, includeAttachments) =>
                void updateCrmFromThread(hint, { includeAttachments })
              }
            />
          ) : null}
          <div className="ml-auto flex items-center gap-3">
            <ThreadAttachmentsRollup
              account={account}
              items={[
                ...olderParts.flatMap((p) => p.messages),
                ...thread.messages,
              ].flatMap((m) =>
                (m.attachments ?? []).map((attachment) => ({
                  messageId: m.id,
                  attachment,
                }))
              )}
              onPreview={(messageId, attachment) => {
                setAttachmentPreview({ messageId, attachment });
              }}
            />
            {compactToolbar ? (
              <ThreadToolbarOverflow
                focusMode={focusMode}
                zoom={zoom}
                onZoomAdjust={onZoomAdjust}
                onPrint={printThread}
                onPopOut={popOutThread}
                onToggleFocus={onToggleFocus}
                printLabel={`${t("actionPrint")} (${formatShortcut(
                  shortcuts.print
                )})`}
                popOutLabel={`${t("popOutChat")} (${formatShortcut(
                  shortcuts.popOut
                )})`}
              />
            ) : (
              <>
                <ZoomControls zoom={zoom} onAdjust={onZoomAdjust} />
                <ThreadAction
                  label={t(focusMode ? "showMailList" : "focusMode")}
                  icon={focusMode ? Minimize2 : Maximize2}
                  onClick={onToggleFocus}
                />
              </>
            )}
          </div>
          </div>
        </div>
        {/* The subject stays while the thread moves under it, and says so
            with a shadow rather than a rule. It reaches about ten pixels
            down: enough to lift the header off what is scrolling beneath,
            not so far that it reads as a bar of its own.

            `relative z-10` is what makes it visible at all — the stream is
            painted after this in the document, so without a layer to sit
            on, the shadow would land under it.

            Pulled left over the w-2 resize gutter, the same as the cream
            strip above it, so the shadow reaches the mail list instead of
            stopping eight pixels short of it. pl-10 rather than pl-8 puts
            the subject back where it was after the pull. */}
        <div className="mail-thread-header relative z-10 -ml-2 w-[calc(100%+0.5rem)] min-w-0 bg-[var(--mail-thread)] pb-2 pl-10 pr-8 pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-lg font-bold text-stone-900">
              {headerTitle}
            </h2>
            {/*
              Where the thread began, for a thread long enough to have lost
              its beginning off the top. It reads the first message rather
              than describing it, because "what was this about" is answered by
              the words and not by a date.

              Not on a thread of one message. A long single message overflows
              too, but its beginning is the top of the message the reader is
              already looking at, and "Started" says nothing about a mail
              nobody has answered. The first message is the newest one when
              their ids agree — across a chat's rotated parts, they will not.
            */}
            {threadOverflows && firstMessage && firstMessage.id !== latestId ? (
              <Popover
                open={firstPeekOpen}
                onOpenChange={setFirstPeekOpen}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title={t("threadStarted")}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-600 transition-colors hover:bg-stone-50"
                  >
                    Started {shortDate(firstMessage.sentAt)}
                    <ArrowUpRight
                      className="h-3.5 w-3.5 text-stone-400"
                      aria-hidden
                    />
                  </button>
                </PopoverTrigger>
                <MailPopoverContent
                  align="end"
                  className="w-[420px] max-w-[80vw] p-0"
                >
                  <div className="flex items-start justify-between gap-3 px-3.5 pt-3">
                    <div className="min-w-0 text-xs text-stone-500">
                      <p className="truncate">
                        <span className="text-stone-400">
                          {t("fieldFromColon")}{" "}
                        </span>
                        <span className="font-semibold text-stone-800">
                          {firstMessage.fromEmail || firstMessage.fromName}
                        </span>
                      </p>
                      {firstMessage.toEmails?.length ? (
                        <p className="truncate">
                          <span className="text-stone-400">To: </span>
                          {firstMessage.toEmails.join(", ")}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      aria-label={t("close")}
                      className="-mr-1 shrink-0 rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                      onClick={() => setFirstPeekOpen(false)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {/*
                    Six lines and no more. This is a peek, and a first message
                    long enough to fill the pane would put the way back to the
                    thread off the bottom of it.

                    The frame is the one the thread reads with, so a link is a
                    link here too, and a picture at the head of a message is a
                    picture — capped at 72px, which is a thumbnail, because a
                    screenshot at its own height is six lines of screenshot.
                    `mail-bubble-surface`: the mail inside is dark on white,
                    the same island the bubbles are.
                  */}
                  {firstPeekHtml ? (
                    /* No padding of our own: the frame carries 14px of its
                       own, which is exactly where the From line above and
                       the buttons below sit. */
                    <div className="mail-bubble-surface mt-1 max-h-[8.5rem] overflow-hidden">
                      <EmailHtmlView
                        html={firstPeekHtml}
                        inlineImages={firstMessage.inlineImages}
                        allowImages={firstPeekAllowImages}
                        imageMaxHeight={72}
                      />
                    </div>
                  ) : (
                    <p className="mt-2 max-h-[8.5rem] overflow-hidden px-3.5 text-sm leading-relaxed text-stone-800">
                      {messageSnippet(firstMessage) || "(no text)"}
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-3 px-3.5 pb-3">
                    {/* The peek stays up until the jump lands. Closing it
                        first left the reader looking at an unchanged thread
                        while a page was fetched, with nothing to say so. */}
                    <button
                      type="button"
                      disabled={loadingToStart}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:underline disabled:opacity-60 disabled:hover:no-underline"
                      onClick={() => void goToFirstMessage()}
                    >
                      {loadingToStart ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {t("goingToFirst")}
                        </>
                      ) : (
                        t("goToThisMessage")
                      )}
                    </button>
                    <span className="shrink-0 text-xs text-stone-400">
                      {messageStamp(firstMessage.sentAt)}
                    </span>
                  </div>
                </MailPopoverContent>
              </Popover>
            ) : null}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-stone-500">
            {/*
              A circular arrives with the whole club on it, and that is a
              list worth keeping — the same list the composer offers to save
              when you type the names in yourself. Here they are already
              gathered, so the offer belongs here too. It lives inside the
              participants, which is what knows whether the names are out.
            */}
            <ThreadParticipants
              people={participantsWithAddresses(thread.messages, [
                account,
                ...accounts,
              ])}
              others={threadOthers}
              meta={
                <>
                  ·{" "}
                  {totalMessageCount === 1
                    ? t("threadMessageOne")
                    : t("threadMessageMany", { count: totalMessageCount })}{" "}
                  · {dateRange} · {t("threadReceivedOn")} {account}
                </>
              }
            />
            {chatParts.length > 1 ? (
              <>
                <span aria-hidden>·</span>
                <Popover open={partMenuOpen} onOpenChange={setPartMenuOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-0.5 font-medium text-stone-700 hover:text-stone-900"
                    >
                      {t("earlier")}
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <MailPopoverContent align="start" className="w-56 p-1">
                    {[...chatParts].reverse().map((p) => (
                      <button
                        key={p.partIndex}
                        type="button"
                        className={cn(
                          "flex w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-stone-100",
                          p.partIndex === chat?.partIndex
                            ? "font-semibold text-stone-900"
                            : "text-stone-700"
                        )}
                        onClick={() => {
                          setPartMenuOpen(false);
                          jumpToPart(p);
                        }}
                      >
                        {partJumpLabel(p, chat?.partIndex ?? p.partIndex)}
                      </button>
                    ))}
                  </MailPopoverContent>
                </Popover>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {!replyFocus && find.open ? (
        <ThreadFindBar
          query={find.query}
          onQueryChange={find.setQuery}
          count={find.count}
          index={find.index}
          onNext={find.next}
          onPrev={find.prev}
          onClose={find.close}
        />
      ) : null}

      {!replyFocus ? (
        /* The stream, and the way back down to the end of it laid over the
           bottom of the stream rather than under it — a row of its own
           would push the composer down every time somebody scrolled. */
        <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={setScrollNode}
          /* Less above than below: the first thing in the stream is nearly
             always a day heading, which brings its own space, and the two
             together left a hole under the subject. */
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-none bg-[var(--mail-thread)] px-4 pb-5 pt-2",
            narrowBubbles && "mail-thread-narrow"
          )}
        >
          <div className="flex flex-col gap-4" style={{ zoom }}>
            {headHasOlderInPart ||
            canLoadOlderAcrossParts ||
            loadingOlder ? (
              <div className="flex justify-center py-1">
                {loadingOlder ? (
                  <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
                ) : (
                  <button
                    type="button"
                    className="text-[11px] font-medium text-stone-400 hover:text-stone-600"
                    onClick={() => void loadOlderMessages()}
                  >
                    {t("loadEarlier")}
                  </button>
                )}
              </div>
            ) : null}
            {olderParts.map((part, i) => {
              const nextPartIndex =
                olderParts[i + 1]?.partIndex ?? chat?.partIndex;
              return (
                <React.Fragment key={`part-${part.partIndex}`}>
                  {part.messages.map((m) => (
                    <React.Fragment key={`day-${m.id}`}>
                    {newDayIds.has(m.id) ? (
                      <DayHeading iso={m.sentAt} />
                    ) : null}
                    <div
                      key={m.id}
                      data-mail-bubble="1"
                      data-message-id={m.id}
                      className={cn(
                        "min-w-0",
                        highlightMessageId === m.id &&
                          "mail-search-hit rounded-2xl"
                      )}
                    >
                      <MailBubble
                        message={m}
                        account={account}
                        subject={thread.subject}
                        defaultAllowImages={inCrm}
                        isLatest={false}
                        zoom={zoom}
                        meta={metaById.get(m.id)}
                        timeLabel={timeOfDay(m.sentAt)}
                        {...bubbleActions(m)}
                        onPreviewAttachment={(attachment) =>
                          setAttachmentPreview({
                            messageId: m.id,
                            attachment,
                          })
                        }
                      />
                    </div>
                    </React.Fragment>
                  ))}
                  {nextPartIndex != null ? (
                    <PartSeam
                      onView={() => {
                        const earlier = chatParts.find(
                          (p) => p.partIndex === part.partIndex
                        );
                        if (earlier) jumpToPart(earlier);
                      }}
                    />
                  ) : null}
                </React.Fragment>
              );
            })}
            {chat &&
            chat.partIndex > 1 &&
            olderParts.length === 0 &&
            chatParts.some((p) => p.partIndex < chat.partIndex) ? (
              <PartSeam
                onView={() => {
                  const earlier = [...chatParts]
                    .filter((p) => p.partIndex < chat.partIndex)
                    .sort((a, b) => b.partIndex - a.partIndex)[0];
                  if (earlier) jumpToPart(earlier);
                }}
              />
            ) : null}
            {thread.messages.map((m) => {
              const outboxStatus = outbox[m.id]?.status;
              return (
                <React.Fragment key={`day-${m.id}`}>
                {newDayIds.has(m.id) ? <DayHeading iso={m.sentAt} /> : null}
                <div
                  key={m.id}
                  data-mail-bubble="1"
                  data-message-id={m.id}
                  className={cn(
                    "min-w-0",
                    highlightMessageId === m.id && "mail-search-hit rounded-2xl",
                    confirmingIds.has(m.id) && "mail-sent-confirm"
                  )}
                >
                  <MailBubble
                    message={m}
                    account={account}
                    subject={thread.subject}
                    defaultAllowImages={inCrm}
                    isLatest={m.id === latestId}
                    sendStatus={outboxStatus}
                    zoom={zoom}
                    meta={metaById.get(m.id)}
                    timeLabel={timeOfDay(m.sentAt)}
                    onRetrySend={
                      outboxStatus === "failed"
                        ? () => retryOutboxSend(m.id)
                        : undefined
                    }
                    onEditSend={
                      outboxStatus === "failed"
                        ? () => editOutboxSend(m.id)
                        : undefined
                    }
                    {...bubbleActions(m)}
                    onPreviewAttachment={(attachment) =>
                      setAttachmentPreview({ messageId: m.id, attachment })
                    }
                  />
                </div>
                </React.Fragment>
              );
            })}
            {/* Held, not sent. Dashed and dimmed says the same thing the
                undo count says: this has not gone anywhere yet. */}
            {scheduled.map((held) => (
              <div key={held.id} className="flex flex-col items-end gap-1 py-1">
                <div className="w-full max-w-[85%] self-end rounded-2xl rounded-br-md border border-dashed border-teal-300 bg-[var(--mail-bubble-own)]/60 px-3.5 py-2.5">
                  <p className="whitespace-pre-wrap break-words text-sm text-stone-600">
                    {held.bodyText}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 pr-1 text-xs text-stone-500">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  <span>Sends {formatSnoozeWakeLabel(held.sendAt)}</span>
                  <span aria-hidden className="text-stone-300">·</span>
                  <button
                    type="button"
                    className="font-semibold text-teal-700 hover:text-teal-800"
                    onClick={() => editScheduled(held)}
                  >
                    {t("edit")}
                  </button>
                  <span aria-hidden className="text-stone-300">·</span>
                  <button
                    type="button"
                    className="font-semibold text-teal-700 hover:text-teal-800"
                    onClick={() => void actOnScheduled(held.id, "sendNow")}
                  >
                    {t("sendNow")}
                  </button>
                  <span aria-hidden className="text-stone-300">·</span>
                  <button
                    type="button"
                    className="font-semibold text-teal-700 hover:text-teal-800"
                    onClick={() => void actOnScheduled(held.id, "cancel")}
                  >
                    {t("cancel")}
                  </button>
                </div>
              </div>
            ))}
            {thread.hasNewer || loadingNewer ? (
              <div className="flex justify-center py-1">
                {loadingNewer ? (
                  <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
                ) : (
                  <button
                    type="button"
                    className="text-[11px] font-medium text-stone-400 hover:text-stone-600"
                    onClick={() => void loadNewerMessages()}
                  >
                    {t("loadNewer")}
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          aria-label={t("goToLatest")}
          title={t("goToLatest")}
          /* Kept in the tree and faded, so it arrives and leaves quietly.
             `pointer-events-none` while it is invisible, or it would go on
             taking clicks meant for the message under it. */
          className={cn(
            /* Above the actions that appear beside a message on hover.
               They share this corner when the last message is the one
               under the pointer, and this is the one being aimed at. */
            "absolute bottom-4 right-5 z-30 flex h-9 w-9 items-center justify-center rounded-full",
            "border border-stone-200 bg-white text-stone-600 shadow-md",
            "transition-opacity hover:bg-stone-50 hover:text-stone-900",
            /* Scrolled up, or looking at a window that does not reach the
               end of the thread. The second is how the start of a long
               thread looks: at the bottom of that page, with the newest
               message still hundreds of messages away. */
            awayFromLatest || thread.hasNewer
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          )}
          onClick={() => void goToLatestMessage()}
        >
          <ChevronDown className="h-5 w-5" aria-hidden />
        </button>
        </div>
      ) : null}

      <AttachmentPreviewDialog
        account={account}
        messageId={attachmentPreview?.messageId ?? ""}
        attachment={attachmentPreview?.attachment ?? null}
        onClose={() => setAttachmentPreview(null)}
      />

      {!mode && popoutOpen ? (
        <PopoutStrip
          onShow={() => void focusChatPopout({ account, threadId })}
          onBringBack={() => void bringBackPopout()}
        />
      ) : null}

      {!mode && !popoutOpen ? (
        /**
         * One row, whatever the pane is doing.
         *
         * Four words and their icons need about 480px, and below that they
         * used to wrap — a second row of buttons appearing under the first
         * and pushing itself off the bottom of the pane.
         *
         * What goes is the words on the other three. Reply is the one
         * pressed nearly every time, so it keeps its own: an icon on its
         * own is a thing to be worked out, and the commonest action in the
         * app should never be that. The rest become what a toolbar is
         * anyway — an icon with a name on hover.
         */
        <div
          className={cn(
            "flex items-center justify-end border-t border-stone-200 bg-[var(--mail-thread)] py-3",
            compactThreadActions ? "gap-2 px-4" : "gap-3 px-8"
          )}
        >
          <button
            type="button"
            title={`${t("actionReply")} (${formatShortcut(shortcuts.reply)})`}
            className="mail-light-surface inline-flex shrink-0 items-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-2.5 text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
            onClick={() => startReply(false)}
          >
            <Reply className="h-4 w-4" />
            {t("actionReply")}
          </button>
          {showReplyAll ? (
            <button
              type="button"
              title={`${t("actionReplyAll")} (${formatShortcut(
                shortcuts.replyAll
              )})`}
              aria-label={t("actionReplyAll")}
              className={cn(threadActionClass, compactThreadActions && circleActionClass)}
              onClick={() => startReply(true)}
            >
              <ReplyAll className="h-4 w-4" />
              {compactThreadActions ? null : t("actionReplyAll")}
            </button>
          ) : null}
          <button
            type="button"
            title={`${t("actionForward")} (${formatShortcut(
              shortcuts.forward
            )})`}
            aria-label={t("actionForward")}
            className={cn(threadActionClass, compactThreadActions && circleActionClass)}
            onClick={startForward}
          >
            <Forward className="h-4 w-4" />
            {compactThreadActions ? null : t("actionForward")}
          </button>
          <EmojiReactionButton
            disabled={sending}
            onPick={(emoji) => void sendQuickReply(emoji)}
          />
        </div>
      ) : null}

      {mode ? (
        <div
          className={cn(
            "border-t border-stone-200 bg-[var(--mail-thread)] py-4",
            /* Edge to edge at this width, all but the right: the box was
               ending exactly where the window does, and the words in it
               ran up to the glass. The left has the list beside it to
               stand off, and the right had nothing. Eight pixels, which
               is what the box needed and all the room there is to give. */
            compactComposer ? "pl-0 pr-2" : fullWidthComposer ? "px-3" : "px-8",
            replyFocus && "flex min-h-0 flex-1 flex-col"
          )}
        >
          {/* Full-width measure root so % width is of the content box, not padding. */}
          <div
            className={cn(
              "flex w-full justify-end",
              replyFocus && "min-h-0 flex-1 flex-col items-end"
            )}
          >
          {/* Width matches own bubbles; right-aligned; drag either edge to resize. */}
          <div
            className={cn(
              "relative",
              replyFocus && "flex min-h-0 flex-1 flex-col"
            )}
            // Its dragged width, until there is not enough pane for a
            // width to be worth choosing.
            style={{
              width:
                compactComposer || fullWidthComposer
                  ? "100%"
                  : `${composerWidthPct}%`,
              maxWidth: "100%",
            }}
          >
          {/* No edges to drag while the box is the whole pane: there is
              nowhere for either to go, and a handle that cannot move is a
              handle that reads as broken. */}
          {compactComposer || fullWidthComposer ? null : (
            <>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t("resizeReplyWidth")}
                title={t("dragToResize")}
                onPointerDown={startComposerResize("left")}
                className="absolute inset-y-0 left-0 z-10 w-2 -translate-x-1/2 cursor-col-resize touch-none"
              />
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t("resizeReplyWidth")}
                title={t("dragToResize")}
                onPointerDown={startComposerResize("right")}
                className="absolute inset-y-0 right-0 z-10 w-2 translate-x-1/2 cursor-col-resize touch-none"
              />
            </>
          )}
          {/* Hidden (not unmounted) during preview so the draft is kept. */}
          <div
            className={cn(
              showPreview ? "hidden" : undefined,
              replyFocus && "flex min-h-0 flex-1 flex-col"
            )}
          >
          {/* What is going with it.
              The forwarded message is attached when the mail is sent, so
              nothing on screen said which one it was — and a forward started
              from a message's own hover menu could not be told from one
              started from the toolbar, which takes the newest. */}
          {forwarding && forwardSource ? (
            <div className="mb-2 flex items-start gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
              <Forward
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400"
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-stone-500">
                  {forwardWhole
                    ? t("forwardingWholeConversation")
                    : `Forwarding ${
                        forwardSource.own
                          ? "your message"
                          : `${forwardSource.fromName || forwardSource.fromEmail}'s message`
                      }`}
                </span>
                <span className="mt-0.5 block truncate text-xs text-stone-600">
                  {forwardWhole && forwardConversation
                    ? `${forwardConversation.length} messages, oldest first, files included`
                    : reactionQuoteText(forwardSource.bodyText) || "(no text)"}
                </span>
              </span>
            </div>
          ) : null}
          {/* What this reply answers.
              Picking one message out of a thread used to do nothing you could
              see: the caret moved into the box, and which message had been
              picked was invisible until it arrived at the other end. */}
          {!forwarding && quotedForReply ? (
            <div className="mb-2 flex items-start gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
              <Reply
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400"
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-stone-500">
                  Replying to{" "}
                  {quotedForReply.own
                    ? t("yourself")
                    : quotedForReply.fromName || quotedForReply.fromEmail}
                </span>
                <span className="mt-0.5 block truncate text-xs text-stone-600">
                  {reactionQuoteText(quotedForReply.bodyText) || t("noText")}
                </span>
              </span>
              <button
                type="button"
                title={t("answerThreadInstead")}
                aria-label={t("answerThreadInstead")}
                className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-stone-400 hover:bg-stone-200/70 hover:text-stone-700"
                onClick={() => setQuoteMessageId(null)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
          <div
            className={cn(
              "mb-1 flex gap-2",
              /* On one line, the focus button is taller than the words
                 beside it, and aligned to the top it hung below them —
                 which read as space under the line rather than as a
                 button standing proud of it. Centred, that height is
                 shared above and below.

                 Opened out into the recipient fields, the block is taller
                 than the button and centring would strand it halfway down
                 the side, so there it still sits at the top. */
              editRecipients ? "items-start" : "items-center"
            )}
            onDoubleClick={(e) => {
              if (isInteractiveDoubleClickTarget(e.target)) return;
              setReplyFocus((v) => !v);
            }}
          >
            <div className="min-w-0 flex-1">
              {editRecipients ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <RecipientField
                        label={t("fieldTo")}
                        values={toList}
                        onChange={setToList}
                        allowSaveList
                        // Reply-all to a circular is thirty addresses. Folded
                        // while nobody is editing them, as in the compose
                        // window — see RecipientField.
                        collapseAfter={6}
                        ownAccounts={accounts}
                        placeholder={
                          forwarding
                            ? "name@example.com, second@example.com"
                            : t("addRecipient")
                        }
                        inputRef={recipientInputRef}
                      />
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2.5 py-[7px]">
                      <span className="text-xs text-muted-foreground">
                        {t("fieldFrom")}
                      </span>
                      {accounts.length > 1 ? (
                        <span className="relative inline-flex items-center">
                          <select
                            value={fromAccount}
                            onChange={(e) => setFromAccount(e.target.value)}
                            className="max-w-[22ch] cursor-pointer appearance-none truncate bg-transparent py-0.5 pr-4 text-sm text-stone-700 outline-none"
                          >
                            {accounts.map((a) => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-stone-400" />
                        </span>
                      ) : (
                        <span className="py-0.5 text-sm text-stone-700">
                          {account}
                        </span>
                      )}
                    </div>
                  </div>
                  {ccList.length || showCc ? (
                    <RecipientField
                      label={t("fieldCc")}
                      values={ccList}
                      onChange={setCcList}
                      collapseAfter={6}
                      ownAccounts={accounts}
                      placeholder={t("addRecipient")}
                    />
                  ) : (
                    <p className="px-1 text-xs text-muted-foreground">
                      <button
                        type="button"
                        className="text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
                        onClick={() => setShowCc(true)}
                      >
                        {t("addCc")}
                      </button>
                    </p>
                  )}
                </div>
              ) : (
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-1 text-xs text-muted-foreground">
                  <span>{t(forwarding ? "forwardingTo" : "replyingTo")}</span>
                  <button
                    type="button"
                    title={t("editRecipients")}
                    className="min-w-0 truncate font-semibold text-stone-800 underline-offset-2 hover:underline"
                    onClick={() => setEditRecipients(true)}
                  >
                    {toList.length
                      ? formatRecipientSummary(toList)
                      : t("addRecipients")}
                  </button>
                  <span aria-hidden>·</span>
                  <button
                    type="button"
                    title={t(ccList.length ? "editCc" : "addCc")}
                    className="min-w-0 truncate text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
                    onClick={() => {
                      setShowCc(true);
                      setEditRecipients(true);
                    }}
                  >
                    Cc
                    {ccList.length ? (
                      <span className="ml-1 font-semibold text-stone-800">
                        {formatRecipientSummary(ccList)}
                      </span>
                    ) : null}
                  </button>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    from
                    {accounts.length > 1 ? (
                      /* As wide as the address it names, with the chevron
                         where the words stop. A select was as wide as its
                         longest option, so with a team address in the list
                         the shorter ones left a gap with nothing in it. */
                      <FromAccountMenu
                        value={fromAccount}
                        accounts={accounts}
                        onChange={setFromAccount}
                      />
                    ) : (
                      <span className="text-stone-700">{account}</span>
                    )}
                  </span>
                </p>
              )}
            </div>
            <button
              type="button"
              title={t(replyFocus ? "showThread" : "focusMode")}
              aria-label={t(replyFocus ? "showThread" : "focusMode")}
              aria-pressed={replyFocus}
              className="shrink-0 rounded-md p-1.5 text-stone-500 hover:bg-stone-200/60 hover:text-stone-800"
              onClick={() => setReplyFocus((v) => !v)}
            >
              {replyFocus ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
          </div>
            <div
            key={editorKey}
            ref={replyRef}
            className={cn(
              // The card is chrome and takes the theme; only the box you
              // type in is a light island — see below, and the compose
              // window, which is split the same way.
              "mail-composer-card relative rounded-xl border border-teal-700/50 bg-white focus-within:border-teal-700",
              replyFocus && "mail-composer-card-focus flex min-h-0 flex-1 flex-col"
            )}
            style={{ zoom }}
            {...attachDropHandlers}
            {...attachPasteHandlers}
          >
              <ComposerDropOverlay visible={attachDragging} />
              {/* Where the words go. No light island: what you write is
                  shown in the thread on a dark bubble now, so writing it on
                  a white one would be the odd half of the pair. In focus
                  mode this is the child that grows, so it carries the flex
                  chain the editor needs. */}
              <div
                className={cn(
                  "rounded-t-xl",
                  replyFocus && "flex min-h-0 flex-1 flex-col"
                )}
              >
              <RichTextEditor
                /* A theme is chosen when Quill is built, so crossing the
                   width builds a new one. The key says so outright rather
                   than leaving it to react-quill to notice; `defaultValue`
                   is the live draft, so the words come back with it. */
                key={compactComposer ? "bubble" : "snow"}
                className="mail-compose-editor"
                {...(compactComposer
                  ? ({ variant: "bubble" } as const)
                  : ({ toolbarId: "mail-reply-toolbar" } as const))}
                handleRef={replyEditorHandle}
                defaultValue={reply}
                onChange={setReply}
                placeholder={
                  forwarding
                    ? t("forwardNotePlaceholder")
                    : `Reply to ${thread.participants.filter((p) => p !== "You")[0] ?? "the thread"}…`
                }
                minHeight={replyFocus ? 240 : 80}
              />
              {includeSignature && sigSettings?.signature ? (
                <ComposerSignature signature={sigSettings.signature} />
              ) : null}
              <DraftAttachmentChips
                items={attachItems}
                onRemove={removeAttach}
              />
              </div>
            <div className="flex shrink-0 flex-col gap-1.5 px-3 pb-2.5 pt-1">
              <div className="flex flex-wrap items-center gap-3">
                {/* One control: Send, and a section that says when. Not on a
                    forward — that leaves through its own path, which has
                    nowhere to put a time. */}
                <div className="inline-flex items-stretch overflow-hidden rounded-lg">
                  <Button
                    type="button"
                    className={cn(
                      "h-8 rounded-none bg-teal-600 text-sm font-semibold text-white hover:bg-teal-700",
                      // Tighter on the left than the right: the arrow ends
                      // nearer its own edge than a letter would.
                      canSendLater && !forwarding ? "pl-4 pr-3.5" : "pl-4 pr-5"
                    )}
                    /* Named with its key, the way the actions above the
                       thread are. The same key sends a forward, so the
                       tooltip follows the word on the button. */
                    title={`${t(forwarding ? "actionForward" : "send")} (${formatShortcut(
                      shortcuts.send
                    )})`}
                    disabled={
                      sending ||
                      !emailsOfRecipients(toList).length ||
                      !attachmentsReady ||
                      (!forwarding && !replyText.trim() && !attachItems.length)
                    }
                    onClick={() => void (forwarding ? sendForward() : send())}
                  >
                    {/* Before the word, pointing the way out. A forward is
                        a send too, so it carries the same arrow.

                        Under the 16px the button gives every icon it
                        holds — an arrow beside one word reads as a mark
                        on it rather than a button of its own. The `!`
                        is what beats the button's rule, which reaches
                        the icon as a descendant and so outranks a plain
                        class on it. */}
                    <SendHorizontal aria-hidden className="!size-3.5" />
                    {sending
                      ? t("sending")
                      : t(forwarding ? "actionForward" : "send")}
                  </Button>
                  {canSendLater && !forwarding ? (
                    <SendLaterMenu
                      onPick={(iso) => void send(iso)}
                      trigger={
                        <button
                          type="button"
                          aria-label={t("sendLater")}
                          title={t("sendLater")}
                          disabled={
                            sending ||
                            !emailsOfRecipients(toList).length ||
                            !attachmentsReady ||
                            (!replyText.trim() && !attachItems.length)
                          }
                          className="flex h-8 items-center border-l border-white/25 bg-teal-600 px-2.5 text-white hover:bg-teal-700 disabled:opacity-50"
                        >
                          <ChevronDown className="h-4 w-4" aria-hidden />
                        </button>
                      }
                    />
                  ) : null}
                </div>
                {/* The bar only exists at full width. Narrow, the editor is
                    built in Quill's bubble theme instead, which puts these
                    same controls over the selection — so there is no bar to
                    hide and no button to unhide it.

                    Quill binds to this element by id and writes its own
                    classes on it, so nothing here sets className: React
                    would overwrite them on the next render and leave the
                    buttons unstyled. Rendering it only for "snow" also
                    gives each editor fresh buttons to bind to. */}
                {compactComposer ? null : (
                  <div id="mail-reply-toolbar">
                    <span className="ql-formats">
                      <button className="ql-bold" aria-label={t("bold")} />
                      <button className="ql-italic" aria-label={t("italic")} />
                      <button
                        className="ql-underline"
                        aria-label={t("underline")}
                      />
                      <button
                        className="ql-list"
                        value="bullet"
                        aria-label={t("bulletList")}
                      />
                      <button
                        className="ql-list"
                        value="ordered"
                        aria-label={t("numberedList")}
                      />
                      <button className="ql-link" aria-label={t("link")} />
                    </span>
                  </div>
                )}
                {/* Circles when the row is narrow, so the buttons that are
                    always there read as one set. */}
                <AttachToolbarButton
                  onPick={addAttachFiles}
                  disabled={sending}
                  className={compactComposer ? COMPOSER_CIRCLE_CLASS : undefined}
                />
                <EmojiPickerButton
                  onPick={(emoji) => replyEditorHandle.current?.insertText(emoji)}
                  className={
                    compactComposer
                      ? cn(
                          COMPOSER_CIRCLE_CLASS,
                          "items-center justify-center [&_svg]:h-4 [&_svg]:w-4"
                        )
                      : undefined
                  }
                />
                <AttachmentSizeSummary
                  count={attachItems.length}
                  totalBytes={attachTotalBytes}
                />
                {/* One row, so the bin sits level with Send rather than on
                    a line of its own under it. There were two rows because
                    the second held Add signature, Preview and Chat style
                    as well; those are under the card now, and what is left
                    belongs beside the buttons it is one of. */}
                <span className="ml-auto flex items-center gap-3">
                  {/* Only where there is a CRM to write to. The notes it
                      offers to update live in the planner, so on a build
                      without that layer this was offering to do a thing
                      nothing would then do — the standalone transport does
                      not even carry the flag. */}
                  {mailUsesCrmPeople() &&
                  !forwarding &&
                  (mode === "reply" || mode === "replyAll") ? (
                    <label className="flex cursor-pointer items-start gap-1.5 text-sm text-stone-700">
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-stone-300 accent-teal-700 focus:ring-teal-600"
                        checked={updateCrmNotes}
                        onChange={(e) => setUpdateCrmNotes(e.target.checked)}
                      />
                      <span className="flex flex-col leading-tight">
                        <span className="text-xs font-normal">
                          {t("proposeCrmAfterSending")}
                        </span>
                        <span className="text-xs text-stone-500">
                          The AI reads the thread and this reply and proposes
                          notes, a status, a next step. You apply.
                        </span>
                      </span>
                    </label>
                  ) : null}
                  {/* The bin only bins. Escape is what asks first, and
                      what it asks with is the dialog at the foot of this
                      component — over the whole reader rather than in the
                      corner it was pointing at. */}
                  <button
                    type="button"
                    title={t(forwarding ? "discardForward" : "discardReply")}
                    aria-label={
                      t(forwarding ? "discardForward" : "discardReply")
                    }
                    className="rounded p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                    onClick={discardComposer}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </div>
            </div>
          </div>
          {/* Under the box, outside the card.
              Both open something over the whole reader — a signature to
              write, or the mail as it will land. Neither is part of writing
              the message, and in the footer row they sat among the buttons
              that are, on a row already too full to fit on a narrow pane. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <SignatureMetaControls
              account={fromAccount}
              configured={Boolean(sigSettings?.signature)}
              included={includeSignature}
              onAdd={() => {
                if (sigSettings?.signature) setIncludeSignature(true);
                else setSigDialogOpen(true);
              }}
              onEdit={() => setSigDialogOpen(true)}
              onRemove={() => setIncludeSignature(false)}
            />
            <button
              type="button"
              className="text-xs text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
              onClick={() => setShowPreview(true)}
            >
              {t("preview")}
            </button>
            {/* Asked the way round it is answered: quoting the history is
                what a reply does, so the box is ticked and unticking it is
                the choice. `chatStyle` is still the state underneath — the
                name of a reply that quotes nothing — and this is its
                opposite, which is why the two are crossed here. */}
            {!forwarding && mode === "reply" ? (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-500 hover:text-stone-800">
                {/* Drawn rather than accented. `accent-color` fills the box
                    with the colour and leaves the tick white, so teal was
                    a solid teal square on a line of quiet grey — the
                    loudest thing under the message. This is the box the
                    line is written in, with the tick in the same ink.

                    Both colours are turned over by the dark theme, which
                    rewrites bg-white and text-stone-700 for the shell — so
                    a dark box with a light tick needs nothing said here. */}
                <span className="relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    className="peer h-3.5 w-3.5 appearance-none rounded-[3px] border border-stone-300 bg-white outline-none checked:border-stone-400 focus-visible:ring-2 focus-visible:ring-teal-600/40 disabled:opacity-50"
                    checked={!chatStyle}
                    disabled={chatStyleBusy}
                    onChange={(e) => void setChatStyle(!e.target.checked)}
                  />
                  <Check
                    aria-hidden
                    className="pointer-events-none absolute h-3 w-3 text-stone-700 opacity-0 peer-checked:opacity-100"
                  />
                </span>
                {t("quoteHistory")}
              </label>
            ) : null}
            {/* The same drawn box as Quote history. This is the forward's
                version of the same question — how much of the past goes
                with the mail — so it stands where that one stands. */}
            {forwarding ? (
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 text-xs text-stone-500 hover:text-stone-800",
                  forwardWholeBusy && "opacity-60"
                )}
              >
                <span className="relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    className="peer h-3.5 w-3.5 appearance-none rounded-[3px] border border-stone-300 bg-white outline-none checked:border-stone-400 focus-visible:ring-2 focus-visible:ring-teal-600/40 disabled:opacity-50"
                    checked={forwardWhole}
                    disabled={forwardWholeBusy}
                    onChange={(e) =>
                      void setForwardWholeConversation(e.target.checked)
                    }
                  />
                  <Check
                    aria-hidden
                    className="pointer-events-none absolute h-3 w-3 text-stone-700 opacity-0 peer-checked:opacity-100"
                  />
                </span>
                {forwardWholeBusy
                  ? "Fetching the conversation…"
                  : forwardWhole && forwardConversation
                    ? `Forward the whole conversation · ${forwardConversation.length} messages`
                    : "Forward the whole conversation"}
              </label>
            ) : null}
            {/* Providers refuse a mail past their limit. Said here, while
                there are chips to prune, rather than as an error after the
                send. Base64 makes files a third bigger on the wire, which
                is why this speaks up short of the stated number. */}
            {forwarding &&
            attachTotalBytes >
              (canSendLater ? 20 : 25) * 1024 * 1024 * 0.72 ? (
              <p className="w-full text-[11px] leading-snug text-amber-700">
                {`The files together are about ${Math.round(
                  attachTotalBytes / (1024 * 1024)
                )} MB. ${
                  canSendLater ? "Outlook" : "Gmail"
                } takes about ${canSendLater ? 20 : 25} MB in one mail, so it may refuse this. Remove some files.`}
              </p>
            ) : null}
            {!forwarding && mode === "reply" && chatStyle ? (
              <p className="text-[11px] text-stone-400">
                {t("rememberedForConversation")}
              </p>
            ) : null}
          </div>
          </div>
          {showPreview ? (
            <SentPreview
              fromName={senderName}
              from={fromAccount}
              to={emailsOfRecipients(toList)}
              cc={emailsOfRecipients(ccList)}
              subject={
                forwarding
                  ? forwardSubject
                  : thread.subject.startsWith("Re:")
                    ? thread.subject
                    : `Re: ${thread.subject}`
              }
              bodyHtml={bodyToEmailHtml(reply)}
              hasBody={Boolean(replyText.trim())}
              includeSignature={Boolean(
                includeSignature && sigSettings?.signature
              )}
              zoom={zoom}
              /* The preview is the mail as it will land, so a reply that
                 quotes nothing previews with nothing quoted. This used to
                 be handled by the preview not being reachable at all with
                 the history left out. */
              /* The preview is the mail as it will land. A forwarded
                 conversation and a rebuilt tail carry their attributions
                 inside themselves, so those pass no intro line; the one
                 remaining single-message case is a reply to a picked
                 message, which still introduces itself the old way. */
              quote={
                forwarding
                  ? forwardWholeAppendix
                    ? {
                        text: forwardWholeAppendix.text,
                        html: forwardWholeAppendix.html,
                      }
                    : quotePayload
                      ? {
                          intro: `Forwarded message — from ${
                            quotePayload.fromName
                              ? `${quotePayload.fromName} <${quotePayload.fromEmail}>`
                              : quotePayload.fromEmail
                          }, ${quotePayload.date}:`,
                          text: quotePayload.text,
                          html: quotePayload.html,
                        }
                      : undefined
                  : chatStyle
                    ? undefined
                    : quoteMessageId && quotePayload
                      ? {
                          intro: `On ${quotePayload.date}, ${
                            quotePayload.fromName
                              ? `${quotePayload.fromName} <${quotePayload.fromEmail}>`
                              : quotePayload.fromEmail
                          } wrote:`,
                          text: quotePayload.text,
                          html: quotePayload.html,
                        }
                      : historyAppendix
                        ? {
                            text: historyAppendix.text,
                            html: historyAppendix.html,
                          }
                        : undefined
              }
              recipientName={recipientName}
              sending={sending}
              canSend={Boolean(
                emailsOfRecipients(toList).length &&
                  attachmentsReady &&
                  (forwarding || replyText.trim() || attachItems.length)
              )}
              sendLabel={t(forwarding ? "actionForward" : "send")}
              onSend={() => void (forwarding ? sendForward() : send())}
              onBack={() => setShowPreview(false)}
            />
          ) : null}
          </div>
          </div>
        </div>
      ) : null}
      {/* Over the whole reader, because it is a question about the whole
          draft. In the corner of the footer row it read as one more
          control among the buttons that write the message, which is the
          opposite of what a last chance should look like. */}
      {confirmDiscard ? (
        <SettingsDialog
          title={t(forwarding ? "discardForwardAsk" : "discardDraftAsk")}
          width="w-[400px]"
          bare
          onClose={() => setConfirmDiscard(false)}
          footer={
            <>
              <button
                type="button"
                className={settingsSecondaryButton}
                onClick={() => setConfirmDiscard(false)}
              >
                {t("keepDraft")}
              </button>
              {/* Focused on arrival, so Enter answers the question the way
                  it answers every other dialog — and so the keys go to the
                  dialog rather than into the draft behind it. Discarding
                  can be taken back for as long as the toast stands; the
                  half-written reply this interrupts cannot. */}
              <button
                type="button"
                autoFocus
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                onClick={() => {
                  setConfirmDiscard(false);
                  discardComposer();
                }}
              >
                {t("discard")}
              </button>
            </>
          }
        >
          <p className="text-sm text-stone-600">
            {t("unsentWillBeDeleted")}
          </p>
        </SettingsDialog>
      ) : null}
      <SignatureDialog
        open={sigDialogOpen}
        accounts={accounts}
        initialAccount={fromAccount}
        onClose={() => setSigDialogOpen(false)}
        onSaved={(savedAccount, settings) => {
          if (savedAccount === fromAccount) setSigSettings(settings);
        }}
      />
      {crmProposal ? (
        <CrmProposalDialog
          loading={crmProposal.loading}
          stage={crmProposal.stage}
          result={crmProposal.result}
          attachmentCount={readableAttachments.length}
          attachmentsIncluded={lastProposeRef.current.includeAttachments}
          onIncludeAttachments={() =>
            void updateCrmFromThread(lastProposeRef.current.hint, { includeAttachments: true })
          }
          onClose={() => setCrmProposal(null)}
          onApplied={(applied) => {
            if (applied) onCrmChanged();
          }}
        />
      ) : null}
    </div>
  );
}

/** Quiet divider when older messages live in an earlier part. */
/**
 * The day, once, over the messages that belong to it.
 *
 * Every message used to carry its own full date. With that line gone, the
 * time in the corner of a bubble says 15:06 and nothing says which 15:06 —
 * so the day is said once, where it changes, the way a chat says it.
 */
function DayHeading({ iso }: { iso: string | null }) {
  const t = useMailT();
  if (!iso) return null;
  return (
    /* The same small capitals the mail list puts over TODAY and
       YESTERDAY. Both are one day naming the things under it, and they
       were two different marks for that.

       Centred, unlike the list's: over a column of bubbles this is a
       seam across the conversation, where in a list of rows it is a
       heading at the front of them. */
    <p
      /* `first:` — the space above a day is there to part it from the day
         before it, and the one at the top of the thread has no day above
         it, only the subject. The stream's own padding is the space it
         needs. It keeps the padding whenever something does come first,
         such as the button that fetches older messages. */
      className="pb-1 pt-3 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--mail-chrome-faint)] first:pt-0"
    >
      {chatDayLabel(iso, t)}
    </p>
  );
}

function PartSeam({ onView }: { onView?: () => void }) {
  const t = useMailT();
  return (
    <div className="flex items-center gap-3 py-2" role="separator">
      <div className="h-px flex-1 bg-stone-200" />
      <p className="shrink-0 text-[11px] text-stone-400">
        {t("olderInEarlierPart")}
        {onView ? (
          <>
            {" · "}
            <button
              type="button"
              className="font-medium text-teal-700 hover:underline"
              onClick={onView}
            >
              {t("view")}
            </button>
          </>
        ) : null}
      </p>
      <div className="h-px flex-1 bg-stone-200" />
    </div>
  );
}
/** Sonner toast for CRM notes LLM results (toolbar + after-send). */
function toastCrmNotesResult(
  result: CrmNotesToastResult,
  options?: { toastId?: string | number; onApplied?: () => void }
): void {
  const toastId = options?.toastId;
  const changes = result.changes ?? [];
  const applied = changes.filter((c) => c.applied);
  const unchanged = changes.filter((c) => !c.applied);
  const context = crmNotesContextLine(result);

  if (result.skipped && !result.matched?.length && !changes.length) {
    toast.message(result.skipped, { id: toastId });
    return;
  }

  if (applied.length) {
    const changeLines = applied
      .map((c) => {
        const note =
          c.noteEntry.length > 220
            ? `${c.noteEntry.slice(0, 220)}…`
            : c.noteEntry;
        return `${c.recordName} (${crmSourceLabel(c.source)})\n→ Notes: ${note}\nWhy: ${c.rationale}`;
      })
      .join("\n\n");
    const description = [context, changeLines].filter(Boolean).join("\n\n");
    toast.success(
      applied.length === 1
        ? `Updated Notes on ${applied[0].recordName}`
        : `Updated Notes on ${applied.length} CRM records`,
      { id: toastId, description, duration: 14_000 }
    );
    options?.onApplied?.();
    return;
  }

  if (result.errors.length && !unchanged.length) {
    toast.error(result.errors[0] ?? "Couldn't update CRM notes", {
      id: toastId,
      description: context ?? undefined,
    });
    return;
  }

  const why =
    unchanged
      .map((c) => `${c.recordName}: ${c.rationale}`)
      .join("\n") ||
    result.skipped ||
    "Nothing new to add to Notes.";
  toast.message(mailSay("noCrmNoteChanges"), {
    id: toastId,
    description: [context, why].filter(Boolean).join("\n\n"),
    duration: 10_000,
  });
}
type OutboxEntry = {
  status: OutboxStatus;
  mode: ComposerMode;
  reply: string;
  toList: MailRecipient[];
  ccList: MailRecipient[];
  showCc: boolean;
  editRecipients: boolean;
  includeSignature: boolean;
  fromAccount: string;
  /** POST /api/mail/send body (minus account-specific bits filled at send time). */
  request: {
    account: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    html?: string;
    includeSignature: boolean;
    threadId?: string;
    inReplyTo?: string;
    references?: string;
    discardProviderDraft?: string;
    /** The thread's history, rebuilt by the composer. */
    appendix?: { text: string; html: string };
    noQuote?: boolean;
    messageCount?: number;
    /** After send, Grok prepends Notes on related CRM records. */
    updateCrmNotes?: boolean;
    attachments?: {
      filename: string;
      mimeType: string;
      contentBase64: string;
    }[];
    /**
     * Hold until this time (ISO 8601). Outlook only.
     *
     * A scheduled reply never reaches the outbox — nothing is in flight to
     * retry or to paint ahead of — so this is only ever set on the body that
     * goes straight out.
     */
    sendAt?: string;
  };
};
/**
 * After send, providers can take a moment to index the message into the
 * conversation. Refetch with backoff and keep any optimistic bubble until
 * a real copy shows up (see mergeNewestThreadPage).
 */
function scheduleThreadRefetchAfterSend(
  account: string,
  threadId: string,
  setThread: React.Dispatch<React.SetStateAction<MailThreadDetail | null>>
): void {
  const delaysMs = [800, 2000, 4500];
  void (async () => {
    for (const delayMs of delaysMs) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, delayMs);
      });
      try {
        const params = new URLSearchParams({ account, id: threadId });
        const json = await apiJson<{ thread: MailThreadDetail }>(
          `/api/mail/thread?${params.toString()}`
        );
        let stillHasLocal = false;
        setThread((current) => {
          if (!current) return json.thread;
          const merged = mergeNewestThreadPage(current, json.thread);
          stillHasLocal = merged.messages.some((m) =>
            isPendingLocalMessage(m.id)
          );
          return merged;
        });
        if (!stillHasLocal) return;
      } catch {
        /* keep optimistic bubble; try again */
      }
    }
  })();
}

/**
 * What stands where the reply box was, while a pop-out has the answer.
 *
 * Popping out carries the half-written reply into the other window and
 * shuts the box here, which is right — but on its own the box simply
 * vanishes and nothing says why. This is what makes the handover legible,
 * and it holds the two ways back: bring that window to the front, or bring
 * the message home.
 */
function PopoutStrip({
  onShow,
  onBringBack,
}: {
  onShow: () => void;
  onBringBack: () => void;
}) {
  const t = useMailT();
  const ref = React.useRef<HTMLDivElement>(null);

  /**
   * The box that had the focus has gone, so this takes it.
   *
   * Only when it is going spare. A reader who has since clicked somewhere
   * else keeps what they clicked on.
   */
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    el.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="flex items-center gap-1.5 border-t border-stone-200 bg-[var(--mail-thread)] px-8 py-3 text-[13px] text-stone-500 outline-none"
    >
      <PictureInPicture2 className="h-4 w-4 shrink-0" aria-hidden />
      <span>{t("answeringInPopout")}</span>
      <span aria-hidden className="text-stone-300">
        ·
      </span>
      <button
        type="button"
        className="font-semibold text-teal-700 hover:text-teal-800"
        onClick={onShow}
      >
        {t("show")}
      </button>
      <span aria-hidden className="text-stone-300">
        ·
      </span>
      <button
        type="button"
        className="font-semibold text-teal-700 hover:text-teal-800"
        onClick={onBringBack}
      >
        {t("bringBack")}
      </button>
    </div>
  );
}

/**
 * What will not fit on the action strip, behind one button.
 *
 * The four here are about looking at the thread rather than doing
 * anything to it — printing it, putting it in its own window, the text
 * size, and filling the screen with it. Nothing that changes the mail is
 * ever put away: reply, archive and the bin stay where they are at every
 * width.
 */
function ThreadToolbarOverflow({
  focusMode,
  zoom,
  onZoomAdjust,
  onPrint,
  onPopOut,
  onToggleFocus,
  printLabel,
  popOutLabel,
}: {
  focusMode: boolean;
  zoom: number;
  onZoomAdjust: (delta: number) => void;
  onPrint: () => void;
  onPopOut: () => void;
  onToggleFocus: () => void;
  printLabel: string;
  popOutLabel: string;
}) {
  const t = useMailT();
  const [open, setOpen] = React.useState(false);
  const row =
    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-stone-800 hover:bg-[var(--mail-chrome-hover)]";
  const pick = (run: () => void) => () => {
    setOpen(false);
    run();
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("more")}
          title={t("more")}
          className={THREAD_ACTION_CLASS}
        >
          <MoreHorizontal />
        </Button>
      </PopoverTrigger>
      <MailPopoverContent align="end" className="w-56 p-1">
        <button type="button" className={row} onClick={pick(onPrint)}>
          <Printer className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
          {printLabel}
        </button>
        <button type="button" className={row} onClick={pick(onPopOut)}>
          <PictureInPicture2
            className="h-4 w-4 shrink-0 text-stone-400"
            aria-hidden
          />
          {popOutLabel}
        </button>
        <button type="button" className={row} onClick={pick(onToggleFocus)}>
          {focusMode ? (
            <Minimize2 className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
          ) : (
            <Maximize2 className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
          )}
          {t(focusMode ? "showMailList" : "focusMode")}
        </button>
        {/* The size stays a pair of buttons rather than becoming two more
            rows: it is set by trying it, and a menu that shut on every
            press would be the wrong shape for that. */}
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm text-stone-800">
          {t("textSize")}
          <ZoomControls zoom={zoom} onAdjust={onZoomAdjust} />
        </div>
      </MailPopoverContent>
    </Popover>
  );
}

function ThreadAction({
  label,
  icon: Icon,
  className,
  disabled,
  onClick,
}: {
  label: string;
  icon: LucideIcon | React.ComponentType<React.SVGProps<SVGSVGElement>>;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(THREAD_ACTION_CLASS, className)}
      onClick={onClick}
    >
      <Icon />
    </Button>
  );
}

/** What the composer at the bottom of a thread is currently writing. */
type ComposerMode = "reply" | "replyAll" | "forward";
/** Merge a newest-page fetch into a thread that may already have older pages. */
function mergeNewestThreadPage(
  current: MailThreadDetail,
  newest: MailThreadDetail
): MailThreadDetail {
  const pageIds = new Set(newest.messages.map((m) => m.id));
  const pageOldestAt = Date.parse(newest.messages[0]?.sentAt ?? "");
  const older = current.messages.filter((m) => {
    if (pageIds.has(m.id)) return false;
    // Keep optimistic local-* bubbles until the provider returns a match.
    if (isPendingLocalMessage(m.id)) {
      return !optimisticCoveredBy(m, newest.messages);
    }
    const at = Date.parse(m.sentAt ?? "");
    return Number.isFinite(pageOldestAt) && Number.isFinite(at)
      ? at < pageOldestAt
      : true;
  });
  // Locals that still aren't indexed belong after the server page (newest).
  const pendingLocal = older.filter((m) => isPendingLocalMessage(m.id));
  const olderHistory = older.filter((m) => !isPendingLocalMessage(m.id));
  return {
    ...newest,
    messages: [...olderHistory, ...newest.messages, ...pendingLocal],
    hasOlder: olderHistory.length ? current.hasOlder : newest.hasOlder,
  };
}

type CrmNotesToastResult = {
  updated: string[];
  matched?: { recordName: string; source: string }[];
  messageCount?: number;
  changes?: Array<{
    recordName: string;
    source: string;
    field: string;
    noteEntry: string;
    rationale: string;
    applied: boolean;
  }>;
  skipped?: string;
  errors: string[];
};
function crmSourceLabel(source: string): string {
  return CRM_SOURCE_LABELS[source] ?? source;
}
function crmNotesContextLine(result: CrmNotesToastResult): string | null {
  const parts: string[] = [];
  if (result.messageCount != null) {
    parts.push(
      `Reviewed ${result.messageCount} message${
        result.messageCount === 1 ? "" : "s"
      }`
    );
  }
  if (result.matched?.length) {
    parts.push(
      `matched ${result.matched
        .map((m) => `${m.recordName} (${crmSourceLabel(m.source)})`)
        .join(", ")}`
    );
  }
  return parts.length ? parts.join(" · ") : null;
}

const CRM_SOURCE_LABELS: Record<string, string> = {
  clients: "Clients",
  collaborations: "Collaborations",
  facilitators: "Facilitators",
  grants: "Applications",
};
/**
 * True when a real (provider) message is the indexed copy of an optimistic
 * local-* bubble. Providers (especially Outlook) can lag on conversation
 * queries right after send — we must not drop the bubble until then.
 */
function optimisticCoveredBy(
  local: MailMessage,
  reals: MailMessage[]
): boolean {
  const localLead = optimisticBodyLead(local.bodyText);
  const localAt = Date.parse(local.sentAt ?? "") || 0;
  return reals.some((m) => {
    if (!m.own || isPendingLocalMessage(m.id)) return false;
    const at = Date.parse(m.sentAt ?? "") || 0;
    if (localAt && at && Math.abs(at - localAt) > 15 * 60 * 1000) return false;
    const lead = optimisticBodyLead(m.bodyText);
    if (!localLead) return Math.abs(at - localAt) < 2 * 60 * 1000;
    const n = Math.min(40, localLead.length, lead.length || 40);
    if (n <= 0) return Math.abs(at - localAt) < 2 * 60 * 1000;
    return (
      lead.slice(0, n) === localLead.slice(0, n) ||
      lead.includes(localLead.slice(0, Math.min(30, localLead.length))) ||
      localLead.includes(lead.slice(0, Math.min(30, lead.length)))
    );
  });
}

/** Normalize body text for matching optimistic bubbles to provider copies. */
function optimisticBodyLead(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 120).toLowerCase();
}
