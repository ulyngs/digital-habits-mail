"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  SettingsDialog,
  SettingsGroup,
  SettingsHeading,
  SettingsRow,
  SettingsToggle,
  settingsPrimaryButton,
  settingsSecondaryButton,
} from "@/components/mail/settings-ui";
import { DateField } from "@/components/ui/calendar";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { useMailT } from "@/lib/mail/i18n";
import { cn } from "@/lib/utils";
import { mailOrgAiAllowed } from "@/lib/mail/product-flavor";
import { mailApiFetch } from "@/lib/mail/api";

/** Mirror of the server's MailAutoReply (lib/mail/inbox.ts). */
export type AutoReplyDto = {
  account: string;
  provider: "gmail" | "outlook";
  enabled: boolean;
  subject: string;
  bodyHtml: string;
  restrictToContacts: boolean;
  startTime: number | null;
  endTime: number | null;
  needsReconnect: boolean;
  /** Set when this mailbox has no auto-reply to manage — say so, don't offer. */
  unavailable?: string;
};

/** True when this auto-reply is currently sending (on, and not past its last day). */
export function autoReplyActive(a: AutoReplyDto, now = Date.now()): boolean {
  return a.enabled && (a.endTime === null || a.endTime > now);
}

type FormState = {
  enabled: boolean;
  firstDay: string; // yyyy-mm-dd, "" = unset
  lastDay: string; // "" = no end date
  subject: string;
  bodyHtml: string;
  restrictToContacts: boolean;
};

/** Sets one of the two dates to today. */
function TodayButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  const t = useMailT();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded px-1 text-[11px] font-medium text-stone-500 hover:text-stone-900 hover:underline"
    >
      {t("today")}
    </button>
  );
}

function msToDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Local midnight at the start of the given yyyy-mm-dd. */
function dateInputToMs(value: string, extraDays = 0): number {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d + extraDays).getTime();
}

function toFormState(a: AutoReplyDto): FormState {
  return {
    enabled: a.enabled,
    firstDay: a.startTime !== null ? msToDateInput(a.startTime) : "",
    // Gmail's endTime is the midnight *after* the last day (exclusive).
    lastDay: a.endTime !== null ? msToDateInput(a.endTime - 1) : "",
    subject: a.subject,
    bodyHtml: a.bodyHtml,
    restrictToContacts: a.restrictToContacts,
  };
}

