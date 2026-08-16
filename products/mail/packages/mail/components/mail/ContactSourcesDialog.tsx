"use client";

import * as React from "react";
import { ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  SettingsDialog,
  SettingsGroup,
  SettingsRow,
} from "@/components/mail/settings-ui";
import { Button } from "@/components/ui/button";
import { useMailT, type MailT } from "@/lib/mail/i18n";
import { mailUsesCrmPeople } from "@/lib/mail/product-flavor";
import { mailConnectHref } from "@/lib/mail/connect-mailbox";
import { useMailConnect } from "@/components/mail/use-mail-connect";
import type { MailConnectProvider } from "@/lib/mail/host/contracts";
import { cn } from "@/lib/utils";
import { mailApiJson as apiJson } from "@/lib/mail/api";
import {
  macContactsAuthorization,
  macContactsRequestAccess,
  openContactsPrivacySettings,
} from "@/lib/native-shell";
import { stopAskingForMacContacts } from "@/lib/mail/mac-contacts-ask";

export const OPEN_CONTACT_SOURCES_EVENT = "redd-mail-open-contact-sources";
export const CONTACTS_CHANGED_EVENT = "redd-mail-contacts-changed";

export function openContactSourcesDialog(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_CONTACT_SOURCES_EVENT));
}

function notifyContactsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CONTACTS_CHANGED_EVENT));
}

type SourceStatus = {
  key: string;
  kind: "crm" | "google" | "outlook" | "history" | "mac";
  account: string;
  count: number;
  syncedAt: string | null;
  lastError: string | null;
  enabled: boolean;
  /** Wanted, but the operating system has not allowed it yet. */
  needsAccess?: "ask" | "settings" | null;
};


function sourceTitle(source: SourceStatus, t: MailT): string {
  // A CRM source only exists on a build with a CRM (see contact-sources),
  // so this is a second lock on a door that is already shut. It is here
  // because the name of the team layer must never reach a public build by
  // accident, and "already unreachable" is how the last one got out.
  if (source.kind === "crm") {
    return t(mailUsesCrmPeople() ? "sourceCrmContacts" : "sourceContacts");
  }
  if (source.kind === "history") return t("sourceMailHistory");
  if (source.kind === "google") return t("sourceGoogleContacts");
  if (source.kind === "mac") return t("sourceMacContacts");
  return t("sourceOutlookContacts");
}

function formatCount(n: number): string {
  return n.toLocaleString();
}

function relativeSyncedAt(iso: string | null, t: MailT): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 1) return t("syncedJustNow");
  if (mins < 60) return t("syncedMinutesAgo", { count: mins });
  const hours = Math.round(mins / 60);
  if (hours < 48) return t("syncedHoursAgo", { count: hours });
  const days = Math.round(hours / 24);
  return t("syncedDaysAgo", { count: days });
}

function editLink(
  source: SourceStatus,
  t: MailT
): { href: string; label: string } | null {
  if (source.kind === "crm") {
    // /clients is a planner page. A public build has no such route, so the
    // link would go nowhere even if the source somehow existed.
    if (!mailUsesCrmPeople()) return null;
    return { href: "/clients", label: t("editInCrm") };
  }
  if (source.kind === "google") {
    return {
      href: "https://contacts.google.com/",
      label: t("editAtGoogle"),
    };
  }
  if (source.kind === "outlook") {
    return {
      href: "https://outlook.live.com/people/",
      label: t("editAtOutlook"),
    };
  }
  return null;
}

/**
 * Which mailbox this source needs signing in to again, or null.
 *
 * A contact source is a mailbox seen from another angle, so reconnecting it is
 * the same act as reconnecting the mailbox. It goes through the same seam, and
 * so does the same thing on every host.
 */
function reconnectTarget(
  source: SourceStatus
): { provider: MailConnectProvider; email: string } | null {
  if (source.kind === "google" && source.account) {
    return { provider: "gmail", email: source.account };
  }
  if (source.kind === "outlook" && source.account) {
    return { provider: "outlook", email: source.account };
  }
  return null;
}

function SourceToggle({
  enabled,
  disabled,
  onChange,
}: {
  enabled: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useMailT();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 text-sm font-medium",
        enabled ? "text-teal-700" : "text-stone-400",
        disabled && "opacity-60"
      )}
    >
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          enabled ? "bg-teal-700" : "bg-stone-300"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            enabled ? "left-4" : "left-0.5"
          )}
        />
      </span>
      {enabled ? t("on") : t("off")}
    </button>
  );
}

