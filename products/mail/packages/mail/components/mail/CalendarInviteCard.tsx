"use client";

import * as React from "react";
import { Calendar } from "lucide-react";
import { toast } from "sonner";

import {
  attachmentDownloadProps,
  attachmentUrl,
  formatFileSize,
} from "@/components/mail/MailAttachments";
import {
  formatInviteWhen,
  isCalendarAttachment,
  joinLinkLabel,
  parseCalendarInvite,
  type ParsedCalendarInvite,
} from "@/lib/mail/ics";
import type { MailAttachment } from "@/lib/mail/types";
import { isNativeShell, openCalendarInvite } from "@/lib/native-shell";
import { cn } from "@/lib/utils";
import { mailApiFetch } from "@/lib/mail/api";

function pickCalendarAttachment(
  attachments: MailAttachment[] | undefined
): MailAttachment | null {
  return attachments?.find(isCalendarAttachment) ?? null;
}

export function MessageCalendarInvite({
  account,
  messageId,
  attachments,
  onUnavailable,
}: {
  account: string;
  messageId: string;
  attachments?: MailAttachment[];
  /** Called when ICS can't be parsed — parent can show the file chip again. */
  onUnavailable?: (attachmentId: string) => void;
}) {
  const calendarAtt = pickCalendarAttachment(attachments);
  if (!calendarAtt || calendarAtt.attachmentId.startsWith("local-")) {
    return null;
  }
  return (
    <CalendarInviteCard
      account={account}
      messageId={messageId}
      attachment={calendarAtt}
      onUnavailable={onUnavailable}
    />
  );
}

/** Non-calendar attachments for the normal chip row. */
export function nonCalendarAttachments(
  attachments: MailAttachment[] | undefined,
  /** Calendar attachment ids that failed to parse — show as chips. */
  failedCalendarIds?: Set<string>
): MailAttachment[] {
  return (attachments ?? []).filter(
    (a) => !isCalendarAttachment(a) || failedCalendarIds?.has(a.attachmentId)
  );
}

/**
 * True when we can genuinely hand the invite to the OS default calendar app:
 * the Tauri shells, or local dev where the Next server runs on this machine.
 * Call client-side only (Tauri detection needs `window`).
 */
function canOpenInCalendarApp(): boolean {
  return isNativeShell() || process.env.NODE_ENV === "development";
}

async function openInviteWithDefaultCalendar(input: {
  filename: string;
  icsText: string;
}): Promise<void> {
  // Desktop shell: write a temp .ics and hand it to the OS default app.
  if (isNativeShell()) {
    await openCalendarInvite({
      filename: input.filename,
      content: input.icsText,
    });
    return;
  }

  // Local dev: the Next server runs on this machine, so it can hand the
  // file to the default calendar app directly (Chrome can't).
  const res = await mailApiFetch("/api/mail/open-ics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: input.filename,
      content: input.icsText,
    }),
  });
  if (!res.ok) throw new Error("Couldn't open calendar invite");
}

/** Plain browser: no way to launch a native app, so download a named .ics. */
function downloadInvite(input: { filename: string; icsText: string }): void {
  const blob = new Blob([input.icsText], {
    type: "text/calendar;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = input.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function CalendarInviteCard({
  account,
  messageId,
  attachment,
  onUnavailable,
}: {
  account: string;
  messageId: string;
  attachment: MailAttachment;
  onUnavailable?: (attachmentId: string) => void;
}) {
  const [invite, setInvite] = React.useState<ParsedCalendarInvite | null>(null);
  const [icsText, setIcsText] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [opening, setOpening] = React.useState(false);
  // Resolved in an effect: Tauri detection needs `window`, and reading it
  // during render would mismatch the server-rendered HTML in the shells.
  const [canOpenApp, setCanOpenApp] = React.useState(false);

  React.useEffect(() => {
    setCanOpenApp(canOpenInCalendarApp());
  }, []);

  const calendarAtt = {
    ...attachment,
    mimeType: attachment.mimeType.includes("calendar")
      ? attachment.mimeType
      : "text/calendar",
    filename: attachment.filename?.toLowerCase().endsWith(".ics")
      ? attachment.filename
      : "invite.ics",
  };
  const downloadHref = attachmentUrl({
    account,
    messageId,
    attachment: calendarAtt,
    download: true,
  });
  const inlineHref = attachmentUrl({
    account,
    messageId,
    attachment: calendarAtt,
  });

  React.useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setInvite(null);
    setIcsText(null);
    void (async () => {
      try {
        const res = await mailApiFetch(inlineHref);
        if (!res.ok) throw new Error("Couldn't load invite");
        const text = await res.text();
        const parsed = parseCalendarInvite(text);
        if (cancelled) return;
        if (!parsed) {
          setFailed(true);
          onUnavailable?.(attachment.attachmentId);
          return;
        }
        setIcsText(text);
        setInvite(parsed);
      } catch {
        if (!cancelled) {
          setFailed(true);
          onUnavailable?.(attachment.attachmentId);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inlineHref, attachment.attachmentId, onUnavailable]);

  const addToCalendar = async () => {
    if (!icsText || opening) return;
    const input = { filename: calendarAtt.filename, icsText };
    if (!canOpenApp) {
      downloadInvite(input);
      return;
    }
    setOpening(true);
    try {
      await openInviteWithDefaultCalendar(input);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't open calendar invite"
      );
    } finally {
      setOpening(false);
    }
  };

  if (failed) return null;
  if (!invite) {
    return (
      <div
        className="mb-1 flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-2.5"
        aria-hidden
      >
        <Calendar className="h-4 w-4 shrink-0 text-stone-300" />
        <div className="h-4 flex-1 max-w-[14rem] rounded bg-stone-100" />
      </div>
    );
  }

  const when = formatInviteWhen(invite);
  const detailBits = [invite.summary, invite.location].filter(Boolean);

  return (
    <div className="mb-1 rounded-xl border border-stone-200 px-3 py-2.5">
      <div className="flex items-start gap-3">
        <Calendar
          className="mt-0.5 h-4 w-4 shrink-0 stroke-[1.5] text-teal-700/90"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900">{when}</p>
          {detailBits.length || invite.joinUrl ? (
            <p className="mt-0.5 truncate text-xs text-stone-500">
              {detailBits.join(" · ")}
              {invite.joinUrl ? (
                <>
                  {detailBits.length ? " · " : null}
                  <a
                    href={invite.joinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-teal-700 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {joinLinkLabel(invite.joinUrl)}
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <button
            type="button"
            disabled={opening || !icsText}
            className={cn(
              "inline-flex h-8 items-center rounded-lg border border-teal-700/70 bg-white px-2.5",
              "text-xs font-semibold text-teal-800 hover:bg-teal-50",
              "disabled:opacity-50"
            )}
            onClick={(e) => {
              e.stopPropagation();
              void addToCalendar();
            }}
          >
            {opening
              ? "Opening…"
              : canOpenApp
                ? "Add to Calendar"
                : "Download event"}
          </button>
          <p className="mt-1 text-[10px] leading-tight text-stone-400">
            {canOpenApp ? "Opens in your calendar app" : "Saves a .ics file"}
          </p>
        </div>
      </div>
      <p className="mt-1 pl-7 text-[11px] leading-tight text-stone-400">
        <a
          {...attachmentDownloadProps({
            path: downloadHref,
            filename: calendarAtt.filename,
          })}
          className="hover:text-stone-600 hover:underline"
        >
          {calendarAtt.filename}
          {attachment.size > 0 ? ` · ${formatFileSize(attachment.size)}` : ""}
        </a>
      </p>
    </div>
  );
}