/**
 * The same small capitals every other settings surface uses.
 *
 * Its own spacing rather than the shared margins: these headings sit inside a
 * dialog whose sections are already spaced apart, not stacked straight onto
 * one another the way a settings panel's are.
 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <SettingsHeading className="mb-0 mt-0">{children}</SettingsHeading>;
}

export function AutoReplyDialog({
  open,
  initialAccount,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Account tab to open on (from the accounts menu links). */
  initialAccount?: string | null;
  onClose: () => void;
  /** Fired with the fresh server state after a successful save. */
  onSaved: (updated: AutoReplyDto) => void;
}) {
  const t = useMailT();
  const [items, setItems] = React.useState<AutoReplyDto[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<string | null>(null);
  const [forms, setForms] = React.useState<Record<string, FormState>>({});
  const [saving, setSaving] = React.useState(false);
  const [drafting, setDrafting] = React.useState(false);
  // Remounts the rich text editors (uncontrolled) when fresh content arrives.
  const [loadStamp, setLoadStamp] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setItems(null);
    setLoadError(null);
    setActive(initialAccount ?? null);
    (async () => {
      try {
        const res = await mailApiFetch("/api/mail/autoreply");
        const json = (await res.json()) as {
          autoReplies?: AutoReplyDto[];
          error?: string;
        };
        if (!res.ok || !json.autoReplies) {
          throw new Error(json.error || t("couldNotLoadAutoReply"));
        }
        if (cancelled) return;
        setItems(json.autoReplies);
        setForms(
          Object.fromEntries(
            json.autoReplies.map((a) => [a.account, toFormState(a)])
          )
        );
        setActive((current) => current ?? json.autoReplies?.[0]?.account ?? null);
        setLoadStamp((n) => n + 1);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error
              ? err.message
              : t("couldNotLoadAutoReply")
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialAccount]);

  const updateForm = (account: string, patch: Partial<FormState>) => {
    setForms((prev) => {
      const next = { ...prev[account], ...patch };
      // A last day before the first day is not a range anyone means. Move it
      // up to the first day rather than refuse the edit. Both dates are
      // yyyy-mm-dd, so they compare as strings. An empty last day means "no
      // end date" and must stay empty.
      if (next.firstDay && next.lastDay && next.lastDay < next.firstDay) {
        next.lastDay = next.firstDay;
      }
      return { ...prev, [account]: next };
    });
  };

  const draftForMe = async (account: string) => {
    const form = forms[account];
    if (!form) return;
    setDrafting(true);
    try {
      const res = await mailApiFetch("/api/mail/autoreply/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account,
          firstDay: form.firstDay || null,
          lastDay: form.lastDay || null,
          subject: form.subject,
          bodyHtml: form.bodyHtml,
        }),
      });
      const json = (await res.json()) as {
        draft?: { subject: string; bodyHtml: string };
        error?: string;
      };
      if (!res.ok || !json.draft) {
        throw new Error(json.error || t("couldNotDraft"));
      }
      updateForm(account, {
        subject: json.draft.subject,
        bodyHtml: json.draft.bodyHtml,
      });
      setLoadStamp((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("couldNotDraft"));
    } finally {
      setDrafting(false);
    }
  };

  const save = async (account: string) => {
    const form = forms[account];
    if (!form) return;
    const plainBody = form.bodyHtml.replace(/<[^>]*>/g, "").trim();
    if (form.enabled && !plainBody) {
      toast.error(t("writeAutoReplyFirst"));
      return;
    }
    if (form.firstDay && form.lastDay && form.lastDay < form.firstDay) {
      toast.error(t("lastDayBeforeFirst"));
      return;
    }
    setSaving(true);
    try {
      const res = await mailApiFetch("/api/mail/autoreply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account,
          enabled: form.enabled,
          subject: form.subject,
          bodyHtml: form.bodyHtml,
          restrictToContacts: form.restrictToContacts,
          startTime: form.firstDay ? dateInputToMs(form.firstDay) : null,
          // Exclusive end: midnight after the chosen last day.
          endTime: form.lastDay ? dateInputToMs(form.lastDay, 1) : null,
        }),
      });
      const json = (await res.json()) as { autoReply?: AutoReplyDto; error?: string };
      if (!res.ok || !json.autoReply) {
        throw new Error(json.error || t("couldNotSaveAutoReply"));
      }
      setItems((prev) =>
        prev?.map((a) => (a.account === account ? json.autoReply! : a)) ?? prev
      );
      onSaved(json.autoReply);
      toast.success(
        json.autoReply.enabled
          ? `Auto-reply on for ${account}`
          : `Auto-reply off for ${account}`
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("couldNotSaveAutoReply")
      );
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const activeItem = items?.find((a) => a.account === active) ?? null;
  const form = active ? forms[active] : undefined;

  return (
    <SettingsDialog
      title={t("autoReplyTitle")}
      width="w-[640px]"
      onClose={onClose}
      nav={
        items && items.length > 1 ? (
          <div className="flex items-center gap-5 border-b border-stone-200 text-sm">
            {items.map((a) => (
              <button
                key={a.account}
                type="button"
                onClick={() => setActive(a.account)}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 py-2.5 font-medium",
                  active === a.account
                    ? "border-stone-900 text-stone-900"
                    : "border-transparent text-stone-500 hover:text-stone-700"
                )}
              >
                {a.account}
                {autoReplyActive(a) ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                    title={t("autoReplyOn")}
                  />
                ) : null}
              </button>
            ))}
          </div>
        ) : null
      }
      footer={
        activeItem && !activeItem.needsReconnect && active ? (
          <>
            <button
              type="button"
              className={settingsSecondaryButton}
              onClick={onClose}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              disabled={saving}
              className={cn(settingsPrimaryButton, "inline-flex items-center")}
              onClick={() => void save(active)}
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {t("save")}
            </button>
          </>
        ) : null
      }
    >
        {items === null ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            {loadError ?? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("loadingSettings")}
              </>
            )}
          </div>
        ) : (
          <>
            {activeItem?.unavailable ? (
              <div className="py-8 text-sm text-muted-foreground">
                {activeItem.unavailable}
              </div>
            ) : activeItem?.needsReconnect ? (
              <div className="py-8 text-sm text-muted-foreground">
                {t("autoReplyNeedsReconnectBefore")}
                <strong>{activeItem.account}</strong>
                {t("autoReplyNeedsReconnectAfter")}
              </div>
            ) : form && active ? (
              <div className="space-y-4">
                <SettingsGroup>
                  <SettingsRow
                    label={t("autoReply")}
                    control={
                      <SettingsToggle
                        checked={form.enabled}
                        onChange={(next) =>
                          updateForm(active, { enabled: next })
                        }
                        label={t("autoReply")}
                      />
                    }
                  />
                </SettingsGroup>

                <div className="space-y-2">
                  <SectionLabel>{t("when")}</SectionLabel>
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-start gap-1">
                      <DateField
                        ariaLabel={t("firstDay")}
                        value={form.firstDay}
                        onChange={(key) =>
                          updateForm(active, { firstDay: key })
                        }
                      />
                      <TodayButton
                        label={t("firstDayToday")}
                        onClick={() =>
                          updateForm(active, { firstDay: msToDateInput(Date.now()) })
                        }
                      />
                    </div>
                    <span className="py-1.5 text-stone-400">→</span>
                    <div className="flex flex-col items-start gap-1">
                      <DateField
                        ariaLabel={t("lastDayOptional")}
                        placeholder={t("noEndDate")}
                        value={form.lastDay}
                        // The calendar cannot offer a day before the first one.
                        min={form.firstDay || undefined}
                        clearable
                        onChange={(key) => updateForm(active, { lastDay: key })}
                      />
                      <TodayButton
                        label={t("lastDayToday")}
                        onClick={() =>
                          updateForm(active, { lastDay: msToDateInput(Date.now()) })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <SectionLabel>{t("message")}</SectionLabel>
                    {/* Writing the message is the only part that needs an AI
                        key. Setting the out-of-office is a plain provider
                        setting, so the rest of this dialog is not gated. */}
                    {mailOrgAiAllowed() ? (
                    <button
                      type="button"
                      disabled={drafting}
                      onClick={() => void draftForMe(active)}
                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline disabled:text-stone-400 disabled:no-underline"
                    >
                      {drafting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {t("drafting")}
                        </>
                      ) : (
                        t("draftForMe")
                      )}
                    </button>
                    ) : null}
                  </div>

                  {/* No overflow-hidden: the editor's link card can poke above. */}
                  <div className="rounded-lg border border-stone-200">
                    {/* Outlook has no subject on an automatic reply: the
                        reply carries the subject of whatever it answers.
                        A box that changes nothing is worse than no box. */}
                    {activeItem?.provider === "outlook" ? null : (
                    <label className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-4 py-2.5">
                      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                        {t("subject")}
                      </span>
                      <input
                        type="text"
                        value={form.subject}
                        onChange={(e) =>
                          updateForm(active, { subject: e.target.value })
                        }
                        placeholder={t("autoReplySubjectPlaceholder")}
                        className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-stone-400"
                      />
                    </label>
                    )}
                    <RichTextEditor
                      key={`${active}-${loadStamp}`}
                      className="ooo-editor"
                      defaultValue={form.bodyHtml}
                      onChange={(html) => updateForm(active, { bodyHtml: html })}
                      placeholder={t("autoReplyBodyPlaceholder")}
                      minHeight={150}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs text-muted-foreground">
                      {t("autoReplyRate")}
                    </p>
                    <label className="flex shrink-0 items-center gap-1.5 text-xs text-stone-600">
                      <input
                        type="checkbox"
                        checked={form.restrictToContacts}
                        onChange={(e) =>
                          updateForm(active, { restrictToContacts: e.target.checked })
                        }
                      />
                      {t("onlySendToContacts")}
                    </label>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      <style>{`
        /* Fold the editor into the message card: the card supplies the border. */
        .rich-text-editor.ooo-editor .ql-toolbar {
          border: none;
          border-bottom: 1px solid #e7e5e4;
          border-radius: 0;
          background: #fff;
        }
        .rich-text-editor.ooo-editor .ql-container {
          border: none;
          border-radius: 0;
        }
        .rich-text-editor.ooo-editor .ql-editor {
          font-size: 15px;
          line-height: 1.6;
        }
      `}</style>
    </SettingsDialog>
  );
}