/**
 * Lists every compose contact source with toggle, count, sync time, and the
 * one place to edit that source (CRM in-app; Gmail/Outlook at the provider).
 */
export function ContactSourcesDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useMailT();
  const [sources, setSources] = React.useState<SourceStatus[] | null>(null);
  const [syncing, setSyncing] = React.useState(false);
  const [toggling, setToggling] = React.useState<string | null>(null);
  const { connecting, connect } = useMailConnect();

  const load = React.useCallback(async () => {
    try {
      const json = await apiJson<{ sources: SourceStatus[] }>(
        "/api/mail/contact-sources"
      );
      setSources(json.sources);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("couldNotLoadContactSources")
      );
    }
  }, [t]);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const json = await apiJson<{
        results: {
          ok: boolean;
          error?: string;
          account: string;
          source: string;
        }[];
      }>("/api/mail/contact-sources/sync", { method: "POST" });
      const failed = json.results.filter((r) => !r.ok);
      if (failed.length) {
        toast.error(
          failed[0].error || t("sourcesNeedReconnect")
        );
      } else {
        toast.success(t("contactSourcesUpdated"));
      }
      await load();
      notifyContactsChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("syncFailed"));
    } finally {
      setSyncing(false);
    }
  };

  /**
   * Get the address book readable, from wherever the reader asked.
   *
   * Turning the source on is the ask. macOS shows its prompt right there, and
   * if it has already been answered there is nothing to prompt — so this opens
   * the one pane that can change the answer instead of describing it.
   *
   * @returns true when the book can be read.
   */
  const allowMacContacts = async (): Promise<boolean> => {
    const status = await macContactsAuthorization();
    if (status === "authorized" || status === "limited") return true;

    if (status === "notDetermined") {
      const next = await macContactsRequestAccess();
      // Asked and answered, so Mail stops offering it anywhere else.
      stopAskingForMacContacts();
      if (next === "authorized" || next === "limited") return true;
    }

    await openContactsPrivacySettings();
    return false;
  };

  const toggle = async (key: string, enabled: boolean) => {
    setToggling(key);
    try {
      // Turning the Mac book on is what asks macOS. A source that cannot be
      // read must not be left showing On.
      if (key === "mac" && enabled && !(await allowMacContacts())) {
        await load();
        return;
      }
      const json = await apiJson<{ sources: SourceStatus[] }>(
        "/api/mail/contact-sources",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, enabled }),
        }
      );
      setSources(json.sources);
      notifyContactsChanged();
      // Newly allowed, and still empty until something reads it.
      if (key === "mac" && enabled) await sync();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("couldNotUpdate"));
    } finally {
      setToggling(null);
    }
  };

  if (!open) return null;

  return (
    <SettingsDialog
      title={t("contactSources")}
      subtitle={
        <>
          {t("contactSourcesSubtitleBefore")}
          <span className="font-medium text-stone-700">
            {t("contactSourcesSubtitleBold")}
          </span>
          {t("contactSourcesSubtitleAfter")}
        </>
      }
      onClose={onClose}
      width="w-[480px]"
      footer={
        <>
          <p className="mr-auto text-[11px] leading-relaxed text-stone-400">
            {t("contactSourcesFooter")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 rounded-full"
            disabled={syncing}
            onClick={() => void sync()}
          >
            {syncing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t("syncNow")}
          </Button>
        </>
      }
    >
      {sources == null ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-stone-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("loading")}
        </div>
      ) : (
        <SettingsGroup>
          <ul className="divide-y divide-stone-200">
              {sources.map((source) => {
                const link = editLink(source, t);
                const reconnect = reconnectTarget(source);
                const needsReconnect = Boolean(
                  source.lastError?.toLowerCase().includes("reconnect")
                );
                const synced = relativeSyncedAt(source.syncedAt, t);
                const showCount = source.kind !== "history";
                return (
                  <li
                    key={source.key}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3.5",
                      !source.enabled && "opacity-55"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-stone-900">
                          {sourceTitle(source, t)}
                        </p>
                        {showCount ? (
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                              source.kind === "crm"
                                ? "bg-teal-700/10 text-teal-800"
                                : "bg-stone-100 text-stone-600"
                            )}
                          >
                            {formatCount(source.count)}
                          </span>
                        ) : null}
                      </div>

                      {source.kind === "crm" ? (
                        <p className="mt-0.5 text-xs text-stone-500">
                          {t("yourCrm")}
                          {link ? (
                            <>
                              {" · "}
                              <a
                                href={link.href}
                                className="font-medium text-teal-700 hover:underline"
                              >
                                {link.label}
                              </a>
                            </>
                          ) : null}
                        </p>
                      ) : null}

                      {source.kind === "google" || source.kind === "outlook" ? (
                        <>
                          <p className="mt-0.5 truncate text-xs text-stone-500">
                            {source.account}
                            {synced ? ` · ${synced}` : null}
                          </p>
                          {link ? (
                            <p className="mt-0.5 text-xs">
                              <a
                                href={link.href}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-teal-700 hover:underline"
                              >
                                {link.label}
                              </a>
                            </p>
                          ) : null}
                        </>
                      ) : null}

                      {source.kind === "history" ? (
                        <p className="mt-0.5 text-xs text-stone-500">
                          {t("mailHistoryHint")}
                        </p>
                      ) : null}

                      {/*
                        Wanted, but not allowed yet. This is not an error, so
                        it does not read as one — the source is on and waiting
                        for macOS, and this is the way through.
                      */}
                      {source.needsAccess ? (
                        <p className="mt-0.5 text-xs text-stone-500">
                          {source.needsAccess === "ask" ? (
                            t("macContactsAsk")
                          ) : (
                            <>
                              {t("macContactsBlocked")} ·{" "}
                              <button
                                type="button"
                                className="font-medium text-teal-700 hover:underline"
                                onClick={() =>
                                  void openContactsPrivacySettings()
                                }
                              >
                                {t("openSystemSettings")}
                              </button>
                            </>
                          )}
                        </p>
                      ) : null}

                      {source.lastError ? (
                        <p className="mt-1 text-xs text-amber-800">
                          {source.lastError}
                          {needsReconnect && reconnect ? (
                            <>
                              {" · "}
                              <a
                                href={mailConnectHref(
                                  reconnect.provider,
                                  reconnect.email
                                )}
                                onClick={(event) => {
                                  event.preventDefault();
                                  connect(
                                    reconnect.provider,
                                    reconnect.email
                                  );
                                }}
                                className="font-medium underline"
                              >
                                {connecting ? t("opening") : t("reconnect")}
                              </a>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                    </div>

                    <SourceToggle
                      enabled={source.enabled}
                      disabled={toggling === source.key}
                      onChange={(next) => void toggle(source.key, next)}
                    />
                  </li>
                );
              })}
          </ul>
        </SettingsGroup>
      )}
    </SettingsDialog>
  );
}

