"use client";

/**
 * The connected mailboxes, in the settings panel: connect, disconnect, reorder,
 * and show or hide each one.
 *
 * The rows are draggable, and the order they are left in is the order the mail
 * list uses. Everything here talks to `/api/gmail/accounts` and
 * `/api/outlook/accounts`, which every host answers — the planner from a route,
 * the standalone from the core running in its own webview.
 */

import * as React from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  autoReplyActive,
  type AutoReplyDto,
} from "@/components/mail/AutoReplyDialog";
import {
  SettingsGroup,
  SettingsHeading,
  SettingsStackedRow,
} from "@/components/mail/settings-ui";
import { Button } from "@/components/ui/button";
import { mailApiJson as apiJson } from "@/lib/mail/api";
import { mailUsesCrmPeople } from "@/lib/mail/product-flavor";
import { useMailConnect } from "@/components/mail/use-mail-connect";
import type { GmailAccountDto } from "@/lib/crm-contact-index";
import { shouldIgnoreFetchError } from "@/lib/mail/ignore-fetch-error";
import { useMailRouter } from "@/lib/mail-router";
import { cn } from "@/lib/utils";

export type MailAccountRow = GmailAccountDto & {
  provider: "gmail" | "outlook";
};
/**
 * The name that goes on mail from this account.
 *
 * Reported, not set. Mail sends the name the provider holds, so this says what
 * that name is and where to change it — see `@/lib/mail/sender-identity` for
 * why Mail does not keep a name of its own.
 *
 * Nothing is shown until the name is known: a row that cannot say the name is
 * worse than no row, because an empty one reads as a question nobody answered.
 * Outlook never knows it — Graph decides the name itself.
 */
