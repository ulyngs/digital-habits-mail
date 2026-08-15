"use client";

/**
 * Writing a new message.
 *
 * A thread has its own reply box inside ThreadPane; this is the one that starts
 * something, so it owns the recipient fields and the subject as well as the
 * body. What the message will look like once sent is shown by
 * `composer-preview`, which the reply box shows too.
 */

import * as React from "react";
import { formatShortcut, shortcutMatchesEvent } from "@/lib/mail/shortcuts";
import { useMailShortcuts } from "@/lib/mail/use-mail-shortcuts";
import {
  ChevronDown,
  Maximize2,
  Minimize2,
  SendHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  ComposerSignature,
  SentPreview,
  SignatureMetaControls,
} from "@/components/mail/composer-preview";
import {
  AttachmentSizeSummary,
  AttachToolbarButton,
  ComposerDropOverlay,
  DraftAttachmentChips,
  useComposerFileDrop,
  useComposerPaste,
  useDraftAttachments,
} from "@/components/mail/MailAttachments";
import { FromAccountMenu } from "@/components/mail/FromAccountMenu";
import { RecipientField } from "@/components/mail/RecipientField";
import { SendLaterMenu } from "@/components/mail/SendLaterMenu";
import { sendWithUndo } from "@/components/mail/undo-send";
import { useCanSendLater } from "@/lib/mail/use-outlook-accounts";
import { formatSnoozeWakeLabel } from "@/components/mail/SnoozeMenu";
import {
  fetchSignatureSettings,
  SignatureDialog,
  type SignatureSettings,
} from "@/components/mail/SignatureDialog";
import {
  isInteractiveDoubleClickTarget,
  usePinchZoom,
} from "@/components/mail/use-mail-layout";
import { ZoomControls } from "@/components/mail/ZoomControls";
import { EmojiPickerButton } from "@/components/ui/EmojiPicker";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/ui/RichTextEditor";
import { Button } from "@/components/ui/button";
import { bodyToEmailHtml, htmlToPlainText } from "@/lib/client-email-html";
import { mailApiJson as apiJson } from "@/lib/mail/api";
import {
  emailsOfRecipients,
  flattenRecipientsForSend,
  recipientsFromEmails,
  type MailRecipient,
} from "@/lib/mail/contact-list-types";
import {
  COMPOSE_DRAFT_KEY,
  newComposeDraftKey,
  deleteDraft,
  getDraft,
  readyAttachmentsForDraft,
  saveComposeDraft,
  type ComposeMailDraft,
} from "@/lib/mail/local-drafts";
import { cn } from "@/lib/utils";