/** Mount once; opens when typeahead footer or accounts menu asks. */
export function ContactSourcesDialogHost() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_CONTACT_SOURCES_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CONTACT_SOURCES_EVENT, onOpen);
  }, []);

  return <ContactSourcesDialog open={open} onClose={() => setOpen(false)} />;
}

/**
 * Composing → Autocomplete entry in the Display menu (opens Contact sources).
 */
/**
 * Contact sources, as one row in General.
 *
 * It says what the sources add up to — how many are on, and how many
 * addresses they hold between them — because that is the question somebody
 * opens this with. The count follows a sync, so a source turned on here is
 * reflected without reopening the panel.
 */
export function ContactSourcesSettingsRow({ onOpen }: { onOpen?: () => void }) {
  const t = useMailT();
  // The counts, not the sentence. The sentence is built at render, so a
  // change of language rewrites it without asking the sources again.
  const [counts, setCounts] = React.useState<{
    sources: number;
    contacts: number;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const json = await apiJson<{ sources: SourceStatus[] }>(
          "/api/mail/contact-sources"
        );
        if (cancelled) return;
        const on = json.sources.filter((s) => s.enabled);
        setCounts({
          sources: on.length,
          contacts: on.reduce((n, s) => n + s.count, 0),
        });
      } catch {
        // The row still opens the panel, which is the part that matters.
      }
    };
    void load();
    const onChanged = () => void load();
    window.addEventListener(CONTACTS_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(CONTACTS_CHANGED_EVENT, onChanged);
    };
  }, []);

  const summary = counts
    ? [
        counts.sources === 1
          ? t("sourcesOnOne")
          : t("sourcesOnMany", { count: counts.sources }),
        counts.contacts === 1
          ? t("contactsCountOne")
          : t("contactsCountMany", {
              count: counts.contacts.toLocaleString(),
            }),
      ].join(" \u00b7 ")
    : undefined;

  return (
    <SettingsRow
      label={t("contactSources")}
      hint={summary}
      onClick={() => {
        onOpen?.();
        openContactSourcesDialog();
      }}
      control={
        <ChevronRight
          className="h-4 w-4 shrink-0 text-stone-400"
          aria-hidden
        />
      }
    />
  );
}