function SenderNameRow({ account }: { account: string }) {
  const [settings, setSettings] = React.useState<{
    provider: string;
    known: boolean;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void apiJson<{ provider: string; known: boolean }>(
      `/api/mail/sender-name?account=${encodeURIComponent(account)}`
    )
      .then((loaded) => {
        if (cancelled) return;
        setSettings(loaded);
      })
      .catch((err) => {
        // The panel is still usable without it, so this stays a warning.
        if (!shouldIgnoreFetchError()) {
          console.warn("mail: could not read the sender name", err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [account]);

  if (!settings?.known) return null;

  return (
    <div className="flex items-center gap-2 border-t border-dashed border-stone-200 px-3 py-1.5 text-xs">
      <span className="shrink-0 text-stone-500">Name on your mail</span>
      <span className="min-w-0 flex-1 truncate text-stone-700">
        {settings.provider}
      </span>
      <a
        href="https://mail.google.com/mail/u/0/#settings/accounts"
        target="_blank"
        rel="noreferrer"
        className="shrink-0 font-medium text-teal-700 hover:underline"
      >
        change in Gmail
      </a>
    </div>
  );
}

function SortableAccountRow({
  account,
  autoReply,
  reconnecting,
  onReconnect,
  onDisconnect,
  onToggleInMailTab,
  onEditAutoReply,
  onEndAutoReply,
}: {
  account: MailAccountRow;
  /** Undefined while status is loading or when hidden from the Mail tab. */
  autoReply: AutoReplyDto | undefined;
  reconnecting?: boolean;
  onReconnect: () => void;
  onDisconnect: () => void;
  onToggleInMailTab: () => void;
  onEditAutoReply: () => void;
  onEndAutoReply: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: account.email });
  const away = autoReply !== undefined && autoReplyActive(autoReply);
  const isOutlook = account.provider === "outlook";

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        // One row on the section's card, not a card of its own. A stack of
        // outlined boxes inside an outlined box is what made this panel read
        // as a pile.
        //
        // Out of office still colours the row, but as a bar down its left
        // rather than a border: a border would fight the hairlines between
        // rows, and it moved everything by a pixel when it appeared.
        // Its own block, in the same cream as every other settings group, so
        // the gap between rows shows the panel behind.
        "relative bg-[var(--mail-chrome)]",
        away && "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-emerald-400",
        isDragging && "z-10 rounded-lg bg-white shadow-md"
      )}
    >
      <div className="flex items-center justify-between gap-1 px-1.5 py-1.5">
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none rounded p-1 text-stone-300 hover:text-stone-500 active:cursor-grabbing"
        aria-label={`Reorder ${account.email}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm", !account.inMailTab && "text-stone-400")}>
          {account.email}
          <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-stone-400">
            {isOutlook ? "Outlook" : "Gmail"}
          </span>
        </p>
        <p
          className={cn(
            "truncate text-xs",
            account.lastSyncError ? "text-red-600" : "text-muted-foreground"
          )}
        >
          {/* A connected account that is not hidden is live, so saying so
              said nothing. Only the two states worth reporting are named. */}
          {!account.inMailTab
            ? "hidden from Mail"
            : account.lastSyncError
              ? `error: ${account.lastSyncError}`
              : isOutlook
                ? "Outlook"
                : "Gmail"}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-stone-900"
          aria-label={
            account.inMailTab
              ? `Hide ${account.email} from the Mail tab`
              : `Show ${account.email} in the Mail tab`
          }
          title={
            account.inMailTab
              ? mailUsesCrmPeople()
                ? "Hide from Mail tab (stays connected for CRM sync)"
                : "Hide from Mail tab (the account stays connected)"
              : "Show in Mail tab"
          }
          onClick={onToggleInMailTab}
        >
          {account.inMailTab ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-stone-900"
          aria-label={
            reconnecting
              ? `Opening permissions for ${account.email}`
              : `Reconnect ${account.email}`
          }
          title={
            reconnecting
              ? "Opening Google / Microsoft…"
              : "Reconnect (renews permissions)"
          }
          disabled={reconnecting}
          onClick={onReconnect}
        >
          {reconnecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-red-600"
          aria-label={`Disconnect ${account.email}`}
          title="Disconnect"
          onClick={onDisconnect}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      </div>

      {account.inMailTab ? <SenderNameRow account={account.email} /> : null}

      {autoReply !== undefined ? (
        <div className="flex items-center justify-between gap-2 border-t border-dashed border-stone-200 px-3 py-1.5 text-xs">
          {away ? (
            <>
              <span className="flex min-w-0 items-center gap-1.5 font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span className="truncate">
                  Out of office
                  {autoReply.endTime !== null
                    ? ` · until ${new Date(autoReply.endTime - 1).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
                    : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2.5">
                <button
                  type="button"
                  className="font-medium text-teal-700 hover:underline"
                  onClick={onEditAutoReply}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="font-medium text-teal-700 hover:underline"
                  onClick={onEndAutoReply}
                >
                  End
                </button>
              </span>
            </>
          ) : autoReply.unavailable ? (
            /* Nothing to offer, and a reason rather than a silence. A personal
               Microsoft account is the case: Graph will not hand over its
               mailbox settings, so the reply has to be set where the mailbox
               lives. */
            <span className="text-stone-400">
              Out-of-office reply · not available for this mailbox
            </span>
          ) : (
            <>
              <span className="text-stone-500">Out-of-office reply</span>
              <button
                type="button"
                className="shrink-0 font-medium text-teal-700 hover:underline"
                onClick={onEditAutoReply}
              >
                Set up…
              </button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}
function guessMailProvider(email: string): "gmail" | "outlook" {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (
    domain === "outlook.com" ||
    domain === "hotmail.com" ||
    domain === "live.com" ||
    domain === "msn.com"
  ) {
    return "outlook";
  }
  return "gmail";
}
/** Instant rows from emails already known on the page (before details fetch). */
function seedAccountRows(emails: string[]): MailAccountRow[] {
  return emails.map((email) => ({
    email,
    clerkUserId: null,
    historyId: null,
    lastSyncedAt: null,
    lastSyncError: null,
    inMailTab: true,
    provider: guessMailProvider(email),
  }));
}
/** Connected mailboxes panel — lives at the bottom of the Display menu. */
/**
 * One connect button, in its three states.
 *
 * Busy matters more here than it looks: connecting leaves for the provider's
 * sign-in, and until the page goes there is nothing on screen to say a click
 * landed. The natural response to that is to click again.
 */
function ConnectButton({
  provider,
  busy = false,
  disabledReason,
  onClick,
}: {
  provider: "gmail" | "outlook";
  busy?: boolean;
  /** Set when this build has no client for the provider. Says why on hover. */
  disabledReason?: string | null;
  onClick?: () => void;
}) {
  const label = provider === "outlook" ? "Outlook" : "Gmail";
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full gap-1.5"
      disabled={busy || Boolean(disabledReason)}
      title={disabledReason ?? undefined}
      onClick={onClick}
    >
      {busy ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening {label}…
        </>
      ) : (
        <>
          <Plus className="h-4 w-4" />
          Connect {label}
        </>
      )}
    </Button>
  );
}

/**
 * Aliases and colleague domains, for a host that stores them.
 *
 * Only shown when `onSave` is given. A host that reads its identity from
 * server environment has nothing to edit here, and offering a box that saves
 * nothing would be worse than offering none.
 */
function OwnIdentityFields({
  addresses,
  domains,
  onSave,
}: {
  addresses: string[];
  domains: string[];
  onSave: (next: { addresses: string[]; domains: string[] }) => void;
}) {
  const [addressText, setAddressText] = React.useState(addresses.join(", "));
  const [domainText, setDomainText] = React.useState(domains.join(", "));

  // Follow the stored values when they load or change elsewhere.
  React.useEffect(() => {
    setAddressText(addresses.join(", "));
  }, [addresses]);
  React.useEffect(() => {
    setDomainText(domains.join(", "));
  }, [domains]);

  const commit = (nextAddresses: string, nextDomains: string) => {
    const split = (text: string) =>
      text
        .split(/[\s,;]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    onSave({
      addresses: split(nextAddresses),
      domains: split(nextDomains).map((d) => d.toLowerCase().replace(/^.*@/, "")),
    });
  };

  const field =
    "w-full rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-stone-400";

  // No wrapper element. SettingsHeading drops its top margin when it is the
  // first child, so that the panel does not open with a gap — and a div here
  // made this heading the first child of that div, which is how it ended up
  // pressed against the accounts above it.
  return (
    <>
      <SettingsHeading>Your other addresses</SettingsHeading>
      <SettingsGroup>
        <SettingsStackedRow
          label="Aliases"
          hint="Addresses you never connected — mail to these still counts as yours."
        >
          <input
            type="text"
            value={addressText}
            placeholder="you@old.example, alias@example.com"
            onChange={(e) => setAddressText(e.target.value)}
            onBlur={() => commit(addressText, domainText)}
            className={field}
            aria-label="Aliases"
          />
        </SettingsStackedRow>
        <SettingsStackedRow
          label="Colleague domains"
          hint="Leave empty unless you have an organization."
        >
          <input
            type="text"
            value={domainText}
            placeholder="example.com"
            onChange={(e) => setDomainText(e.target.value)}
            onBlur={() => commit(addressText, domainText)}
            className={field}
            aria-label="Colleague domains"
          />
        </SettingsStackedRow>
      </SettingsGroup>
    </>
  );
}

export function MailAccountsPanel({
  knownEmails,
  onVisibilityChange,
  onChanged,
  autoReplies,
  onSetUpAutoReply,
  onEndAutoReply,
  onRequestClose,
  ownIdentity,
  onOwnIdentityChange,
}: {
  /** Emails already loaded with the mail page — paint these while details fetch. */
  knownEmails: string[];
  /** Optimistic chip update when hide/show toggles (before PATCH finishes). */
  onVisibilityChange: (email: string, inMailTab: boolean) => void;
  onChanged: () => void;
  autoReplies: AutoReplyDto[];
  onSetUpAutoReply: (account: string) => void;
  onEndAutoReply: (account: string) => void;
  onRequestClose: () => void;
  /** Stored aliases and colleague domains, without the connected mailboxes. */
  ownIdentity?: { addresses: string[]; domains: string[] };
  /** Given only by a host that stores identity. Absent hides the fields. */
  onOwnIdentityChange?: (next: {
    addresses: string[];
    domains: string[];
  }) => void;
}) {
  const router = useMailRouter();
  const { connecting, connect } = useMailConnect();
  const [accounts, setAccounts] = React.useState<MailAccountRow[] | null>(null);
  const [gmailConfigError, setGmailConfigError] = React.useState<string | null>(
    null
  );
  const [outlookConfigError, setOutlookConfigError] = React.useState<
    string | null
  >(null);
  const [reconnectingEmail, setReconnectingEmail] = React.useState<
    string | null
  >(null);
  const knownEmailsRef = React.useRef(knownEmails);
  knownEmailsRef.current = knownEmails;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const loadAccounts = React.useCallback(async () => {
    try {
      const [gmailJson, outlookJson] = await Promise.all([
        apiJson<{
          accounts?: GmailAccountDto[];
          configError?: string | null;
        }>("/api/gmail/accounts"),
        apiJson<{
          accounts?: Array<{
            email: string;
            clerkUserId: string | null;
            lastSyncedAt: string | null;
            lastSyncError: string | null;
            inMailTab: boolean;
          }>;
          configError?: string | null;
        }>("/api/outlook/accounts"),
      ]);
      const gmailRows: MailAccountRow[] = (gmailJson.accounts ?? []).map(
        (a) => ({
          ...a,
          historyId: a.historyId ?? null,
          provider: "gmail" as const,
        })
      );
      const outlookRows: MailAccountRow[] = (outlookJson.accounts ?? []).map(
        (a) => ({
          email: a.email,
          clerkUserId: a.clerkUserId,
          historyId: null,
          lastSyncedAt: a.lastSyncedAt,
          lastSyncError: a.lastSyncError,
          inMailTab: a.inMailTab,
          provider: "outlook" as const,
        })
      );
      setAccounts([...gmailRows, ...outlookRows]);
      setGmailConfigError(gmailJson.configError ?? null);
      setOutlookConfigError(outlookJson.configError ?? null);
    } catch (err) {
      if (!shouldIgnoreFetchError()) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't load accounts"
        );
      }
      // Never leave the menu stuck on “Loading…” after a failed fetch.
      setAccounts((prev) => prev ?? seedAccountRows(knownEmailsRef.current));
    }
  }, []);

  // Prefetch on mail page load so opening the menu is usually instant.
  React.useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  // Safari mailbox OAuth finishes outside the WebView — refresh on focus.
  React.useEffect(() => {
    const onFocus = () => {
      void loadAccounts();
      onChanged();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadAccounts, onChanged]);

  const displayAccounts = accounts ?? seedAccountRows(knownEmails);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !accounts) return;
    const oldIndex = accounts.findIndex((a) => a.email === active.id);
    const newIndex = accounts.findIndex((a) => a.email === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const moved = accounts[oldIndex];
    const target = accounts[newIndex];
    if (moved.provider !== target.provider) {
      toast.error("Reorder within the same provider only");
      return;
    }

    const next = arrayMove(accounts, oldIndex, newIndex);
    setAccounts(next);
    void (async () => {
      try {
        const order = next
          .filter((a) => a.provider === moved.provider)
          .map((a) => a.email);
        const path =
          moved.provider === "outlook"
            ? "/api/outlook/accounts"
            : "/api/gmail/accounts";
        await apiJson(path, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order }),
        });
        router.refresh();
        onChanged();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't save the order"
        );
        void loadAccounts();
      }
    })();
  };

  // Surface OAuth callback results when returning from Google / Microsoft.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailConnected = params.get("gmail_connected");
    const gmailError = params.get("gmail_error");
    const outlookConnected = params.get("outlook_connected");
    const outlookError = params.get("outlook_error");
    if (!gmailConnected && !gmailError && !outlookConnected && !outlookError) {
      return;
    }

    if (gmailConnected) toast.success(`Gmail connected: ${gmailConnected}`);
    if (gmailError) toast.error(`Gmail connection failed: ${gmailError}`);
    if (outlookConnected) {
      toast.success(`Outlook connected: ${outlookConnected}`);
    }
    if (outlookError) {
      toast.error(`Outlook connection failed: ${outlookError}`);
    }

    params.delete("gmail_connected");
    params.delete("gmail_error");
    params.delete("outlook_connected");
    params.delete("outlook_error");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`
    );
    if (gmailConnected || outlookConnected) {
      router.refresh();
      onChanged();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnect = async (account: MailAccountRow) => {
    try {
      const path =
        account.provider === "outlook"
          ? `/api/outlook/accounts?email=${encodeURIComponent(account.email)}`
          : `/api/gmail/accounts?email=${encodeURIComponent(account.email)}`;
      await apiJson(path, { method: "DELETE" });
      toast.success(`Disconnected ${account.email}`);
      onVisibilityChange(account.email, false);
      await loadAccounts();
      router.refresh();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't disconnect");
    }
  };

  const toggleInMailTab = async (account: MailAccountRow) => {
    const next = !account.inMailTab;
    setAccounts((current) =>
      (current ?? seedAccountRows(knownEmailsRef.current)).map((a) =>
        a.email === account.email ? { ...a, inMailTab: next } : a
      )
    );
    // Chips update immediately; thread list refreshes after PATCH (cache cleared).
    onVisibilityChange(account.email, next);
    try {
      const path =
        account.provider === "outlook"
          ? "/api/outlook/accounts"
          : "/api/gmail/accounts";
      await apiJson(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: account.email, inMailTab: next }),
      });
      toast.success(
        next
          ? `${account.email} shown in Mail`
          : account.provider === "outlook"
            ? `${account.email} hidden from Mail`
            : mailUsesCrmPeople()
              ? `${account.email} hidden from Mail (still synced for CRM)`
              : `${account.email} hidden from Mail (still connected)`
      );
      router.refresh();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update");
      onVisibilityChange(account.email, account.inMailTab);
      void loadAccounts();
    }
  };

  return (
    <div>
      {/* `first:mt-0` is meant for the heading at the top of a panel. This one
          opens a panel of its own that sits below another section, so it needs
          the same air as any other heading. */}
      <SettingsHeading className="first:mt-6">Accounts</SettingsHeading>

      {gmailConfigError ? (
        <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          Gmail: {gmailConfigError}
        </p>
      ) : null}
      {outlookConfigError ? (
        <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          Outlook: {outlookConfigError}
        </p>
      ) : null}

      {/* One card for the section: the accounts, and the two ways to add
          another. Adding a mailbox belongs to this list, so the buttons sit on
          the same surface rather than floating below it. */}
      <div className="overflow-hidden rounded-xl bg-[var(--mail-chrome)]">
      {displayAccounts.length ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={displayAccounts.map((a) => a.email)}
            strategy={verticalListSortingStrategy}
          >
            {/* No scrollbox of its own. The panel around it scrolls now, and
                a list that scrolls inside a panel that scrolls means the
                wheel does one thing over the accounts and another an inch
                above them. */}
            {/* A gap between accounts rather than a hairline. Each account
                carries a name, a state, and sometimes an out-of-office line,
                so a rule between them was doing the work of a paragraph
                break. The gap shows the panel through, which is what
                separates one account from the next. */}
            <ul className="flex flex-col gap-[4px] bg-white">
              {displayAccounts.map((account) => (
                <SortableAccountRow
                  key={`${account.provider}:${account.email}`}
                  account={account}
                  autoReply={
                    account.provider === "gmail"
                      ? autoReplies.find((a) => a.account === account.email)
                      : undefined
                  }
                  reconnecting={reconnectingEmail === account.email}
                  onReconnect={() => {
                    if (reconnectingEmail) return;
                    setReconnectingEmail(account.email);
                    const providerLabel =
                      account.provider === "outlook" ? "Microsoft" : "Google";
                    toast.message(`Opening ${providerLabel} to renew permissions…`);
                    // Keep spinner visible briefly so the click registers before
                    // the browser navigates away to the OAuth consent screen.
                    window.setTimeout(() => {
                      if (account.provider === "outlook") {
                        connect("outlook", account.email);
                      } else {
                        connect("gmail", account.email);
                      }
                    }, 150);
                  }}
                  onDisconnect={() => void disconnect(account)}
                  onToggleInMailTab={() => void toggleInMailTab(account)}
                  onEditAutoReply={() => {
                    onRequestClose();
                    onSetUpAutoReply(account.email);
                  }}
                  onEndAutoReply={() => onEndAutoReply(account.email)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          No mailboxes connected yet.
        </p>
      )}

      {/* The strip that separates one account from the next, continued under
          the last one — adding a mailbox is one more item in this card, not a
          footer under it.

          A block carrying the list's own background rather than a white
          border. `border-white` is white in both themes, and on the dark one
          it was a bright white rule across the card; `bg-white` is the same
          class the gaps above are drawn with, and the theme answers it. */}
      <div aria-hidden className="h-[4px] bg-white" />
      {/* Side by side: two ways of doing the same thing, so neither leads. */}
      <div className="grid grid-cols-2 gap-2 p-2">
        {gmailConfigError ? (
          <ConnectButton provider="gmail" disabledReason={gmailConfigError} />
        ) : (
          <ConnectButton
            provider="gmail"
            busy={connecting === "gmail"}
            onClick={() => connect("gmail")}
          />
        )}
        {outlookConfigError ? (
          <ConnectButton provider="outlook" disabledReason={outlookConfigError} />
        ) : (
          <ConnectButton
            provider="outlook"
            busy={connecting === "outlook"}
            onClick={() => connect("outlook")}
          />
        )}
      </div>
      </div>

      {onOwnIdentityChange ? (
        <OwnIdentityFields
          addresses={ownIdentity?.addresses ?? []}
          domains={ownIdentity?.domains ?? []}
          onSave={onOwnIdentityChange}
        />
      ) : null}

    </div>
  );
}