export function ComposeView({
  accounts,
  zoom,
  onZoomAdjust,
  focusMode,
  onToggleFocus,
  onClose,
  onSent,
  onUndoSend,
  seed,
}: {
  accounts: string[];
  zoom: number;
  onZoomAdjust: (delta: number) => void;
  focusMode: boolean;
  onToggleFocus: () => void;
  onClose: () => void;
  /** Refresh Sent for the From mailbox after a successful send. */
  onSent?: (accountEmail: string) => void;
  /**
   * The reader took the send back inside the count.
   *
   * Open the composer again on the draft named here. It was deliberately
   * left alone by the send, so it still holds what they had written.
   */
  onUndoSend?: (draftKey: string) => void;
  seed?: {
    to: string[];
    subject: string;
    continuedFromLabel: string;
    /** Continue this stored draft rather than starting a new one. */
    draftKey?: string;
  } | null;
}) {
  const [from, setFrom] = React.useState(accounts[0] ?? "");
  const canSendLater = useCanSendLater(from);
  const [chatStyle, setChatStyle] = React.useState(false);
  const [toList, setToList] = React.useState<MailRecipient[]>(() =>
    seed?.to?.length ? recipientsFromEmails(seed.to) : []
  );
  const [ccList, setCcList] = React.useState<MailRecipient[]>([]);
  const [bccList, setBccList] = React.useState<MailRecipient[]>([]);
  const [showCc, setShowCc] = React.useState(false);
  const [showBcc, setShowBcc] = React.useState(false);
  const [subject, setSubject] = React.useState(seed?.subject ?? "");
  const [body, setBody] = React.useState("");
  const [editorKey, setEditorKey] = React.useState(0);
  const [includeSignature, setIncludeSignature] = React.useState(true);
  const [showPreview, setShowPreview] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [sigSettings, setSigSettings] = React.useState<SignatureSettings | null>(
    null
  );
  const [sigDialogOpen, setSigDialogOpen] = React.useState(false);
  /**
   * This composer's own draft key, fixed for its lifetime.
   *
   * A composer opened to continue a draft is handed that draft's key. Any
   * other composer makes a new one, so two unsent messages can exist at once
   * — they used to share a single key and the second wrote over the first.
   */
  const draftKeyRef = React.useRef<string>(
    seed?.draftKey ?? newComposeDraftKey()
  );
  const editorHandle = React.useRef<RichTextEditorHandle | null>(null);
  const composeRef = React.useRef<HTMLDivElement>(null);
  const {
    items: attachItems,
    totalBytes: attachTotalBytes,
    ready: attachmentsReady,
    addFiles: addAttachFiles,
    remove: removeAttach,
    replaceAll: replaceAttachments,
    payload: attachmentPayload,
  } = useDraftAttachments();
  const { dragging: attachDragging, dropHandlers: attachDropHandlers } =
    useComposerFileDrop(addAttachFiles);
  const { pasteHandlers: attachPasteHandlers } =
    useComposerPaste(addAttachFiles);
  usePinchZoom(composeRef, onZoomAdjust, true);

  // Follow the sending account's "include on new messages" preference until
  // the user adds/removes the signature themselves.
  const sigTouchedRef = React.useRef(false);

  const draftReadyRef = React.useRef(false);
  const draftDiscardedRef = React.useRef(false);
  const draftSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const composeSnapshotRef = React.useRef({
    from,
    chatStyle,
    toList,
    ccList,
    bccList,
    showCc,
    showBcc,
    subject,
    body,
    includeSignature,
    attachItems,
  });
  composeSnapshotRef.current = {
    from,
    chatStyle,
    toList,
    ccList,
    bccList,
    showCc,
    showBcc,
    subject,
    body,
    includeSignature,
    attachItems,
  };

  const persistComposeDraft = React.useCallback(
    (snapshot = composeSnapshotRef.current) => {
      if (draftDiscardedRef.current) return;
      const draft: ComposeMailDraft = {
        key: draftKeyRef.current,
        kind: "compose",
        from: snapshot.from,
        subject: snapshot.subject,
        body: snapshot.body,
        toList: snapshot.toList,
        ccList: snapshot.ccList,
        bccList: snapshot.bccList,
        showCc: snapshot.showCc,
        showBcc: snapshot.showBcc,
        includeSignature: snapshot.includeSignature,
        chatStyle: snapshot.chatStyle,
        attachments: readyAttachmentsForDraft(snapshot.attachItems),
        updatedAt: Date.now(),
      };
      void saveComposeDraft(draft);
    },
    []
  );

  const discardCompose = React.useCallback(() => {
    draftDiscardedRef.current = true;
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    void deleteDraft(draftKeyRef.current);
    onClose();
  }, [onClose]);

  /**
   * Load the one new-message draft, or stand off it.
   *
   * There is a single slot. A composer opened with a seed is a different
   * message from whatever is in it, so it neither loads it nor writes over it
   * — it used to do the second, which threw away a half-written email every
   * time an address was clicked in a message.
   */
  React.useEffect(() => {
    let cancelled = false;
    draftReadyRef.current = false;
    draftDiscardedRef.current = false;
    // A seeded composer starts from its seed, not from anything stored. The
    // one exception is a seed that names a draft to continue.
    if (seed && !seed.draftKey) {
      draftReadyRef.current = true;
      return () => {
        cancelled = true;
        if (draftSaveTimerRef.current) {
          clearTimeout(draftSaveTimerRef.current);
          draftSaveTimerRef.current = null;
        }
        if (draftReadyRef.current && !draftDiscardedRef.current) {
          persistComposeDraft();
        }
      };
    }
    // No seed: pick up the draft written before keys existed, so nothing in
    // flight is stranded by this change.
    const loadKey = seed?.draftKey ?? COMPOSE_DRAFT_KEY;
    void getDraft(loadKey).then((raw) => {
      if (cancelled) return;
      if (raw?.kind === "compose") {
        // Write back to where it came from. Saving a loaded draft under a
        // fresh key would leave the original behind and make two of it.
        draftKeyRef.current = loadKey;
        setFrom(raw.from || accounts[0] || "");
        setChatStyle(raw.chatStyle);
        setToList(raw.toList);
        setCcList(raw.ccList);
        setBccList(raw.bccList);
        setShowCc(raw.showCc);
        setShowBcc(raw.showBcc);
        setSubject(raw.subject);
        setBody(raw.body);
        setIncludeSignature(raw.includeSignature);
        replaceAttachments(raw.attachments);
        setEditorKey((k) => k + 1);
        sigTouchedRef.current = true;
      }
      draftReadyRef.current = true;
    });
    return () => {
      cancelled = true;
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      if (draftReadyRef.current && !draftDiscardedRef.current) {
        persistComposeDraft();
      }
    };
    // Mount-only hydrate for this compose session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!draftReadyRef.current || draftDiscardedRef.current) return;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      draftSaveTimerRef.current = null;
      persistComposeDraft();
    }, 400);
    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [
    from,
    chatStyle,
    toList,
    ccList,
    bccList,
    showCc,
    showBcc,
    subject,
    body,
    includeSignature,
    attachItems,
    persistComposeDraft,
  ]);

  React.useEffect(() => {
    let cancelled = false;
    void fetchSignatureSettings(from)
      .then((s) => {
        if (cancelled) return;
        setSigSettings(s);
        if (!sigTouchedRef.current && !chatStyle) {
          setIncludeSignature(s.includeOnNew);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [from, chatStyle]);

  const bodyText = htmlToPlainText(body);
  const flatTo = flattenRecipientsForSend(toList);
  const flatCc = flattenRecipientsForSend(ccList);
  const flatBcc = emailsOfRecipients(bccList);
  /**
   * Enough of a message to send.
   *
   * A subject counts. Plenty of real mail is a single line in the subject and
   * nothing under it — "Running ten minutes late", "Approved" — and refusing
   * to send one means retyping it into the body to satisfy us.
   */
  const canSend =
    Boolean(
      from &&
        flatTo.emails.length &&
        (bodyText.trim() || subject.trim() || attachItems.length) &&
        attachmentsReady
    ) && !sending;

  const shortcuts = useMailShortcuts();

  const send = async (sendAt?: string) => {
    if (!canSend) return;
    if (!attachmentsReady) {
      toast.error("Still preparing attachments…");
      return;
    }
    const attachments = attachmentPayload();
    const bcc = [
      ...flatBcc,
      ...flatTo.bccEmails,
      ...flatCc.bccEmails,
    ];
    const payload = JSON.stringify({
      account: from,
      to: flatTo.emails,
      cc: flatCc.emails.length ? flatCc.emails : undefined,
      bcc: bcc.length ? [...new Set(bcc)] : undefined,
      subject: subject.trim(),
      body: bodyText,
      html: bodyText.trim() ? bodyToEmailHtml(body) : undefined,
      includeSignature: chatStyle ? false : includeSignature,
      startChat: chatStyle || undefined,
      noQuote: chatStyle || undefined,
      attachments: attachments.length ? attachments : undefined,
      sendAt,
    });

    /**
     * The message going out, once nobody has taken it back.
     *
     * Runs after this composer has closed, and after it has unmounted, so it
     * holds everything it needs. The draft is only dropped here: until the
     * mail is away it is what the reader gets back.
     */
    const deliver = async () => {
      try {
        await apiJson("/api/mail/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
        toast.success(
          sendAt ? `Sends ${formatSnoozeWakeLabel(sendAt)}` : "Sent"
        );
        onSent?.(from);
        // The key this composer writes under, which is not the shared one:
        // deleting that instead left the real draft behind after every send.
        void deleteDraft(draftKeyRef.current);
      } catch (err) {
        /* Retry re-runs this same closure: the payload was captured whole
           when Send was pressed, so it needs nothing from the composer,
           which closed before the count ran out. The draft is still there
           until a send succeeds, so nothing is lost either way. */
        const firstTo = flatTo.emails[0] ?? "the recipient";
        toast.error(`Your message to ${firstTo} did not send`, {
          description: err instanceof Error ? err.message : undefined,
          duration: 15_000,
          action: { label: "Retry", onClick: () => void deliver() },
        });
      }
    };

    // A time was picked: the provider does the waiting, and there is nothing
    // for a countdown to hold back.
    if (sendAt) {
      setSending(true);
      try {
        await deliver();
        draftDiscardedRef.current = true;
        if (draftSaveTimerRef.current) {
          clearTimeout(draftSaveTimerRef.current);
          draftSaveTimerRef.current = null;
        }
        onClose();
      } finally {
        setSending(false);
      }
      return;
    }

    // The composer is finished with either way, so it closes now. The draft
    // stays until `deliver` runs, which is what Undo comes back to.
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    onClose();
    sendWithUndo({
      onSend: () => void deliver(),
      // With the key, because a composer opened with nothing looks for the
      // shared draft and this one was written under its own.
      onUndo: () => onUndoSend?.(draftKeyRef.current),
    });
  };

  /**
   * Send from inside the message being written.
   *
   * The thread's other shortcuts stand down whenever the focus is in a field,
   * so a reply can contain the letter R. This one has to work from exactly
   * there, so the composer listens for it itself. `send` guards its own
   * preconditions, so a press with nothing to send does nothing.
   */
  const sendShortcutRef = React.useRef(send);
  sendShortcutRef.current = send;
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!shortcutMatchesEvent(event, shortcuts.send)) return;
      event.preventDefault();
      void sendShortcutRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts]);

  /* px-4 and a narrower label column: "From" and "To" are four letters and
     two, and sixty-four pixels of nothing after them pushed every address
     into the middle of the window. */
  const rowClass =
    "flex shrink-0 items-start gap-2 border-b border-stone-200 px-4 py-2.5";
  const labelClass = "w-10 shrink-0 pt-0.5 text-[15px] text-stone-500";
  /** Where Tab goes from To: the next thing to fill in, not the Cc button. */
  const ccInputRef = React.useRef<HTMLInputElement | null>(null);
  const subjectInputRef = React.useRef<HTMLInputElement | null>(null);

  /**
   * Tab out of the last recipient field lands in the message.
   *
   * It used to land in the Subject row, which was the next thing down the
   * card. The subject is the heading now and sits above From, so sending
   * Tab to it would walk back up the card past everything already filled
   * in. Quill has no focus on its handle, so the editor is found the way
   * the thread composer finds it.
   */
  const focusBody = React.useCallback(() => {
    composeRef.current?.querySelector<HTMLElement>(".ql-editor")?.focus();
  }, []);

  const fromSelectRef = React.useRef<HTMLButtonElement | null>(null);
  const toInputRef = React.useRef<HTMLInputElement | null>(null);

  /**
   * Tab out of the subject goes on down the card.
   *
   * The heading shares its row with the focus-mode button, so that button
   * is the next thing in the document and Tab landed on it — a control
   * that rearranges the window, in the middle of filling one in. The next
   * thing to fill in is From, or To when there is only one account to send
   * from and no From to land on.
   */
  const onSubjectKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Tab" || event.shiftKey) return;
    const next = fromSelectRef.current ?? toInputRef.current;
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  const cardShellRef = React.useRef<HTMLDivElement>(null);
  const [cardW, setCardW] = React.useState(720);
  const [cardH, setCardH] = React.useState<number | null>(null);

  /** Drag the card's right / bottom / corner edges to resize. */
  const startCardResize = React.useCallback(
    (edge: "e" | "s" | "se") => (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const shell = cardShellRef.current;
      if (!shell) return;
      // Screen deltas ÷ zoom → pre-zoom layout sizes. Width uses ×2 because
      // the card is centered (mx-auto): each side moves half the width change.
      const z = zoom || 1;
      const startX = event.clientX;
      const startY = event.clientY;
      const startW = cardW;
      const startH =
        cardH ?? shell.getBoundingClientRect().height / z;
      const minW = 480;
      const minH = 360;
      const maxW = Math.max(
        minW,
        ((composeRef.current?.clientWidth ?? window.innerWidth) - 48) / z
      );
      const maxH = Math.max(
        minH,
        ((composeRef.current?.clientHeight ?? window.innerHeight) - 48) / z
      );

      document.body.style.cursor =
        edge === "e" ? "ew-resize" : edge === "s" ? "ns-resize" : "nwse-resize";
      document.body.style.userSelect = "none";

      const onMove = (e: PointerEvent) => {
        if (edge === "e" || edge === "se") {
          setCardW(
            Math.min(
              maxW,
              Math.max(minW, startW + (2 * (e.clientX - startX)) / z)
            )
          );
        }
        if (edge === "s" || edge === "se") {
          setCardH(
            Math.min(
              maxH,
              Math.max(minH, startH + (e.clientY - startY) / z)
            )
          );
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [zoom, cardW, cardH]
  );

  return (
    <div
      ref={composeRef}
      className="mail-thread-surface relative min-h-0 flex-1 overflow-y-auto bg-[var(--mail-thread)]"
    >
      <div className="absolute right-6 top-5 z-10">
        <ZoomControls zoom={zoom} onAdjust={onZoomAdjust} />
      </div>
      <div className="px-8 py-8">
        {/* Hidden (not unmounted) during preview so the draft is kept. */}
        <div className={showPreview ? "hidden" : undefined}>
          <div
            ref={cardShellRef}
            className={cn(
              // The card is app chrome and goes dark with the rest of it.
              // Only the sheet you write on stays white — see the body
              // below. The whole card used to be the light island, which
              // on the dark theme put a white page the size of the window
              // in front of somebody who had asked for no white pages.
              "mail-composer-card relative mx-auto flex min-h-0 flex-col rounded-xl border border-stone-200 bg-white shadow-sm",
              cardH != null && "overflow-hidden"
            )}
            style={{
              width: cardW,
              height: cardH ?? undefined,
              maxWidth: "100%",
              zoom,
            }}
            {...attachDropHandlers}
            {...attachPasteHandlers}
          >
            <ComposerDropOverlay visible={attachDragging} />
            <div
              className="flex shrink-0 items-center gap-3 border-b border-stone-200 px-5 py-3.5"
              onDoubleClick={(e) => {
                if (isInteractiveDoubleClickTarget(e.target)) return;
                onToggleFocus();
              }}
            >
              {/* The heading is the subject. Not a heading *and* a Subject
                  row lower down: that was one line of text written into a
                  small box and then echoed in large type above it, and the
                  echo was the part that looked like the real thing.
                  The subject is the one line the other person triages by,
                  so it gets the size — and typing it is typing here. */}
              <input
                ref={subjectInputRef}
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                aria-label="Subject"
                onKeyDown={onSubjectKeyDown}
                className={cn(
                  "min-w-0 flex-1 bg-transparent font-serif text-2xl font-bold text-stone-900 outline-none",
                  // Grey until there are words, which is the placeholder
                  // saying what the line is for rather than a title saying
                  // the message has one.
                  "placeholder:font-bold placeholder:text-stone-400",
                  // A rule only under the pointer or the caret. Always drawn,
                  // it would make the top of the card look like another form
                  // row, which is the thing this replaced.
                  "border-b border-dashed border-transparent hover:border-stone-300 focus:border-stone-300"
                )}
              />
              <button
                type="button"
                title={focusMode ? "Show mail list" : "Focus mode"}
                aria-label={focusMode ? "Show mail list" : "Focus mode"}
                aria-pressed={focusMode}
                className="shrink-0 rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                onClick={onToggleFocus}
              >
                {focusMode ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
            </div>

            <div className={rowClass}>
              <span className={labelClass}>From</span>
              {accounts.length > 1 ? (
                <FromAccountMenu
                  ref={fromSelectRef}
                  variant="row"
                  value={from}
                  accounts={accounts}
                  onChange={setFrom}
                  label="From"
                />
              ) : (
                <span className="text-stone-800">{from}</span>
              )}
            </div>

            <div className={rowClass}>
              <span className={labelClass}>To</span>
              <RecipientField
                inputRef={toInputRef}
                label="To"
                variant="inline"
                values={toList}
                onChange={setToList}
                allowSaveList
                // A long list folds down to this while nobody is editing it,
                // so the message keeps the window rather than the addresses.
                collapseAfter={6}
                ownAccounts={accounts}
                placeholder="Start typing a name or list…"
                onTabOut={() =>
                  showCc ? ccInputRef.current?.focus() : focusBody()
                }
                actions={
                  <span className="flex items-center gap-2.5 text-[15px] text-stone-500">
                    {!showCc ? (
                      <button
                        type="button"
                        className="underline-offset-2 hover:text-stone-800 hover:underline"
                        onClick={() => setShowCc(true)}
                      >
                        Cc
                      </button>
                    ) : null}
                    {!showBcc ? (
                      <button
                        type="button"
                        className="underline-offset-2 hover:text-stone-800 hover:underline"
                        onClick={() => setShowBcc(true)}
                      >
                        Bcc
                      </button>
                    ) : null}
                  </span>
                }
              />
            </div>
            {showCc ? (
              <div className={rowClass}>
                <span className={labelClass}>Cc</span>
                <RecipientField
                  inputRef={ccInputRef}
                  label="Cc"
                  variant="inline"
                  values={ccList}
                  onChange={setCcList}
                  collapseAfter={6}
                  ownAccounts={accounts}
                  placeholder="Optional"
                />
              </div>
            ) : null}
            {showBcc ? (
              <div className={rowClass}>
                <span className={labelClass}>Bcc</span>
                <RecipientField
                  label="Bcc"
                  variant="inline"
                  values={bccList}
                  onChange={setBccList}
                  collapseAfter={6}
                  ownAccounts={accounts}
                  placeholder="Optional"
                />
              </div>
            ) : null}
            {/* Where the words go. No light island: a message is shown in
                the thread on a dark bubble now, so writing it on a white one
                would be the odd half of the pair. */}
            <div
              className={cn(
                "min-h-0",
                cardH != null ? "flex flex-1 flex-col overflow-y-auto" : undefined
              )}
            >
              <RichTextEditor
                key={editorKey}
                className="mail-compose-editor"
                toolbarId="mail-compose-toolbar"
                handleRef={editorHandle}
                defaultValue={body}
                onChange={setBody}
                placeholder="Write your message…"
                /* Enough to write in, not so much that the signature sits a
                   screen below the first line. The box grows with the words,
                   and the panel scrolls once it outgrows the window. */
                minHeight={120}
              />
              {includeSignature &&
              !chatStyle &&
              sigSettings?.signature ? (
                <ComposerSignature signature={sigSettings.signature} />
              ) : null}
              <DraftAttachmentChips
                items={attachItems}
                onRemove={removeAttach}
              />
            </div>

            <div className="flex shrink-0 flex-col gap-1.5 border-t border-stone-200 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                {/* One control: Send, and a section that says when. */}
                <div className="inline-flex items-stretch overflow-hidden rounded-lg">
                  <Button
                    type="button"
                    className={cn(
                      "h-9 rounded-none bg-teal-600 text-[15px] font-semibold text-white hover:bg-teal-700",
                      // The chevron beside it is already a right-hand edge,
                      // so the word does not need its full margin to one.
                      // Tighter on the left for the arrow, which ends
                      // nearer its own edge than a letter would.
                      canSendLater ? "pl-4 pr-3.5" : "pl-4 pr-5"
                    )}
                    /* Named with its key, the way the thread's own actions
                       are. The button says Send; the tooltip says there is
                       a way to do it without reaching for the button. */
                    title={`Send (${formatShortcut(shortcuts.send)})`}
                    disabled={!canSend}
                    onClick={() => void send()}
                  >
                    {/* Before the word, pointing the way out. Under the
                        16px the button gives its icons — see the reply
                        box, which explains the `!`. */}
                    <SendHorizontal aria-hidden className="!size-3.5" />
                    {sending ? "Sending…" : "Send"}
                  </Button>
                  {canSendLater ? (
                    <SendLaterMenu
                      onPick={(iso) => void send(iso)}
                      trigger={
                        <button
                          type="button"
                          aria-label="Send later"
                          title="Send later"
                          disabled={!canSend}
                          className="flex h-9 items-center border-l border-white/25 bg-teal-600 px-2.5 text-white hover:bg-teal-700 disabled:opacity-50"
                        >
                          <ChevronDown className="h-4 w-4" aria-hidden />
                        </button>
                      }
                    />
                  ) : null}
                </div>
                <div id="mail-compose-toolbar">
                  <span className="ql-formats">
                    <button className="ql-bold" aria-label="Bold" />
                    <button className="ql-italic" aria-label="Italic" />
                    <button className="ql-underline" aria-label="Underline" />
                    <button
                      className="ql-list"
                      value="bullet"
                      aria-label="Bullet list"
                    />
                    <button
                      className="ql-list"
                      value="ordered"
                      aria-label="Numbered list"
                    />
                    <button className="ql-link" aria-label="Link" />
                  </span>
                </div>
                <AttachToolbarButton
                  onPick={addAttachFiles}
                  disabled={sending}
                />
                <EmojiPickerButton
                  onPick={(emoji) => editorHandle.current?.insertText(emoji)}
                />
                <AttachmentSizeSummary
                  count={attachItems.length}
                  totalBytes={attachTotalBytes}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {!chatStyle ? (
                  <SignatureMetaControls
                    account={from}
                    configured={Boolean(sigSettings?.signature)}
                    included={includeSignature}
                    className="text-[15px] text-stone-500"
                    onAdd={() => {
                      sigTouchedRef.current = true;
                      if (sigSettings?.signature) setIncludeSignature(true);
                      else setSigDialogOpen(true);
                    }}
                    onEdit={() => setSigDialogOpen(true)}
                    onRemove={() => {
                      sigTouchedRef.current = true;
                      setIncludeSignature(false);
                    }}
                  />
                ) : null}
                {!chatStyle ? (
                  <button
                    type="button"
                    className="text-[15px] text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
                    onClick={() => setShowPreview(true)}
                  >
                    Preview
                  </button>
                ) : null}
                <span className="ml-auto flex items-start gap-3">
                  <label className="flex cursor-pointer items-start gap-1.5 text-sm text-stone-700">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-stone-300 accent-teal-700 focus:ring-teal-600"
                      checked={chatStyle}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setChatStyle(on);
                        if (on) {
                          sigTouchedRef.current = true;
                          setIncludeSignature(false);
                        }
                      }}
                    />
                    <span className="flex flex-col leading-tight">
                      <span className="text-xs font-normal">Chat style</span>
                      <span className="text-xs text-stone-500">
                        does not quote history
                      </span>
                    </span>
                  </label>
                  <button
                    type="button"
                    title="Discard"
                    aria-label="Discard"
                    className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                    onClick={discardCompose}
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </span>
              </div>
            </div>

          {/* Edge / corner handles for resizing the card. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize width"
            title="Drag to resize width"
            onPointerDown={startCardResize("e")}
            className="absolute -right-1 top-3 bottom-3 z-10 w-2 cursor-ew-resize touch-none rounded-full hover:bg-stone-300/50"
          />
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize height"
            title="Drag to resize height"
            onPointerDown={startCardResize("s")}
            className="absolute -bottom-1 left-3 right-3 z-10 h-2 cursor-ns-resize touch-none rounded-full hover:bg-stone-300/50"
          />
          <div
            role="separator"
            aria-label="Resize width and height"
            title="Drag to resize"
            onPointerDown={startCardResize("se")}
            className="absolute bottom-0 right-0 z-10 h-4 w-4 cursor-nwse-resize touch-none"
          />
          </div>
        </div>

        {showPreview ? (
          <SentPreview
            from={from}
            to={flatTo.emails}
            cc={flatCc.emails}
            subject={subject.trim()}
            bodyHtml={bodyToEmailHtml(body)}
            hasBody={Boolean(bodyText.trim())}
            includeSignature={Boolean(
              includeSignature && sigSettings?.signature
            )}
            zoom={zoom}
            recipientName={
              toList[0]?.kind === "list"
                ? toList[0].name
                : toList[0]?.kind === "email"
                  ? toList[0].name || toList[0].email
                  : "the recipient"
            }
            sending={sending}
            canSend={canSend}
            onSend={() => void send()}
            onBack={() => setShowPreview(false)}
          />
        ) : null}

        <SignatureDialog
          open={sigDialogOpen}
          accounts={accounts}
          initialAccount={from}
          onClose={() => setSigDialogOpen(false)}
          onSaved={(savedAccount, settings) => {
            if (savedAccount === from) setSigSettings(settings);
          }}
        />
      </div>
    </div>
  );
}
