"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { flushPendingDiscards } from "@/lib/mail/pending-discard";
import { successorAfterRemoving, successorInEitherOrder } from "@/lib/mail/successor";
import { useApplyUiScale, useUiScale } from "@/lib/mail/use-ui-scale";
import { useMailColorMode, useMailTheme, type MailTheme } from "@/lib/mail/theme";
import { onMailComposeTo } from "@/lib/mail/compose-to";
import {
  isOwnPersonalAddress,
  normalizeEmail,
  setOwnMailIdentity,
} from "@/lib/own-addresses";
import { useMailConnect } from "@/components/mail/use-mail-connect";
import {
  isMailPersonPinned,
  listMailPersonPins,
  orderByPersonPin,
  subscribeMailPersonPins,
  toggleMailPersonPin,
  type MailPersonPin,
} from "@/lib/mail/person-pins";
import { ComposeView } from "@/components/mail/ComposeView";
import { ThreadPane } from "@/components/mail/ThreadPane";
import {
  avatarStyle,
  senderInitials,
} from "@/components/mail/avatar";
import { MailDotIcon } from "@/components/mail/MailDotIcon";
import {
  MailAccountsPanel,
} from "@/components/mail/MailAccountsPanel";
import {
  useLoadImagesByDefault,
} from "@/components/mail/MailBubble";
import {
  formatSnoozeWakeLabel,
  SnoozeMenu,
} from "@/components/mail/SnoozeMenu";
import {
  isInteractiveDoubleClickTarget,
  MAX_CONTROLS_WIDTH,
  MAX_LIST_ARIA,
  MIN_CONTROLS_WIDTH,
  MIN_LIST_HEIGHT,
  MIN_LIST_WIDTH,
  NARROW_LIST_WIDTH,
  SNAP_HIDE_LIST_HEIGHT,
  useMailControlsWidth,
  useMailListHeight,
  useMailListPlacement,
  useMailListWidth,
  nextZoomStop,
  useMailZoom,
} from "@/components/mail/use-mail-layout";
import {
  mailConnectHref,
} from "@/lib/mail/connect-mailbox";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  Check,
  Trash2,
  ArrowLeft,
  Calendar,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Clock,
  Folder,
  Funnel,
  Loader2,
  Mails,
  Maximize2,
  Minimize2,
  Paperclip,
  Pin,
  Plus,
  RefreshCw,
  RotateCwFadingClock,
  Search,
  SlidersVertical,
  SquarePen,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { beginNativeWindowDragOnMove } from "@/lib/native-shell";
import {
  AutoReplyDialog,
  autoReplyActive,
  type AutoReplyDto,
} from "@/components/mail/AutoReplyDialog";
import {
  mailPeopleTabLabel,
  mailUsesCrmPeople,
} from "@/lib/mail/product-flavor";
import {
  bumpMailFolderCount,
  clearMailThreadDrag,
  draggingMailThread,
  FolderViewHeader,
  FoldersTabMenu,
  isMailThreadDrag,
  setMailThreadDragData,
  useDraggingMailAccount,
  useMailFolders,
} from "@/components/mail/MailFolders";
import { MailFolderRail } from "@/components/mail/MailFolderRail";
import {
  FOLDER_RAIL_MAX_WIDTH,
  FOLDER_RAIL_MIN_WIDTH,
  useFolderRailOpen,
  useFolderRailWidth,
} from "@/lib/mail/folder-rail";
import { MailCustomListEditor } from "@/components/mail/MailCustomListEditor";
import {
  CONTACTS_CHANGED_EVENT,
  ContactSourcesDialogHost,
  ContactSourcesSettingsRow,
} from "@/components/mail/ContactSourcesDialog";
import { MacContactsAskCard } from "@/components/mail/MacContactsAskCard";
import {
  createCustomList,
  customListTabId,
  deleteCustomList,
  MAIL_CUSTOM_LISTS_EVENT,
  parseCustomListTabId,
  readCustomLists,
  scheduledCustomListTabId,
  threadMatchesCustomList,
  updateCustomList,
  type MailCustomList,
} from "@/lib/mail/custom-lists";
import {
  accountChipLabels,
  formatAccountChipLabel,
} from "@/lib/mail/account-labels";
import type {
  MailFolder,
  MailFolderRole,
} from "@/lib/mail/folder-types";
import {
  getMailFilterRowOpen,
  setMailFilterRowOpen,
  setMailListPlacement,
  type MailListPlacement,
} from "@/lib/mail/layout";
import { shouldIgnoreFetchError } from "@/lib/mail/ignore-fetch-error";
import {
  listMailPins,
  subscribeMailPins,
  syncMailPinSummaries,
  toggleMailPin,
  unpinMailThread,
  type MailPinRecord,
} from "@/lib/mail/pins";
import {
  getThreadDraftKeysSnapshot,
  pruneExpiredMailDrafts,
  subscribeMailDrafts,
  threadDraftKey,
} from "@/lib/mail/local-drafts";
import { scheduleMailThreadPrefetch } from "@/lib/mail/prefetch-threads";
import {
  invalidateCachedMailThread,
} from "@/lib/mail/thread-cache";
import { ExternalAssetImage } from "@/components/ExternalAssetImage";
import {
  useIsOutlookAccount,
  useMailProviderNames,
} from "@/lib/mail/use-outlook-accounts";
import { Button } from "@/components/ui/button";
import {
  getPageSnapshot,
  mailPageCacheKey,
  setPageSnapshot,
} from "@/lib/page-snapshot-cache";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { MailPopoverContent } from "@/components/mail/MailPopoverContent";
import { MailShortcutsDialog } from "@/components/mail/MailShortcutsDialog";
import {
  SettingsGroup,
  SettingsHeading,
  SettingsLanguageRow,
  SettingsTextSizeRow,
  SettingsRow,
  SettingsToggle,
  settingsSecondaryButton,
} from "@/components/mail/settings-ui";
import {
  currentMailLocale,
  mailSay,
  useMailT,
  type MailStringKey,
  type MailT,
} from "@/lib/mail/i18n";
import {
  MailAccountTabs,
  MailRowButton,
} from "@/components/mail/MailAccountTabs";
import {
  scheduledBuiltinTabId,
  setTabSchedule,
  useTabSchedules,
} from "@/lib/mail/tab-schedules";
import { MAIL_APP_VERSION } from "@/lib/mail/app-version";
import { MailRestPanel } from "@/components/mail/MailRestPanel";
import { MailDraftsList } from "@/components/mail/MailDraftsList";
import {
  isStandaloneDraft,
  useMailDrafts,
} from "@/components/mail/use-mail-drafts";
import {
  preloadRichTextEditor,
} from "@/components/ui/RichTextEditor";
import { onScheduledChanged } from "@/lib/mail/scheduled-events";
import type {
  MailScheduledMessage,
  MailTab,
  MailThreadSummary,
} from "@/lib/mail/types";
import {
  MAIL_FORWARD_REQUEST_KEY,
  MAIL_POPOUT_SENT_KEY,
  readForwardRequest,
  type MailForwardRequest,
} from "@/lib/mail/popout";
import { setMailAvatars, teamAvatarSrc } from "@/lib/mail/team-avatars";
import { cn } from "@/lib/utils";
import {
  MAIL_ACCOUNT_ORDER_EVENT,
  moveAccountBefore,
  readAccountOrder,
  sortAccountsByOrder,
  writeAccountOrder,
} from "@/lib/mail/account-order";
import { mailApiJson as apiJson } from "@/lib/mail/api";
import { mailApiFetch } from "@/lib/mail/api";
import {
  dayBucket,
  rowTime,
  shortDate,
} from "@/lib/mail/date-format";
import {
  forgetThreadEverywhere,
  mailListCacheKey,
  markMailWarm,
  readCachedList,
  scrubLegacySharedMailCaches,
  writeCachedList,
  type MailListCacheEntry,
} from "@/lib/mail/list-cache";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PIN_FLIP_MS = 400;
const PIN_FLIP_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

function readThreadRowRects(root: ParentNode | null): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  if (!root) return map;
  root.querySelectorAll<HTMLElement>("[data-thread-key]").forEach((el) => {
    const key = el.dataset.threadKey;
    if (key) map.set(key, el.getBoundingClientRect());
  });
  return map;
}

/** FLIP rows after pin/unpin so the moved thread glides instead of jumping. */
function playThreadRowFlip(
  root: ParentNode | null,
  from: Map<string, DOMRect>,
  focusKey?: string | null
): void {
  if (!root || from.size === 0) return;
  root.querySelectorAll<HTMLElement>("[data-thread-key]").forEach((el) => {
    const key = el.dataset.threadKey;
    if (!key) return;
    const first = from.get(key);
    const last = el.getBoundingClientRect();
    if (!first) {
      if (focusKey && key === focusKey) {
        el.animate(
          [
            { opacity: 0.55, transform: "translateY(10px) scale(0.98)" },
            { opacity: 1, transform: "translateY(0) scale(1)" },
          ],
          { duration: PIN_FLIP_MS, easing: PIN_FLIP_EASING }
        );
      }
      return;
    }
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    const isFocus = focusKey === key;
    el.style.zIndex = isFocus ? "5" : "1";
    const anim = el.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px)${isFocus ? " scale(1.02)" : ""}`,
          boxShadow: isFocus
            ? "0 10px 28px rgba(28, 25, 23, 0.14)"
            : "0 0 0 transparent",
        },
        {
          transform: "translate(0, 0) scale(1)",
          boxShadow: "0 0 0 transparent",
        },
      ],
      { duration: PIN_FLIP_MS, easing: PIN_FLIP_EASING }
    );
    anim.finished.then(
      () => {
        el.style.zIndex = "";
      },
      () => {
        el.style.zIndex = "";
      }
    );
  });
}

/**
 * Inbox row with hover pin/archive/delete — no permanent pin icon at rest.
 * `dragKind: "pin"` marks the payload so dropping on the date flow unpins.
 */
/** Spacious multi-line rows vs dense one-line rows in the mail list. */
type MailListDensity = "comfortable" | "compact";

/** Two spaced lines — comfortable / multi-line list density. */
function ListDensityComfortableIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
      className={className}
    >
      <line x1="5" y1="9" x2="19" y2="9" />
      <line x1="5" y1="15" x2="19" y2="15" />
    </svg>
  );
}

/** Four tight lines — compact / one-line list density. */
function ListDensityCompactIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden
      className={className}
    >
      <line x1="5" y1="6.5" x2="19" y2="6.5" />
      <line x1="5" y1="10.5" x2="19" y2="10.5" />
      <line x1="5" y1="14.5" x2="19" y2="14.5" />
      <line x1="5" y1="18.5" x2="19" y2="18.5" />
    </svg>
  );
}

/**
 * Outlook-style sync: arrowheads at 12 o'clock and 6 o'clock.
 * Spin wraps the rotated glyph so transform does not fight animate-spin.
 */
function SyncIcon({
  className,
  spinning = false,
}: {
  className?: string;
  spinning?: boolean;
}) {
  return (
    <span className={cn("inline-flex", spinning && "animate-spin")}>
      <RefreshCw className={cn("-rotate-45", className)} aria-hidden />
    </span>
  );
}

const MAIL_LIST_LAYOUTS: {
  id: MailListPlacement;
  label: MailStringKey;
  diagram: MailListPlacement;
}[] = [
  { id: "left", label: "layoutLeft", diagram: "left" },
  { id: "right", label: "layoutRight", diagram: "right" },
  { id: "top", label: "layoutTop", diagram: "top" },
  { id: "bottom", label: "layoutBottom", diagram: "bottom" },
];

function MailListLayoutDiagram({
  diagram,
  selected,
}: {
  diagram: MailListPlacement;
  selected: boolean;
}) {
  return (
    <span
      className={cn(
        "relative block h-8 w-10 overflow-hidden rounded-[3px] border",
        selected
          ? "border-teal-600 bg-teal-50"
          : "border-stone-300 bg-white"
      )}
      aria-hidden
    >
      <span className="absolute inset-0.5 rounded-[1px] bg-stone-100" />
      <span
        className={cn(
          "absolute bg-stone-400/80",
          diagram === "left" && "bottom-0.5 left-0.5 top-0.5 w-[30%]",
          diagram === "right" && "bottom-0.5 right-0.5 top-0.5 w-[30%]",
          diagram === "top" && "left-0.5 right-0.5 top-0.5 h-[30%]",
          diagram === "bottom" && "bottom-0.5 left-0.5 right-0.5 h-[30%]"
        )}
      />
    </span>
  );
}

/** Toggle list density (relaxed ↔ compact) — toolbar control next to expand. */
function ListDensityToggle({
  density,
  onChange,
  onNavy = false,
}: {
  density: MailListDensity;
  onChange: (density: MailListDensity) => void;
  onNavy?: boolean;
}) {
  const t = useMailT();
  const compact = density === "compact";
  return (
    <button
      type="button"
      title={compact ? t("relaxedList") : t("compactList")}
      aria-label={compact ? t("relaxedDensity") : t("compactDensity")}
      aria-pressed={compact}
      className={cn(
        "rounded-md p-1.5",
        onNavy
          ? "text-white/70 hover:bg-white/10 hover:text-white"
          : "text-stone-500 hover:bg-stone-200/60 hover:text-stone-800"
      )}
      onPointerDown={beginNativeWindowDragOnMove}
      onClick={() => onChange(compact ? "comfortable" : "compact")}
    >
      {compact ? (
        <ListDensityCompactIcon className="h-4 w-4" />
      ) : (
        <ListDensityComfortableIcon className="h-4 w-4" />
      )}
    </button>
  );
}

/** Icon tabs: group the list by thread or by person. */
function MailViewModeTabs({
  viewMode,
  onChange,
  onNavy = false,
  vertical = false,
}: {
  viewMode: MailViewMode;
  onChange: (mode: MailViewMode) => void;
  onNavy?: boolean;
  /** Stack icons in the narrow avatar rail. */
  vertical?: boolean;
}) {
  const t = useMailT();
  const options = [
    { id: "threads" as const, label: t("byThread"), Icon: Mails },
    { id: "people" as const, label: t("byPerson"), Icon: User },
  ];
  return (
    <div
      role="tablist"
      aria-label={t("listGrouping")}
      className={cn(
        "flex shrink-0 rounded-md p-0.5",
        vertical ? "flex-col gap-0.5" : "items-center gap-0.5",
        onNavy ? "bg-white/10" : "bg-stone-200/60"
      )}
    >
      {options.map(({ id, label, Icon }) => {
        const selected = viewMode === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            title={label}
            aria-label={label}
            aria-selected={selected}
            onPointerDown={beginNativeWindowDragOnMove}
            onClick={() => onChange(id)}
            className={cn(
              "rounded p-1",
              onNavy
                ? selected
                  ? "bg-white/20 text-[var(--mail-chrome-fg)]"
                  : "text-[var(--mail-chrome-muted)] hover:text-[var(--mail-chrome-fg)]"
                : selected
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-800"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

const OPEN_MAIL_ACCOUNTS_EVENT = "mail:open-accounts";

/**
 * Open the settings panel (Display & accounts) from elsewhere.
 *
 * The mailbox filter next to search lists the same mailboxes, so that is
 * where people look to add or remove one. It sends them here instead of
 * holding a second copy of the controls. The desktop app's Settings… menu
 * item lands here too — see apps/mail/src/main.tsx.
 */
export function openMailAccountsMenu(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_MAIL_ACCOUNTS_EVENT));
}

/** Pane position, display prefs, and connected mailboxes. */
function MailLayoutMenu({
  onNavy = false,
  align = "start",
  knownEmails,
  onVisibilityChange,
  onAccountsChanged,
  autoReplies,
  onSetUpAutoReply,
  onEndAutoReply,
  ownIdentity,
  onOwnIdentityChange,
}: {
  /** Trigger sits on the navy list chrome. */
  onNavy?: boolean;
  /** Popover alignment — use `end` when the trigger is on the right of the title bar. */
  align?: "start" | "end" | "center";
  knownEmails: string[];
  onVisibilityChange: (email: string, inMailTab: boolean) => void;
  onAccountsChanged: () => void;
  autoReplies: AutoReplyDto[];
  onSetUpAutoReply: (account: string) => void;
  onEndAutoReply: (account: string) => void;
  ownIdentity?: { addresses: string[]; domains: string[] };
  onOwnIdentityChange?: (next: {
    addresses: string[];
    domains: string[];
  }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const placement = useMailListPlacement();
  const [loadImagesByDefault, setLoadImagesByDefault] =
    useLoadImagesByDefault();
  const [theme, setTheme] = useMailTheme();
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const t = useMailT();

  // Opened from the mailbox filter next to search. One menu is mounted, so
  // this cannot open two at once.
  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_MAIL_ACCOUNTS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_MAIL_ACCOUNTS_EVENT, onOpen);
  }, []);

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("displayAndAccounts")}
          aria-label={t("displayAndAccountsAria")}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={cn(
            "rounded-md p-1.5",
            onNavy
              ? open
                ? "bg-white/15 text-white"
                : "text-white/70 hover:bg-white/10 hover:text-white"
              : open
                ? "bg-stone-200/70 text-stone-900"
                : "text-stone-500 hover:bg-stone-200/60 hover:text-stone-800"
          )}
          onPointerDown={beginNativeWindowDragOnMove}
        >
          <SlidersVertical className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      {/*
        Dim what is behind the settings panel.

        This one panel holds most of what the app can be told, so it is worth
        setting apart from the mail behind it. The other menus are one
        decision each and would be smothered by this.

        A popover has no overlay of its own, so this is one. It goes on
        `body`, because the trigger sits in the title bar and an element
        rendered there would be dimming from inside the thing it dims.
      */}
      {open && typeof document !== "undefined"
        ? createPortal(
            // The same wash the settings dialogs already use, so opening
            // Contact sources from here does not change the shade.
            <div className="fixed inset-0 z-40 bg-black/20" aria-hidden />,
            document.body
          )
        : null}
      <MailPopoverContent
        align={align}
        /**
         * As tall as the space under the button, and no taller.
         *
         * Radix measures that gap and publishes it; without a limit the panel
         * simply grew, so with a few accounts connected the end of it — the
         * alias boxes, and the way out — was off the bottom of the screen with
         * nothing to scroll.
         *
         * The title and the Done button sit outside the scrolling part, so
         * both stay put however long the middle gets.
         */
        className="flex max-h-[var(--radix-popover-content-available-height)] w-96 flex-col overflow-hidden p-0"
        collisionPadding={12}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-baseline justify-between gap-3 px-3 pb-2 pt-3">
          <h2 className="font-serif text-xl font-bold text-stone-900">
            {t("settings")}
          </h2>
          {MAIL_APP_VERSION ? (
            <span className="text-xs text-stone-400">
              {t("version")} {MAIL_APP_VERSION}
            </span>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <SettingsHeading>{t("general")}</SettingsHeading>
        <SettingsGroup>
          {/* The language first: it decides what every row under it says. */}
          <SettingsLanguageRow />
          <SettingsTextSizeRow />
          <SettingsRow
            label={t("theme")}
            control={
              // A menu, not three buttons. The operating system draws it, so
              // it is the list a Mac reader already knows, with the current
              // choice ticked — and it stays one line however many there are.
              <span className="relative inline-flex items-center">
                <select
                  aria-label={t("theme")}
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as MailTheme)}
                  className="cursor-pointer appearance-none rounded-md border border-stone-200 bg-white py-1 pl-2.5 pr-7 text-xs text-stone-700 outline-none hover:bg-stone-50"
                >
                  <option value="system">{t("themeSystem")}</option>
                  <option value="light">{t("themeLight")}</option>
                  <option value="dark">{t("themeDark")}</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-stone-400" />
              </span>
            }
          />
          <SettingsRow
            label={t("loadImages")}
            hint={t("loadImagesHint")}
            control={
              <SettingsToggle
                checked={loadImagesByDefault}
                onChange={setLoadImagesByDefault}
                label={t("loadImages")}
              />
            }
          />
          <SettingsRow
            label={t("keyboardShortcuts")}
            onClick={() => {
              setOpen(false);
              setShortcutsOpen(true);
            }}
            control={
              <ChevronRight
                className="h-4 w-4 shrink-0 text-stone-400"
                aria-hidden
              />
            }
          />
          {/* Where the addresses come from is a General setting, not a
              Composing one: it is read every time a name is typed anywhere. */}
          <ContactSourcesSettingsRow onOpen={() => setOpen(false)} />
          <SettingsRow
            label={t("readingPane")}
            hint={t("readingPaneHint")}
            control={
              <span className="flex gap-1">
                {MAIL_LIST_LAYOUTS.map((option) => {
                  const selected = placement === option.id;
                  const label = t(option.label);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      title={label}
                      aria-label={label}
                      aria-pressed={selected}
                      onClick={() => setMailListPlacement(option.id)}
                      className={cn(
                        "rounded-md p-1 transition-colors",
                        selected ? "bg-teal-50" : "hover:bg-stone-100"
                      )}
                    >
                      <MailListLayoutDiagram
                        diagram={option.diagram}
                        selected={selected}
                      />
                    </button>
                  );
                })}
              </span>
            }
          />
        </SettingsGroup>

        <MailAccountsPanel
          knownEmails={knownEmails}
          onVisibilityChange={onVisibilityChange}
          onChanged={onAccountsChanged}
          autoReplies={autoReplies}
          onSetUpAutoReply={onSetUpAutoReply}
          onEndAutoReply={onEndAutoReply}
          onRequestClose={() => setOpen(false)}
          ownIdentity={ownIdentity}
          onOwnIdentityChange={onOwnIdentityChange}
        />
        </div>

        {/* Settings save as they are changed, so this only shuts the panel.
            Outside the scrolling part, because a way out you have to scroll to
            find is not much of a way out. */}
        <div className="border-t border-stone-200 p-3">
          <button
            type="button"
            className={cn(settingsSecondaryButton, "w-full")}
            onClick={() => setOpen(false)}
          >
            {t("done")}
          </button>
        </div>
      </MailPopoverContent>
      {shortcutsOpen ? (
        <MailShortcutsDialog onClose={() => setShortcutsOpen(false)} />
      ) : null}
    </Popover>
  );
}

/** Outlook-style cue that this thread has a local unsent reply/forward. */
function DraftBadge({ className }: { className?: string }) {
  const t = useMailT();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none",
        "bg-rose-100 text-rose-800",
        className
      )}
    >
      {t("draft")}
    </span>
  );
}

function useThreadDraftKeys(): ReadonlySet<string> {
  return React.useSyncExternalStore(
    subscribeMailDrafts,
    getThreadDraftKeysSnapshot,
    getThreadDraftKeysSnapshot
  );
}

/**
 * The right-click menu on a row in the list.
 *
 * The same things the row offers on hover, said in words, plus the two that
 * were only ever on an open thread — archive and delete. Snooze is first
 * because it is the one you reach for while reading a list rather than a
 * message: "not now, and not lost".
 *
 * Placed at the pointer and clamped to the window, like the folder menu in
 * the rail — see MailFolderRail.
 */
function ThreadRowMenu({
  x,
  y,
  unread,
  pinned,
  snoozed,
  onSnooze,
  onCancelSnooze,
  onToggleRead,
  onTogglePin,
  onArchive,
  onTrash,
  onDismiss,
}: {
  x: number;
  y: number;
  unread: boolean;
  pinned: boolean;
  snoozed: boolean;
  onSnooze?: () => void;
  onCancelSnooze?: () => void;
  onToggleRead: () => void;
  onTogglePin: () => void;
  onArchive?: () => void;
  onTrash?: () => void;
  onDismiss: () => void;
}) {
  const t = useMailT();
  const ref = React.useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = React.useState({ left: x, top: y });

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setPlaced({
      left: Math.max(8, Math.min(x, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - box.height - 8)),
    });
  }, [x, y]);

  React.useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      onDismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    // A menu that stays put while the list scrolls under it is pointing at
    // whatever has slid into its place.
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("blur", onDismiss);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("blur", onDismiss);
    };
  }, [onDismiss]);

  const item =
    "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-stone-800 hover:bg-stone-100";
  const icon = "h-3.5 w-3.5 shrink-0 text-stone-500";
  const run = (fn?: () => void) => () => {
    onDismiss();
    fn?.();
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={t("conversation")}
      style={{ left: placed.left, top: placed.top }}
      /* A portal's events travel up the React tree, not the DOM one, so a
         click in here reached the row this menu belongs to and opened the
         thread — which marked it read again, and made "Mark as unread"
         look like it did nothing at all. */
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => e.stopPropagation()}
      className="mail-light-surface fixed z-[70] w-max min-w-[11rem] rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
    >
      {onSnooze ? (
        <button type="button" role="menuitem" autoFocus className={item} onClick={run(onSnooze)}>
          <RotateCwFadingClock className={icon} aria-hidden />
          {snoozed ? t("changeSnoozeEllipsis") : t("snoozeEllipsis")}
        </button>
      ) : null}
      {snoozed && onCancelSnooze ? (
        <button type="button" role="menuitem" className={item} onClick={run(onCancelSnooze)}>
          <RotateCwFadingClock className={icon} aria-hidden />
          {t("cancelSnooze")}
        </button>
      ) : null}
      <button type="button" role="menuitem" className={item} onClick={run(onToggleRead)}>
        <MailDotIcon className={icon} aria-hidden />
        {unread ? t("markAsRead") : t("markAsUnread")}
      </button>
      <button type="button" role="menuitem" className={item} onClick={run(onTogglePin)}>
        <Pin className={icon} aria-hidden />
        {pinned ? t("unpin") : t("pinToTop")}
      </button>
      {onArchive ? (
        <button type="button" role="menuitem" className={item} onClick={run(onArchive)}>
          <Archive className={icon} aria-hidden />
          {t("actionArchive")}
        </button>
      ) : null}
      {onTrash ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
          onClick={run(onTrash)}
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden />
          {t("actionDelete")}
        </button>
      ) : null}
    </div>,
    document.body
  );
}

function ThreadListRow({
  thread: t,
  selected,
  withYear,
  pinned,
  density = "comfortable",
  inCard = false,
  onNavy = false,
  narrow = false,
  onOpen,
  onTogglePin,
  onToggleRead,
  onSnooze,
  onCancelSnooze,
  onArchive,
  onTrash,
  dragKind,
}: {
  thread: MailThreadSummary;
  selected: boolean;
  withYear: boolean;
  pinned: boolean;
  density?: MailListDensity;
  /** Tighter horizontal padding inside time-group cards. */
  inCard?: boolean;
  /** Row sits on the navy list chrome. */
  onNavy?: boolean;
  /** Avatar-only rail (Signal-style narrow sidebar). */
  narrow?: boolean;
  onOpen: () => void;
  onTogglePin: () => void;
  /** Read when anything is unread; otherwise the newest message back to unread. */
  onToggleRead: () => void;
  onSnooze?: (untilIso: string) => void;
  onCancelSnooze?: () => void;
  /** Right-click actions that only make sense where the row can take them. */
  onArchive?: () => void;
  onTrash?: () => void;
  dragKind: "pin" | "folder";
}) {
  const say = useMailT();
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const compact = density === "compact";
  // The quick actions live on hover. While the snooze menu is open the pointer
  // is off the row, so the row holds them open until the menu closes.
  const [snoozeOpen, setSnoozeOpen] = React.useState(false);
  /** Where the right-click menu is, or null when it is not up. */
  const [menuAt, setMenuAt] = React.useState<{ x: number; y: number } | null>(
    null
  );
  /** Bumped to open the row's snooze menu from the right-click menu. */
  const [snoozeSignal, setSnoozeSignal] = React.useState(0);
  const padX = inCard ? "px-4" : "px-5";
  const draftKeys = useThreadDraftKeys();
  const hasDraft = draftKeys.has(threadDraftKey(t.account, t.threadId));
  const actionBtn = onNavy
    ? "rounded p-1 text-white/55 hover:bg-white/10 hover:text-white"
    : "rounded p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800";
  /** One size for every quick action icon, so the row reads as one control. */
  const actionIcon = "h-4 w-4";
  const snoozeBtn = onNavy
    ? "inline-flex items-center gap-1 text-xs font-medium text-teal-300 hover:text-teal-200"
    : "inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800";
  /** Hover shows the actions. An open snooze menu keeps them shown. */
  const rowActionsClass = cn(
    "shrink-0 items-center gap-0.5 group-hover:flex",
    snoozeOpen ? "flex" : "hidden"
  );
  /** The time, and the wake badge: what hover replaces with the actions. */
  const atRestClass = cn("shrink-0 group-hover:hidden", snoozeOpen && "hidden");
  const narrowTitle = [
    t.fromName,
    t.subject,
    hasDraft ? say("draft") : null,
    t.unread ? say("unread") : null,
  ]
    .filter(Boolean)
    .join(" — ");

  const rowActions = (
    <span
      className={rowActionsClass}
      onClick={(e) => e.stopPropagation()}
      // Enter on a button is that button's, not the row's — the row opens the
      // thread on Enter and would otherwise do both.
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title={t.unread ? "Mark as read" : "Mark as unread"}
        aria-label={t.unread ? "Mark as read" : "Mark as unread"}
        className={actionBtn}
        onClick={onToggleRead}
      >
        {/* The same icon whichever way the click will go, and the same one
            the reader uses. A control that changes shape reads as two
            controls; the label says which way it goes. */}
        <MailDotIcon className={actionIcon} />
      </button>
      {onSnooze ? (
        <SnoozeMenu
          onSnooze={onSnooze}
          onCancelSnooze={onCancelSnooze}
          currentUntil={t.snoozedUntil}
          onOpenChange={setSnoozeOpen}
          // Snooze… on the right-click menu opens this one, so both ways
          // through end at the same list of times.
          openSignal={snoozeSignal}
          trigger={
            <button
              type="button"
              title={t.snoozedUntil ? say("changeSnooze") : say("snooze")}
              aria-label={t.snoozedUntil ? say("changeSnooze") : say("snooze")}
              className={actionBtn}
            >
              <RotateCwFadingClock className={actionIcon} />
            </button>
          }
        />
      ) : null}
      <button
        type="button"
        title={pinned ? "Unpin" : "Pin"}
        aria-label={pinned ? "Unpin" : "Pin"}
        className={cn(
          "rounded p-1",
          pinned
            ? onNavy
              ? "text-teal-300 hover:bg-white/10"
              : "text-teal-600 hover:bg-teal-50"
            : onNavy
              ? "text-white/55 hover:bg-white/10 hover:text-teal-300"
              : "text-stone-500 hover:bg-stone-100 hover:text-teal-700"
        )}
        onClick={onTogglePin}
      >
        <Pin
          className={cn(
            actionIcon,
            pinned && (onNavy ? "fill-teal-300" : "fill-teal-600")
          )}
        />
      </button>
    </span>
  );

  return (
    <div
      ref={rowRef}
      data-thread-key={threadKey(t)}
      draggable
      onDragStart={(e) => {
        setMailThreadDragData(
          e.dataTransfer,
          { account: t.account, threadId: t.threadId },
          // The subject, or whoever it is from when there is none — enough
          // to know which conversation is in the air without covering the
          // folder it is being aimed at.
          t.subject?.trim() || t.fromName || t.fromEmail
        );
        if (dragKind === "pin") {
          e.dataTransfer.setData(
            "application/x-redd-mail-pin",
            JSON.stringify({ account: t.account, threadId: t.threadId })
          );
        }
      }}
      onDragEnd={() => {
        clearMailThreadDrag();
        // Dragend is followed by a click — swallow that one.
        const row = rowRef.current;
        if (!row) return;
        row.dataset.suppressClick = "1";
        window.setTimeout(() => {
          delete row.dataset.suppressClick;
        }, 0);
      }}
      role="button"
      tabIndex={0}
      title={narrow ? narrowTitle : undefined}
      aria-label={narrow ? narrowTitle : undefined}
      onClick={() => {
        if (rowRef.current?.dataset.suppressClick) {
          delete rowRef.current.dataset.suppressClick;
          return;
        }
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuAt({ x: e.clientX, y: e.clientY });
      }}
      className={cn(
        "group relative flex cursor-grab transition-colors active:cursor-grabbing",
        // No ring of the browser's own. A row is focusable so the arrow keys
        // can carry focus with the selection, and the selection is already
        // painted — the ring drew a second, louder marker over the top of it,
        // clipped by the list into a line above and below the row.
        "outline-none focus:outline-none focus-visible:outline-none",
        narrow
          ? "items-center justify-center px-1 py-1.5"
          : compact
            ? cn("items-center gap-2.5 py-1.5", padX)
            : cn("items-start gap-3 py-3", padX),
        /*
          The open thread, said twice: white, and a bar down the left.

          White because the list is cream now, and the plainest surface in
          the app reads as the one being attended to — the same way a
          message is a white sheet in a cream room. It was a teal wash, from
          when the list was white and a tint was the only way to say
          anything at all; two colors saying "this one" is one more than the
          bar already needs. Dark rewrites bg-white to its lifted navy, so
          the same rule holds there.
        */
        onNavy
          ? selected
            ? "bg-white/15"
            : "hover:bg-white/10"
          : selected
            ? "bg-white"
            : "hover:bg-[#f4f1ec]",
        selected &&
          "before:absolute before:inset-y-0 before:left-0 before:w-[4px] before:rounded-r-[1px] before:bg-teal-600"
      )}
    >
      <SenderAvatar
        name={t.fromName}
        email={t.fromEmail}
        logoUrl={t.crmLogoUrl}
        unread={t.unread}
        onNavy={onNavy}
        className={narrow ? "h-9 w-9" : compact ? "h-7 w-7" : undefined}
      />
      {narrow ? null : compact ? (
        <>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <p
              className={cn(
                "max-w-[34%] shrink-0 truncate text-sm font-semibold",
                onNavy ? "text-white" : "text-stone-900"
              )}
            >
              {t.fromName}
            </p>
            {hasDraft ? <DraftBadge /> : null}
            {t.hasCalendarInvite ? (
              <span
                className="inline-flex shrink-0"
                title={t.calendarInviteWhen || "Calendar invite"}
              >
                <Calendar
                  className={cn(
                    "h-3.5 w-3.5 stroke-[1.5]",
                    // A shade lighter than the grey it is drawn in. These
                    // are asides on a row whose subject is the point.
                    "text-[var(--mail-chrome-muted)] opacity-80"
                  )}
                  aria-hidden
                />
              </span>
            ) : null}
            {t.hasAttachments ? (
              <span
                className={cn(
                  "inline-flex shrink-0",
                  // Closer to what is before it than the row's own gap: the
                  // clip is a mark on the row, not another item in the
                  // line. Closer again behind the calendar, because there
                  // the two are one aside about the same thread.
                  t.hasCalendarInvite ? "-ml-[5px]" : "-ml-0.5"
                )}
                title={say("hasAttachments")}
              >
                <Paperclip
                  className={cn(
                    "h-3.5 w-3.5 stroke-[1.5]",
                    // The same grey as the calendar mark, and as the
                    // headings in the folder rail. Both say the same kind
                    // of thing about a thread — it carries something — and
                    // neither is worth a colour of its own on a list where
                    // teal already means the thread is the open one.
                    "text-[var(--mail-chrome-muted)]"
                  )}
                  aria-hidden
                />
              </span>
            ) : null}
            <p
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                onNavy ? "text-white/70" : "text-stone-600"
              )}
            >
              {t.subject}
            </p>
          </div>
          {t.snoozedUntil && onSnooze ? (
            <span
              className={atRestClass}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <SnoozeMenu
                onSnooze={onSnooze}
                onCancelSnooze={onCancelSnooze}
                currentUntil={t.snoozedUntil}
                trigger={
                  <button
                    type="button"
                    className={snoozeBtn}
                    title={say("changeSnooze")}
                  >
                    <Clock className="h-3 w-3" aria-hidden />
                    {formatSnoozeWakeLabel(t.snoozedUntil)}
                  </button>
                }
              />
            </span>
          ) : (
            <p
              className={cn(
                atRestClass,
                "text-xs",
                onNavy ? "text-white/40" : "text-stone-400"
              )}
            >
              {rowTime(t.lastAt, { withYear })}
            </p>
          )}
          {rowActions}
        </>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1.5">
              <p
                className={cn(
                  "min-w-0 truncate text-sm font-semibold",
                  onNavy ? "text-white" : "text-stone-900"
                )}
              >
                {t.fromName}
              </p>
              {hasDraft ? <DraftBadge /> : null}
            </div>
            {/* At rest: time (or wake time). On hover: read / snooze / pin. */}
            {t.snoozedUntil && onSnooze ? (
              <span
                className={atRestClass}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <SnoozeMenu
                  onSnooze={onSnooze}
                  onCancelSnooze={onCancelSnooze}
                  currentUntil={t.snoozedUntil}
                  trigger={
                    <button
                      type="button"
                      className={snoozeBtn}
                      title={say("changeSnooze")}
                    >
                      <Clock className="h-3 w-3" aria-hidden />
                      {formatSnoozeWakeLabel(t.snoozedUntil)}
                    </button>
                  }
                />
              </span>
            ) : (
              <p
                className={cn(
                  atRestClass,
                  "text-xs",
                  onNavy ? "text-white/40" : "text-stone-400"
                )}
              >
                {rowTime(t.lastAt, { withYear })}
              </p>
            )}
            {rowActions}
          </div>
          <p
            className={cn(
              "mt-0.5 truncate text-sm",
              onNavy ? "text-white/85" : "text-stone-700"
            )}
          >
            {t.subject}
          </p>
          <p
            className={cn(
              "mt-0.5 flex min-w-0 items-center gap-1.5 text-xs",
              onNavy ? "text-white/45" : "text-[#908985]"
            )}
          >
            {t.hasCalendarInvite ? (
              <span
                className={cn(
                  "inline-flex max-w-[55%] shrink-0 items-center gap-1 truncate rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                  onNavy
                    ? "border-white/15 bg-white/10 text-white/70"
                    : "border-stone-200 bg-[#f4f1ec] text-stone-600"
                )}
                title={t.calendarInviteWhen || "Calendar invite"}
              >
                <Calendar
                  className={cn(
                    "h-3 w-3 shrink-0 stroke-[1.5]",
                    "text-[var(--mail-chrome-muted)] opacity-80"
                  )}
                  aria-hidden
                />
                <span className="truncate">
                  {t.calendarInviteWhen || "Invite"}
                </span>
              </span>
            ) : null}
            {t.hasAttachments ? (
              <span
                className={cn(
                  "inline-flex shrink-0",
                  // Closer to what is before it than the row's own gap: the
                  // clip is a mark on the row, not another item in the
                  // line. Closer again behind the calendar, because there
                  // the two are one aside about the same thread.
                  t.hasCalendarInvite ? "-ml-[5px]" : "-ml-0.5"
                )}
                title={say("hasAttachments")}
              >
                <Paperclip
                  className={cn(
                    "h-3 w-3 shrink-0 stroke-[1.5]",
                    "text-[var(--mail-chrome-muted)] opacity-80"
                  )}
                  aria-hidden
                />
              </span>
            ) : null}
            <span className="min-w-0 truncate">{t.snippet}</span>
          </p>
        </div>
      )}
      {menuAt ? (
        <ThreadRowMenu
          x={menuAt.x}
          y={menuAt.y}
          unread={Boolean(t.unread)}
          pinned={pinned}
          snoozed={Boolean(t.snoozedUntil)}
          onSnooze={onSnooze ? () => setSnoozeSignal((n) => n + 1) : undefined}
          onCancelSnooze={onCancelSnooze}
          onToggleRead={onToggleRead}
          onTogglePin={onTogglePin}
          onArchive={onArchive}
          onTrash={onTrash}
          onDismiss={() => setMenuAt(null)}
        />
      ) : null}
    </div>
  );
}




/**
 * Connect affordances. The host decides what a sign-in actually does: the
 * planner sends the user to its OAuth routes, the standalone product runs the
 * flow itself. See `@/lib/mail/connect-mailbox`.
 */
function gmailOauthHref(email?: string): string {
  return mailConnectHref("gmail", email);
}

function outlookOauthHref(email?: string): string {
  return mailConnectHref("outlook", email);
}









function threadKey(t: { account: string; threadId: string }): string {
  return `${t.account}|${t.threadId}`;
}

/**
 * Collapse cc'd copies of the same conversation across mailboxes, mirroring
 * the server's unified dedupe: newest-first, first copy wins the row, any
 * copy being unread / carrying an invite marks the kept row.
 */
function dedupeThreadsByTip(rows: MailThreadSummary[]): MailThreadSummary[] {
  const sorted = [...rows].sort(
    (a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt)
  );
  const indexByKey = new Map<string, number>();
  const out: MailThreadSummary[] = [];
  for (const t of sorted) {
    const key = t.tipId || threadKey(t);
    const index = indexByKey.get(key);
    if (index == null) {
      indexByKey.set(key, out.length);
      out.push(t);
      continue;
    }
    const kept = out[index];
    const unread = kept.unread || t.unread;
    const hasCalendarInvite = kept.hasCalendarInvite || t.hasCalendarInvite;
    const hasAttachments = kept.hasAttachments || t.hasAttachments;
    const calendarInviteWhen = kept.calendarInviteWhen ?? t.calendarInviteWhen;
    if (
      unread !== kept.unread ||
      hasCalendarInvite !== kept.hasCalendarInvite ||
      hasAttachments !== kept.hasAttachments ||
      calendarInviteWhen !== kept.calendarInviteWhen
    ) {
      out[index] = {
        ...kept,
        unread,
        hasCalendarInvite,
        hasAttachments,
        calendarInviteWhen,
      };
    }
  }
  return out;
}

/**
 * The list cursor is a base64url JSON map of account → provider page token
 * (see encodeMailListCursor server-side). Per-account fetches each return a
 * single-entry cursor; decode/merge/re-encode so load-more keeps working.
 */
function decodeCursorTokens(
  cursor: string | null | undefined
): Record<string, string> {
  if (!cursor) return {};
  try {
    const parsed = JSON.parse(
      atob(cursor.replace(/-/g, "+").replace(/_/g, "/"))
    ) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [email, token] of Object.entries(parsed)) {
      if (typeof token === "string" && token) out[email] = token;
    }
    return out;
  } catch {
    return {};
  }
}

function encodeCursorTokens(tokens: Record<string, string>): string | null {
  const entries = Object.entries(tokens).filter(([email, token]) =>
    Boolean(email && token)
  );
  if (!entries.length) return null;
  try {
    return btoa(JSON.stringify(Object.fromEntries(entries)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  } catch {
    return null;
  }
}

/** Stable empty list for SSR — getServerSnapshot must not allocate each call. */
const EMPTY_MAIL_PINS: MailPinRecord[] = [];

function getServerMailPins(): MailPinRecord[] {
  return EMPTY_MAIL_PINS;
}

/** Pins are local; subscribe so every list/toolbar updates together. */
function useMailPins(): MailPinRecord[] {
  return React.useSyncExternalStore(
    subscribeMailPins,
    listMailPins,
    getServerMailPins
  );
}

const EMPTY_PERSON_PINS: MailPersonPin[] = [];

function getServerMailPersonPins(): MailPersonPin[] {
  return EMPTY_PERSON_PINS;
}

/** Pinned correspondents, for the by-person view. Also local. */
function useMailPersonPins(): MailPersonPin[] {
  return React.useSyncExternalStore(
    subscribeMailPersonPins,
    listMailPersonPins,
    getServerMailPersonPins
  );
}









/** How the left list is organised: one row per thread, or one per person. */
type MailViewMode = "threads" | "people";

const MAIL_VIEW_MODE_KEY = "redd-plan-mail-view-mode";

const MAIL_LIST_DENSITY_KEY = "redd-plan-mail-list-density";

/**
 * Builtin list tabs, or `custom:<id>` for user-defined people filters.
 * Snoozed is ephemeral (only when something is snoozed) and not reordered.
 */
type MailListTab = MailTab | "all" | "sent" | "snoozed" | string;

const MAIL_TAB_KEY = "redd-plan-mail-tab";
const MAIL_TAB_ORDER_KEY = "redd-plan-mail-tab-order";

/**
 * Builtin tabs that always exist (custom lists append after these by default).
 *
 * Sent is not among them: it lives at the top of the folders menu, with
 * Drafts, rather than taking a permanent chip beside the lists you read. It is
 * still a selectable view — see MAIL_OFF_TAB_VIEWS — and shows a chip of its
 * own while it is the one open, the way Snoozed does.
 */
const MAIL_LIST_TABS: MailListTab[] = ["all", "people", "other"];

/** Views that are selectable but keep no permanent chip in the tab row. */
const MAIL_OFF_TAB_VIEWS = ["sent", "drafts", "trash", "junk", "snoozed"];

/**
 * Views the provider holds in a folder of its own, so the list has to ask for
 * it by name. Snoozed is ours and Drafts has its own endpoint, so neither is
 * here.
 */
const SERVER_FOLDER_VIEWS = ["sent", "trash", "junk"];

function mailBuiltinTabLabels(t: MailT): Record<string, string> {
  return {
    all: t("tabAll"),
    people: mailPeopleTabLabel(t),
    other: t("tabOther"),
    sent: t("viewSent"),
    drafts: t("viewDrafts"),
    trash: t("viewTrash"),
    junk: t("viewJunk"),
    snoozed: t("viewSnoozed"),
  };
}

/**
 * What the search box offers to search, which is whatever is open.
 *
 * The field used to name the mailboxes — "Search all mail", "Search in
 * ulrik.lyngs · gmail" — and say nothing about the view, back when a search
 * ignored the view entirely. Now that a search stays inside it, this is the
 * half that changes and the mailboxes are named by the menu beside it.
 */
function mailSearchPlaceholder(input: {
  folderName: string | null;
  customListName: string | null;
  tab: string;
  t: MailT;
}): string {
  const { t } = input;
  if (input.folderName) return t("searchIn", { name: input.folderName });
  if (input.customListName) {
    return t("searchIn", { name: input.customListName });
  }
  switch (input.tab) {
    case "people":
      // The word the tab uses, in a sentence: "In Contacts" and "In CRM"
      // name a pile, and this has to name where the mail came from.
      return t(mailUsesCrmPeople() ? "searchFromCrm" : "searchFromContacts");
    case "other":
      return t("searchFromOthers");
    case "sent":
      return t("searchSent");
    case "drafts":
      return t("searchDrafts");
    case "trash":
      return t("searchTrash");
    case "junk":
      return t("searchJunk");
    case "snoozed":
      return t("searchSnoozed");
    default:
      return t("searchAll");
  }
}

/**
 * What an empty list shows while it is being fetched.
 *
 * Not a skeleton. Grey bars shaped like rows are a promise that rows are
 * about to appear in a moment, which is a fair thing to say about a render
 * and an unfair one about a round trip to Google — a big folder takes
 * seconds, and for all of them the reader is watching something that looks
 * like mail it cannot read. A spinner does not pretend to be the content,
 * and the line under it says where the wait is: not that the app is stuck,
 * but that a server is being asked.
 */
function MailListLoading({
  provider,
  onNavy,
  narrow,
}: {
  provider: string;
  onNavy: boolean;
  narrow: boolean;
}) {
  const t = useMailT();
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center gap-2 py-10 text-center",
        narrow ? "px-2" : "px-5"
      )}
    >
      <Loader2
        aria-hidden
        className={cn(
          "h-5 w-5 animate-spin",
          onNavy ? "text-white/60" : "text-stone-400"
        )}
      />
      {narrow ? null : (
        <>
          <p
            className={cn(
              "text-sm",
              onNavy ? "text-white/80" : "text-stone-600"
            )}
          >
            {t("loadingFromProvider", { provider })}
          </p>
          <p
            className={cn(
              "text-xs",
              onNavy ? "text-white/50" : "text-stone-400"
            )}
          >
            {t("loadingFolderHint")}
          </p>
        </>
      )}
    </div>
  );
}

function subscribeCustomLists(onChange: () => void): () => void {
  window.addEventListener(MAIL_CUSTOM_LISTS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(MAIL_CUSTOM_LISTS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const EMPTY_CUSTOM_LISTS_SNAPSHOT: MailCustomList[] = [];

function useMailCustomLists(): MailCustomList[] {
  return React.useSyncExternalStore(
    subscribeCustomLists,
    readCustomLists,
    () => EMPTY_CUSTOM_LISTS_SNAPSHOT
  );
}

function readStoredMailListTab(customLists: MailCustomList[]): MailListTab {
  if (typeof window === "undefined") return "people";
  // Scheduled lists win when you open Mail during their window, and so do
  // the built-in filters, which can now be scheduled the same way.
  const scheduled =
    scheduledCustomListTabId(customLists) ??
    scheduledBuiltinTabId(MAIL_LIST_TABS);
  if (scheduled) return scheduled;
  try {
    const stored = localStorage.getItem(MAIL_TAB_KEY);
    if (!stored) return "people";
    if (MAIL_OFF_TAB_VIEWS.includes(stored) || MAIL_LIST_TABS.includes(stored)) {
      return stored;
    }
    const listId = parseCustomListTabId(stored);
    if (listId && customLists.some((l) => l.id === listId)) return stored;
  } catch {
    /* private mode */
  }
  return "people";
}

/** Keep known tabs (builtins + existing custom lists), append any missing. */
function normalizeMailListTabOrder(
  raw: unknown,
  customLists: MailCustomList[]
): MailListTab[] {
  const customTabs = customLists.map((l) => customListTabId(l.id));
  const allowed = new Set<string>([...MAIL_LIST_TABS, ...customTabs]);
  const seen = new Set<string>();
  const next: MailListTab[] = [];
  if (Array.isArray(raw)) {
    for (const id of raw) {
      if (typeof id === "string" && allowed.has(id) && !seen.has(id)) {
        seen.add(id);
        next.push(id);
      }
    }
  }
  for (const id of MAIL_LIST_TABS) {
    if (!seen.has(id)) next.push(id);
  }
  for (const id of customTabs) {
    if (!seen.has(id)) next.push(id);
  }
  return next;
}

function readStoredMailListTabOrder(
  customLists: MailCustomList[]
): MailListTab[] {
  if (typeof window === "undefined") return MAIL_LIST_TABS;
  try {
    const stored = localStorage.getItem(MAIL_TAB_ORDER_KEY);
    if (!stored) return normalizeMailListTabOrder(null, customLists);
    return normalizeMailListTabOrder(JSON.parse(stored), customLists);
  } catch {
    return normalizeMailListTabOrder(null, customLists);
  }
}

/** Drag-reorderable tab order (builtins + custom lists), persisted. */
function useMailListTabOrder(
  customLists: MailCustomList[]
): [MailListTab[], (order: MailListTab[]) => void] {
  const [order, setOrder] = React.useState<MailListTab[]>(MAIL_LIST_TABS);
  const customKey = customLists.map((l) => l.id).join("|");

  React.useLayoutEffect(() => {
    setOrder(readStoredMailListTabOrder(customLists));
    // customLists identity changes every read; key on ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customKey]);

  const update = React.useCallback(
    (next: MailListTab[]) => {
      const normalized = normalizeMailListTabOrder(next, customLists);
      setOrder(normalized);
      try {
        localStorage.setItem(MAIL_TAB_ORDER_KEY, JSON.stringify(normalized));
      } catch {
        /* private mode */
      }
    },
    [customLists]
  );

  return [order, update];
}

/**
 * One filter, on the row the funnel opens.
 *
 * Lit when it is the one narrowing the list. The row holds the built-in
 * four, the reader's own lists, whichever of Sent/Drafts/Trash/Junk is open,
 * and the deleted-mail switch — so they all wear the same shape.
 */
function chipClass(active: boolean): string {
  return cn(
    "shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[13px] font-medium transition-colors",
    active
      ? "border-teal-600 bg-teal-600/10 text-[var(--mail-chrome-fg)]"
      : "border-[var(--mail-chrome-border)] text-[var(--mail-chrome-muted)] hover:text-[var(--mail-chrome-fg)]"
  );
}

function SortableMailListTab({
  id,
  label,
  active,
  onSelect,
  onEdit,
  suppressClick,
}: {
  id: MailListTab;
  label: string;
  active: boolean;
  onSelect: () => void;
  /** Right-click (custom lists) opens the editor. */
  onEdit?: () => void;
  suppressClick: React.MutableRefObject<boolean>;
}) {
  const t = useMailT();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (suppressClick.current || isDragging) return;
        onSelect();
      }}
      onContextMenu={
        onEdit
          ? (e) => {
              e.preventDefault();
              onEdit();
            }
          : undefined
      }
      title={
        onEdit
          ? t("listTabHintOwn", { name: label })
          : t("listTabHint", { name: label })
      }
      aria-label={
        onEdit
          ? t("listTabHintOwnAria", { name: label })
          : t("listTabHint", { name: label })
      }
      className={cn(
        // A chip, not an underlined tab: these are filters now, and a filter
        // is something you switch on rather than a place you are standing.
        chipClass(active),
        "touch-none",
        isDragging && "z-10 cursor-grabbing opacity-80"
      )}
    >
      {label}
    </button>
  );
}

/** Sync client read for the list key matching the persisted tab (SSR → null). */
function peekMountCachedList(viewerId: string): MailListCacheEntry | null {
  if (typeof window === "undefined") return null;
  const tab = readStoredMailListTab(readCustomLists());
  // Don't paint a snoozed cache before we know the tab is available.
  if (tab === "snoozed") return null;
  const folder =
    tab === "sent"
      ? "sent"
      : tab === "trash"
        ? "trash"
        : tab === "junk"
          ? "junk"
          : "inbox";
  const keyed = readCachedList(viewerId, mailListCacheKey(folder, ""));
  if (keyed?.threads.length) return keyed;
  // Fall back to this viewer's page snapshot only (never another admin's).
  const snap = getPageSnapshot<MailPageSnapshot>(mailPageCacheKey(viewerId));
  if (snap?.ownerId === viewerId && snap.threads?.length) {
    return { threads: snap.threads, nextCursor: snap.listCursor ?? null };
  }
  return null;
}

/** Update threads in the cache while keeping the existing pagination cursor. */
function patchCachedThreads(
  viewerId: string,
  key: string,
  threads: MailThreadSummary[]
): void {
  const prev = readCachedList(viewerId, key);
  writeCachedList(viewerId, key, {
    threads,
    nextCursor: prev?.nextCursor ?? null,
  });
}

/** Threads/People list mode, persisted across sessions. */
function useMailViewMode(): [MailViewMode, (mode: MailViewMode) => void] {
  const [mode, setMode] = React.useState<MailViewMode>("threads");

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(MAIL_VIEW_MODE_KEY);
      if (stored === "people" || stored === "threads") setMode(stored);
    } catch {
      /* private mode */
    }
  }, []);

  const update = React.useCallback((next: MailViewMode) => {
    setMode(next);
    try {
      localStorage.setItem(MAIL_VIEW_MODE_KEY, next);
    } catch {
      /* private mode */
    }
  }, []);

  return [mode, update];
}

/** List row density, persisted across sessions. Default is comfortable. */
function useMailListDensity(): [
  MailListDensity,
  (density: MailListDensity) => void,
] {
  const [density, setDensity] =
    React.useState<MailListDensity>("comfortable");

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(MAIL_LIST_DENSITY_KEY);
      if (stored === "comfortable" || stored === "compact") setDensity(stored);
    } catch {
      /* private mode */
    }
  }, []);

  const update = React.useCallback((next: MailListDensity) => {
    setDensity(next);
    try {
      localStorage.setItem(MAIL_LIST_DENSITY_KEY, next);
    } catch {
      /* private mode */
    }
  }, []);

  return [density, update];
}





/** Selected list tab, persisted so a refresh keeps you where you were. */
function useMailListTab(
  customLists: MailCustomList[]
): [MailListTab, (tab: MailListTab) => void] {
  // Default matches SSR; restore localStorage / schedule in layout effect.
  const [tab, setTab] = React.useState<MailListTab>("people");
  // Include schedule fields so editing "default at set times" re-evaluates.
  const customKey = customLists
    .map(
      (l) =>
        `${l.id}:${l.scheduleDefault ? "1" : "0"}:${l.scheduleFrom ?? ""}:${l.scheduleTo ?? ""}:${(l.scheduleDays ?? []).join(",")}`
    )
    .join("|");

  React.useLayoutEffect(() => {
    setTab(readStoredMailListTab(customLists));
    // Re-validate when custom lists / schedules change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customKey]);

  const update = React.useCallback((next: MailListTab) => {
    setTab(next);
    try {
      localStorage.setItem(MAIL_TAB_KEY, next);
    } catch {
      /* private mode */
    }
  }, []);

  return [tab, update];
}

type PersonRow = {
  /** Stable key: counterpart email, or the participant set for group mail. */
  key: string;
  isGroup: boolean;
  name: string;
  /** Counterpart address for one-on-one rows; empty for group rows. */
  email: string;
  /** External correspondents on the conversation (1 for one-on-one rows). */
  participantCount: number;
  /** Newest first. */
  threads: MailThreadSummary[];
  lastAt: string;
  unread: boolean;
  crmName?: string;
  crmLogoUrl?: string;
};

/**
 * Title for a multi-person row: list the other people (not "you"). Two names
 * stay full; larger groups keep the first two and a +N so the list stays short.
 */
function groupPeopleLabel(
  people: { name: string; email: string }[]
): string {
  const labels = people.map((p) => p.name || p.email).filter(Boolean);
  if (labels.length === 0) return "Group";
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

/**
 * Collapse threads into one row per correspondent, iMessage-style. Identity is
 * the counterpart's email address — never the CRM record, which is usually an
 * organization and would lump colleagues together.
 *
 * **One other person** → one-on-one row under them. **Two or more others**
 * (you + David + Chris) → a group row keyed by the participant set, so it is
 * not filed under whoever was first in To.
 *
 * When the tip is from us (Sent), `fromName`/`fromEmail` should already be the
 * first external To. We also strip self here: list summaries can still include
 * a personal alias as "external" until own-identity env is loaded / refreshed.
 */
function groupThreadsByPerson(threads: MailThreadSummary[]): PersonRow[] {
  const rows = new Map<string, PersonRow>();
  for (const t of threads) {
    // Rows from an older cache have no participant list; fall back to the
    // counterpart so the view still works until the next refresh.
    const raw = t.externalParticipants?.length
      ? t.externalParticipants
      : [{ name: t.fromName, email: t.fromEmail }];
    const accountKey = normalizeEmail(t.account);
    const externals = raw.filter((p) => {
      if (!p.email) return false;
      if (normalizeEmail(p.email) === accountKey) return false;
      if (isOwnPersonalAddress(p.email)) return false;
      return true;
    });
    // Prefer the row's counterpart (fromEmail) when it is truly external —
    // on Sent that is first To — not Map insertion order, and never "you".
    const lead =
      externals.find(
        (p) =>
          p.email.toLowerCase() === t.fromEmail.toLowerCase() &&
          !isOwnPersonalAddress(p.email)
      ) ??
      externals[0] ?? { name: t.fromName, email: t.fromEmail };
    // You + one other = 1:1. You + two others (e.g. David and Chris) = group.
    const isGroup = externals.length >= 2;
    // Lead first in the title, then the rest in list order (To order on send).
    const named =
      isGroup && lead.email
        ? [
            lead,
            ...externals.filter(
              (p) => p.email.toLowerCase() !== lead.email.toLowerCase()
            ),
          ]
        : externals;
    const key = isGroup
      ? `group:${externals
          .map((p) => p.email.toLowerCase())
          .sort()
          .join(",")}`
      : `person:${lead.email.toLowerCase()}`;

    const existing = rows.get(key);
    if (existing) {
      existing.threads.push(t);
      if (t.unread) existing.unread = true;
      if (!existing.crmName && t.crmName) existing.crmName = t.crmName;
      if (!existing.crmLogoUrl && t.crmLogoUrl) {
        existing.crmLogoUrl = t.crmLogoUrl;
      }
      // Prefer a real external name over a stale "you" label on older tips.
      if (
        lead.name &&
        lead.email &&
        !existing.isGroup &&
        existing.email.toLowerCase() === lead.email.toLowerCase() &&
        (!existing.name ||
          existing.name.toLowerCase() === existing.email.toLowerCase())
      ) {
        existing.name = lead.name;
      }
    } else {
      rows.set(key, {
        key,
        isGroup,
        name: isGroup
          ? groupPeopleLabel(named)
          : lead.name || lead.email,
        email: isGroup ? "" : lead.email,
        participantCount: externals.length,
        threads: [t],
        lastAt: t.lastAt,
        unread: t.unread,
        crmName: t.crmName,
        crmLogoUrl: t.crmLogoUrl,
      });
    }
  }
  // Input is newest-first, so insertion order already sorts rows by most
  // recent message.
  return [...rows.values()];
}




/**
 * Sender glyph for list rows: CRM logo when known, otherwise hashed initials
 * (compose contact-list style). Unread sits on the avatar corner.
 */
function SenderAvatar({
  name,
  email,
  logoUrl,
  unread = false,
  onNavy = false,
  className,
}: {
  name: string;
  email: string;
  logoUrl?: string;
  unread?: boolean;
  onNavy?: boolean;
  className?: string;
}) {
  const [logoFailed, setLogoFailed] = React.useState(false);
  React.useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);
  const [photoFailed, setPhotoFailed] = React.useState(false);

  const teamPhoto = teamAvatarSrc(email);
  const showLogo = Boolean(logoUrl) && !logoFailed;
  const seed = email || name;

  return (
    <span
      aria-hidden
      className={cn("relative h-9 w-9 shrink-0", className)}
    >
      {teamPhoto && !photoFailed ? (
        <img
          src={teamPhoto}
          alt=""
          className="h-full w-full rounded-full object-cover"
          onError={() => setPhotoFailed(true)}
        />
      ) : showLogo ? (
        <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
          <ExternalAssetImage
            src={logoUrl}
            alt=""
            className="h-full w-full object-contain"
            onError={() => setLogoFailed(true)}
          />
        </span>
      ) : (
        <span
          className={cn(
            "flex h-full w-full items-center justify-center rounded-full text-[11px] font-semibold",
            avatarStyle(seed.toLowerCase())
          )}
        >
          {senderInitials(name, email)}
        </span>
      )}
      {unread ? (
        <span
          className={cn(
            "absolute right-0 top-0 h-2 w-2 rounded-full ring-2",
            onNavy
              ? "bg-teal-400 ring-reddNavy"
              : "bg-teal-600 ring-[#faf8f5]"
          )}
        />
      ) : null}
    </span>
  );
}

/** Empty selection means every connected mailbox is in scope. */
function isMailboxScopeAll(selected: string[], accounts: string[]): boolean {
  return selected.length === 0 || selected.length >= accounts.length;
}

function accountPassesMailboxScope(
  account: string,
  selected: string[],
  accounts: string[]
): boolean {
  if (isMailboxScopeAll(selected, accounts)) return true;
  const key = account.toLowerCase();
  return selected.some((email) => email.toLowerCase() === key);
}

/**
 * Local search, for the wait before the server answers.
 *
 * The provider searches whole message bodies and widens the query on the way
 * out (see `expandMailSearchQuery`). This cannot do either, so it must never
 * run over a result the server has already returned — it would hide real hits
 * whose match is in the body rather than the snippet. It runs only while the
 * rows on screen belong to an older query.
 */
function searchTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function matchesTokens(haystack: string, tokens: string[]): boolean {
  const hay = haystack.toLowerCase();
  return tokens.every((token) => hay.includes(token));
}

function threadHaystack(t: MailThreadSummary): string {
  return [t.fromName, t.fromEmail, t.subject, t.snippet]
    .filter(Boolean)
    .join(" ");
}

/** `kasper.hornbaek@…` also answers to "kasper hornbaek". */
function emailLocalWords(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at).replace(/[._+\-]+/g, " ") : "";
}

function mailboxScopeKey(selected: string[], accounts: string[]): string {
  if (isMailboxScopeAll(selected, accounts)) return "all";
  return [...selected]
    .map((e) => e.toLowerCase())
    .sort()
    .join(",");
}

/** Single-account API ops only when exactly one mailbox is selected. */
function mailboxScopeApiAccount(
  selected: string[],
  accounts: string[]
): string | undefined {
  if (isMailboxScopeAll(selected, accounts)) return undefined;
  if (selected.length === 1) return selected[0];
  return undefined;
}

/**
 * What searching does, from inside the search field.
 *
 * One thing so far, and it belongs here rather than among the filters: those
 * say which pile of mail to show, and this says whether a search reaches into
 * mail that was thrown away. Nobody goes looking for it until they are
 * already typing, which is exactly where this is.
 */
function SearchOptionsMenu({
  includeDeleted,
  onIncludeDeletedChange,
}: {
  includeDeleted: boolean;
  onIncludeDeletedChange: (next: boolean) => void;
}) {
  const t = useMailT();
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("searchOptions")}
          aria-label={t("searchOptions")}
          className={cn(
            "ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
            // Lit while it is doing something, so a search that reaches into
            // deleted mail says so without being opened.
            includeDeleted
              ? "bg-teal-50 text-teal-700"
              : "text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          )}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <MailPopoverContent align="start" className="w-64 p-1">
        <button
          type="button"
          role="checkbox"
          aria-checked={includeDeleted}
          onClick={() => onIncludeDeletedChange(!includeDeleted)}
          className="flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-sm text-stone-800 hover:bg-stone-100"
        >
          <span className="min-w-0 flex-1">{t("includeDeleted")}</span>
          <span
            aria-hidden
            className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
              includeDeleted
                ? "border-teal-600 bg-teal-600 text-white"
                : "border-stone-300"
            )}
          >
            {includeDeleted ? <Check className="h-3 w-3" /> : null}
          </span>
        </button>
      </MailPopoverContent>
    </Popover>
  );
}

/**
 * Pin and archive, on a person row, revealed on hover.
 *
 * The same two the thread rows offer, meaning the same two things: pin keeps
 * this correspondent at the top of the list, and archive clears every
 * conversation with them out of the inbox.
 */
function PersonRowActions({
  row,
  pinned,
  onNavy,
  onTogglePin,
  onArchive,
  onToggleRead,
}: {
  row: PersonRow;
  pinned: boolean;
  onNavy: boolean;
  onTogglePin: () => void;
  onArchive: () => void;
  /** Read when anything is unread; otherwise the newest back to unread. */
  onToggleRead: () => void;
}) {
  const say = useMailT();
  const plain = onNavy
    ? "rounded p-1 text-white/55 hover:bg-white/10 hover:text-white"
    : "rounded p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800";
  const count = row.threads.length;
  const unreadCount = row.threads.filter((t) => t.unread).length;
  return (
    <span className="ml-1 hidden shrink-0 items-center gap-0.5 group-hover:flex">
      <button
        type="button"
        title={
          unreadCount
            ? unreadCount === 1
              ? say("markAsRead")
              : say("markAllAsRead", { count: unreadCount })
            : say("markNewestUnread")
        }
        aria-label={
          unreadCount
            ? say("markPersonRead", { name: row.name })
            : say("markPersonNewestUnread", { name: row.name })
        }
        className={plain}
        onClick={onToggleRead}
      >
        <MailDotIcon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title={pinned ? say("unpin") : say("pinToTop")}
        aria-label={
          pinned
            ? say("unpinPerson", { name: row.name })
            : say("pinPerson", { name: row.name })
        }
        className={cn(
          "rounded p-1",
          pinned
            ? onNavy
              ? "text-teal-300 hover:bg-white/10"
              : "text-teal-600 hover:bg-teal-50"
            : onNavy
              ? "text-white/55 hover:bg-white/10 hover:text-teal-300"
              : "text-stone-500 hover:bg-stone-100 hover:text-teal-700"
        )}
        onClick={onTogglePin}
      >
        <Pin
          className={cn(
            "h-3.5 w-3.5",
            pinned && (onNavy ? "fill-teal-300" : "fill-teal-600")
          )}
        />
      </button>
      <button
        type="button"
        // Archiving one thread and archiving eleven are different acts, and the
        // label is the only warning there is.
        title={
          count === 1
            ? say("archiveConversation")
            : say("archiveAllCount", { count })
        }
        aria-label={
          count === 1
            ? say("archiveConversationWith", { name: row.name })
            : say("archiveAllWith", { count, name: row.name })
        }
        className={plain}
        onClick={onArchive}
      >
        <Archive className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

function PersonAvatar({
  row,
  onNavy = false,
  className,
}: {
  row: PersonRow;
  onNavy?: boolean;
  className?: string;
}) {
  if (row.isGroup) {
    return (
      <span aria-hidden className={cn("relative h-9 w-9 shrink-0", className)}>
        <span className="flex h-full w-full items-center justify-center rounded-full bg-stone-700 text-xs font-semibold text-white">
          {row.participantCount}
        </span>
        {row.unread ? (
          <span
            className={cn(
              "absolute right-0 top-0 h-2 w-2 rounded-full ring-2",
              onNavy
                ? "bg-teal-400 ring-reddNavy"
                : "bg-teal-600 ring-[#faf8f5]"
            )}
          />
        ) : null}
      </span>
    );
  }
  return (
    <SenderAvatar
      name={row.name}
      email={row.email}
      logoUrl={row.crmLogoUrl}
      unread={row.unread}
      onNavy={onNavy}
      className={className}
    />
  );
}

































export type MailPageSnapshot = {
  /** Clerk user id (planner) or local owner id (Mac app). */
  ownerId: string;
  accounts: string[];
  /** Last-painted thread list (any folder/filter). */
  threads: MailThreadSummary[];
  listCacheKey: string;
  listCursor: string | null;
};

/**
 * How long the folder rail takes to slide. Keep in step with the
 * `duration-200` on the rail's own wrapper.
 */
const RAIL_SLIDE_MS = 200;

/**
 * What gives way as the window narrows, and in what order.
 *
 * Not everything at once. Squeezing all three panes together is what makes
 * a small mail window unpleasant in every client that does it: at the
 * bottom of the range nothing is comfortable and nothing has been chosen.
 * Something goes first, and it should be whatever is least load-bearing.
 *
 * The picture in the empty reading pane goes first — see MailRestPanel. It
 * is there because there was space for it, and shrunk into a narrow pane it
 * is a stamp rather than a rest. The line under it stays: a sentence needs
 * no room to be worth reading, and a pane with nothing in it at all says
 * less than one with a few words.
 *
 * The folder rail goes next, and closes rather than floating over the list.
 * An overlay would cover the very list a conversation is dragged *from*
 * when it is filed into that rail, which is the gesture the rail exists
 * for. Closed, the toggle returns to the tab row and a thread dragged at it
 * opens the rail again — so filing survives at any width.
 *
 * The list's own ladder — full, then narrow, then hidden — stays where it
 * is, as the floor rather than the rule.
 */
const RAIL_GIVES_WAY_BELOW = 760;

/**
 * How much longer than that it stays mounted on the way out.
 *
 * The clock starts when the close is asked for; the slide starts at the
 * next paint, a frame or two later. Timed to the millisecond, the rail was
 * unmounted with the last frames of its exit still to draw — which is
 * exactly what "it slides open but snaps shut" looks like.
 */
const RAIL_SLIDE_GRACE_MS = 80;

/**
 * The gap the rail is resized by, between it and the list. Keep in step with
 * the `w-1` on the separator.
 */
const RAIL_GUTTER = 4;

/**
 * How far the thread list holds its contents in from its own left edge. Keep
 * in step with the `px-5` on the list's controls column.
 */
const LIST_COLUMN_PAD = 20;

/**
 * The folder the list is showing.
 *
 * `account` is the mailbox it was opened from, or null for every mailbox at
 * once — which is what the old merged folder menu has always meant, and
 * still means.
 */
type ActiveMailFolder = MailFolder & {
  account: string | null;
  /** Set when the provider manages it — see `MailFolderRole`. */
  role?: MailFolderRole;
  /**
   * The row stands for a search rather than a folder.
   *
   * Gmail's Archived, Sent and Bin. There is no label to ask for, so the
   * list is asked for the view by name instead — the same views the tabs
   * already use, narrowed to one mailbox.
   */
  virtual?: boolean;
};

/** A virtual row's role, as the view the thread list already knows. */
const ROLE_VIEW: Record<MailFolderRole, string> = {
  archive: "archived",
  drafts: "drafts",
  sent: "sent",
  trash: "trash",
};

/**
 * What names this folder view apart from another.
 *
 * The mailbox as well as the name. Two accounts can each hold an Archive
 * and they are two different lists; keyed by the name alone, opening one
 * painted the other's rows until the fetch came back and replaced them.
 */
function folderViewToken(folder: ActiveMailFolder | null): string {
  if (!folder) return "";
  return folder.account ? `${folder.account}|${folder.name}` : folder.name;
}

export function MailPage({
  accounts,
  viewerId,
  initialList,
  ownAddresses,
  ownDomains,
  avatars,
  ownIdentity,
  onOwnIdentityChange,
}: {
  accounts: string[];
  /** Clerk user id (planner) or local owner id (Mac app) — scopes paint caches. */
  viewerId: string;
  /** From InstantTabPaint snapshot — paints threads before the fetch returns. */
  initialList?: MailListCacheEntry & { key: string };
  /**
   * The reader's own mailboxes.
   *
   * **Not the connected list.** A connected mailbox is not necessarily the
   * reader's: a team shares `team@`, and replies to it must still reach the
   * colleagues who read it. Only a host knows which of its mailboxes are one
   * person's, so only a host says.
   */
  ownAddresses?: string[];
  /**
   * Domains whose every address is a colleague. Only for a host that has an
   * organization; left unset, nobody is a colleague, which is right for one
   * person with a personal mailbox.
   */
  ownDomains?: string[];
  /**
   * Faces the host knows: `own` for every one of the reader's own mailboxes,
   * `byAddress` for anyone else. Without it, everyone gets hashed initials.
   */
  avatars?: { own?: string; byAddress?: Record<string, string> };
  /**
   * Aliases and colleague domains as the host stores them, without the
   * connected mailboxes. Only for a host that keeps identity at runtime; one
   * that reads it from server environment leaves both of these out and the
   * settings fields stay hidden.
   */
  ownIdentity?: { addresses: string[]; domains: string[] };
  onOwnIdentityChange?: (next: {
    addresses: string[];
    domains: string[];
  }) => void;
}) {
  const t = useMailT();
  // Before anything renders: reply-stripping, the "You" label, and the
  // in-contacts split all ask whether an address is the reader's, and the
  // answer is nothing until it is set. useMemo, not useEffect — the first
  // render already asks.
  React.useMemo(() => {
    setOwnMailIdentity({
      addresses: ownAddresses ?? [],
      domains: ownDomains ?? [],
    });
    setMailAvatars({ own: avatars?.own, byAddress: avatars?.byAddress ?? {} });
  }, [ownAddresses, ownDomains, avatars]);
  const pageSnapKey = mailPageCacheKey(viewerId);
  React.useLayoutEffect(() => {
    scrubLegacySharedMailCaches();
  }, []);
  const customLists = useMailCustomLists();
  const customListById = React.useMemo(() => {
    const map = new Map<string, MailCustomList>();
    for (const list of customLists) map.set(list.id, list);
    return map;
  }, [customLists]);
  const [tab, setTab] = useMailListTab(customLists);
  const [tabOrder, setTabOrder] = useMailListTabOrder(customLists);
  const tabReorderSuppressClick = React.useRef(false);
  const tabReorderSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  /** null = closed; create = new list; string = editing that list id. */
  const tabSchedules = useTabSchedules();
  const [listEditor, setListEditor] = React.useState<
    null | "create" | string
  >(null);
  /**
   * The built-in filter whose schedule is open, if that is what is open.
   *
   * The editor takes one of three things: nothing (a new list), one of the
   * reader's lists, or one of the four built-in filters — and for a built-in
   * there is only ever the schedule to change.
   */
  const editingBuiltin =
    typeof listEditor === "string" && MAIL_LIST_TABS.includes(listEditor)
      ? listEditor
      : null;
  const editingList =
    typeof listEditor === "string"
      ? customListById.get(listEditor) ?? null
      : null;
  const activeCustomListId = parseCustomListTabId(tab);
  const activeCustomList = activeCustomListId
    ? customListById.get(activeCustomListId) ?? null
    : null;
  const pins = useMailPins();
  const pinKeySet = React.useMemo(
    () => new Set(pins.map((p) => `${p.account}|${p.threadId}`)),
    [pins]
  );

  // Fetch the Quill chunk right away, so the first Reply doesn't flash a
  // composer without its editor while the chunk downloads.
  React.useEffect(() => {
    preloadRichTextEditor();
  }, []);
  // Drop local drafts idle for ~90 days (also refreshes Draft badges).
  React.useEffect(() => {
    pruneExpiredMailDrafts();
  }, []);
  // Local copy so hide/show in the accounts menu updates chips + list immediately
  // (InstantTabPaint snapshots / router.refresh otherwise lag a full remount).
  const [accountEmails, setAccountEmails] = React.useState(() =>
    sortAccountsByOrder(accounts, readAccountOrder())
  );
  React.useEffect(() => {
    const follow = () =>
      setAccountEmails(sortAccountsByOrder(accounts, readAccountOrder()));
    follow();
    // The settings panel arranges them too, and it is a different tree.
    window.addEventListener(MAIL_ACCOUNT_ORDER_EVENT, follow);
    return () => window.removeEventListener(MAIL_ACCOUNT_ORDER_EVENT, follow);
  }, [accounts]);
  const [viewMode, setViewMode] = useMailViewMode();
  const [listDensity, setListDensity] = useMailListDensity();
  const colorMode = useMailColorMode();
  const chromeDark = colorMode === "dark";
  // The reader's own size for the whole app — see use-ui-scale.
  useApplyUiScale(useUiScale()[0]);
  const { drafts, loading: draftsLoading, refresh: refreshDrafts } =
    useMailDrafts();
  const draftsView = tab === "drafts";
  const accountLabels = React.useMemo(
    () => accountChipLabels(accountEmails),
    [accountEmails]
  );
  // Which person digest is open in the reading pane (People view only).
  const [selectedPersonKey, setSelectedPersonKey] = React.useState<
    string | null
  >(null);
  /**
   * Mailboxes in the list and in search. Empty = all connected accounts.
   * Search always covers every folder on a selected mailbox.
   */
  const [mailboxScopeEmails, setMailboxScopeEmails] = React.useState<string[]>(
    []
  );
  // Drop scope picks that are no longer connected.
  React.useEffect(() => {
    const known = new Set(accountEmails.map((e) => e.toLowerCase()));
    setMailboxScopeEmails((prev) => {
      const next = prev.filter((e) => known.has(e.toLowerCase()));
      return next.length === prev.length ? prev : next;
    });
  }, [accountEmails]);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  /**
   * Open user folder (Gmail label); null = inbox tabs.
   *
   * `account` names the mailbox it was opened from, which the rail always
   * knows and the old menu never did: that menu showed one merged row per
   * name, so opening Archive meant every Archive. A null account still
   * means that — every mailbox — and is what the menu keeps doing.
   */
  const [activeFolder, setActiveFolder] =
    React.useState<ActiveMailFolder | null>(null);
  // Folders are shared across mailboxes — don't refetch when the mailbox
  // scope changes. Defer slightly so the inbox thread list wins the first
  // network slot.
  const {
    folders,
    accountFolders,
    loading: foldersLoading,
    refresh: refreshFolders,
  } = useMailFolders("all", { deferMs: 400 });
  const [railOpen, setRailOpen] = useFolderRailOpen();
  const {
    width: railWidth,
    resizing: railResizing,
    startResize: startRailResize,
  } = useFolderRailWidth();
  /**
   * Named in the waiting state, so a slow list says where it is waiting.
   *
   * The mailboxes this view actually asks, not every one connected. A
   * folder opened from the rail belongs to one account, and telling its
   * reader we are "loading from Gmail and Outlook" names a provider that
   * is not being asked and cannot be the reason for the wait.
   */
  const mailProviderNames = useMailProviderNames(
    React.useMemo(() => {
      if (activeFolder?.account) return [activeFolder.account];
      return isMailboxScopeAll(mailboxScopeEmails, accountEmails)
        ? accountEmails
        : mailboxScopeEmails;
    }, [activeFolder, mailboxScopeEmails, accountEmails])
  );
  /**
   * The rail is built once and then only ever widened or narrowed.
   *
   * It used to be mounted by the click that opened it, and that is what
   * the pause before the slide was: React building a few hundred folder
   * rows, on the main thread, before any width could change. The frames
   * spent waiting for a first paint to animate from were on top of that.
   * None of it was the animation; all of it was work done at the worst
   * possible moment.
   *
   * Now the box is always there at width nought, so opening it is one
   * style change on an element the browser already has, and the transition
   * starts on the very next frame.
   *
   * `hidden` is the one thing that still has to wait: a box of width
   * nought still holds focusable rows, so it is made properly invisible —
   * but only once the closing slide has finished, or it would vanish
   * rather than close.
   */
  /**
   * How much room the panes actually have, measured rather than assumed.
   *
   * The window is not the answer: in the planner this page sits inside a
   * larger shell, and the reader's room depends on how wide the reader has
   * dragged the other two.
   */
  const paneRowRef = React.useRef<HTMLDivElement | null>(null);
  const [paneWidth, setPaneWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = paneRowRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setPaneWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * A width of nought means it has not been measured yet, and a first paint
   * that hides what it is about to show is worse than one that shows what
   * it is about to hide.
   */
  const measured = paneWidth > 0;
  /**
   * `railOpen` stays exactly as the reader left it. What narrows is only
   * whether it is shown, so widening the window brings the folders back
   * without anybody having to ask for them twice.
   */
  const railShowing =
    railOpen && (!measured || paneWidth >= RAIL_GIVES_WAY_BELOW);

  const [railHidden, setRailHidden] = React.useState(true);
  React.useEffect(() => {
    if (railShowing) {
      setRailHidden(false);
      return;
    }
    const timer = window.setTimeout(
      () => setRailHidden(true),
      RAIL_SLIDE_MS + RAIL_SLIDE_GRACE_MS
    );
    return () => window.clearTimeout(timer);
  }, [railShowing]);
  /** The mailbox a conversation is being dragged from — null at rest. */
  const draggingAccount = useDraggingMailAccount();
  const mailSurfaceRef = React.useRef<HTMLDivElement | null>(null);
  const folder =
    tab === "sent"
      ? "sent"
      : tab === "trash"
        ? "trash"
        : tab === "junk"
          ? "junk"
          : tab === "snoozed"
          ? "snoozed"
          : "inbox";
  const searchScopeKey = mailboxScopeKey(mailboxScopeEmails, accountEmails);
  /**
   * How many mailboxes the running search is asking.
   *
   * An empty scope means every connected mailbox — see the state above —
   * so counting the list itself said "Searching 0 mailboxes", which is the
   * one number it can never be while a search is running.
   */
  const searchingMailboxCount = mailboxScopeEmails.length || accountEmails.length;
  const listCacheKey = mailListCacheKey(
    activeFolder ? `label:${folderViewToken(activeFolder)}` : folder,
    debouncedSearch ? `${debouncedSearch}|${searchScopeKey}` : ""
  );
  /** null until first count fetch — Snoozed tab only when > 0. */
  const [snoozedCount, setSnoozedCount] = React.useState<number | null>(null);

  // Soft-nav / InstantTabPaint: seed from prop. Hard refresh: keep the first
  // client render identical to SSR (empty + loading), then fill from cache in
  // useLayoutEffect before paint — peeking localStorage in useState mismatches.
  const [threads, setThreads] = React.useState<MailThreadSummary[]>(() => {
    if (initialList?.threads.length) {
      writeCachedList(viewerId, initialList.key, {
        threads: initialList.threads,
        nextCursor: initialList.nextCursor,
      });
      return initialList.threads;
    }
    return [];
  });
  /** Opaque cursor for the next Gmail list page; null = no more to load. */
  const [listCursor, setListCursor] = React.useState<string | null>(() => {
    if (initialList) return initialList.nextCursor;
    return null;
  });
  const [loadingMore, setLoadingMore] = React.useState(false);
  // Blank loading until prop/cache/fetch has something to show.
  // No connected accounts → skip skeleton (nothing to fetch yet).
  const [loadingList, setLoadingList] = React.useState(
    () => Boolean(accounts.length) && !initialList?.threads.length
  );

  React.useLayoutEffect(() => {
    if (!accountEmails.length) {
      setLoadingList(false);
      return;
    }
    if (threads.length) {
      markMailWarm(viewerId);
      return;
    }
    const cached =
      readCachedList(viewerId, listCacheKey) ?? peekMountCachedList(viewerId);
    if (cached?.threads.length) {
      // Seed the keyed list cache so the first fetch refreshes in place
      // instead of treating a page-snapshot paint as a cold miss.
      writeCachedList(viewerId, listCacheKey, cached);
      setThreads(cached.threads);
      threadsKeyRef.current = listCacheKey;
      setListCursor(cached.nextCursor);
      setLoadingList(false);
      markMailWarm(viewerId);
    }
    // Only on mount — listCacheKey/threads intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerId]);

  React.useEffect(() => {
    if (!accountEmails.length) {
      setThreads([]);
      setListCursor(null);
      setLoadingList(false);
    }
  }, [accountEmails.length]);

  // Persist for InstantTabPaint — never clobber a warm snapshot with an empty
  // remount (SSR/hydrate starts with threads=[] before cache/fetch lands).
  React.useLayoutEffect(() => {
    if (!threads.length) {
      const existing = getPageSnapshot<MailPageSnapshot>(pageSnapKey);
      if (existing?.ownerId === viewerId && existing.threads?.length) {
        setPageSnapshot(pageSnapKey, {
          ...existing,
          ownerId: viewerId,
          accounts: accountEmails,
        });
        return;
      }
    }
    setPageSnapshot(pageSnapKey, {
      ownerId: viewerId,
      accounts: accountEmails,
      threads,
      listCacheKey,
      listCursor,
    });
  }, [accountEmails, threads, listCacheKey, listCursor, pageSnapKey, viewerId]);

  // True while a background refetch is running over already-visible threads.
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  /**
   * The query the rows on screen were fetched for. "" while browsing.
   *
   * Compared against the live query to know whether the list is still an older
   * answer. A background poll of the same query re-sets the same value, so it
   * does not make the list look stale.
   */
  const [resultsQuery, setResultsQuery] = React.useState("");
  const [autoReplyOpen, setAutoReplyOpen] = React.useState(false);
  // Which account the auto-reply dialog opens on (from Set up…/Edit links).
  const [autoReplyAccount, setAutoReplyAccount] = React.useState<string | null>(null);
  const [autoReplies, setAutoReplies] = React.useState<AutoReplyDto[]>([]);

  const storeAutoReply = React.useCallback((updated: AutoReplyDto) => {
    setAutoReplies((prev) => [
      ...prev.filter((a) => a.account !== updated.account),
      updated,
    ]);
  }, []);

  // "End" link in the accounts menu: turn the responder off, keep its content.
  const endAutoReply = React.useCallback(
    async (account: string) => {
      const current = autoReplies.find((a) => a.account === account);
      if (!current) return;
      try {
        const res = await mailApiFetch("/api/mail/autoreply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...current, enabled: false }),
        });
        const json = (await res.json()) as {
          autoReply?: AutoReplyDto;
          error?: string;
        };
        if (!res.ok || !json.autoReply) {
          throw new Error(json.error || "Couldn't end the auto-reply");
        }
        storeAutoReply(json.autoReply);
        toast.success(`Out-of-office reply ended for ${account}`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't end the auto-reply"
        );
      }
    },
    [autoReplies, storeAutoReply]
  );

  // Auto-reply is optional chrome (banner + accounts menu). Defer so we don't
  // compete with the inbox's Gmail traffic and trip concurrent-request 429s.
  React.useEffect(() => {
    // Not gated on the AI flavor. Reading and setting an out-of-office is a
    // plain provider setting; only the button that writes the message for you
    // needs a key, and that one is gated where it lives. Gating this hid the
    // whole feature on the standalone for a day.
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await mailApiFetch("/api/mail/autoreply");
          const json = (await res.json()) as { autoReplies?: AutoReplyDto[] };
          if (!cancelled && res.ok && json.autoReplies) {
            setAutoReplies(json.autoReplies);
          }
        } catch {
          // Badge is best-effort; the dialog surfaces errors when opened.
        }
      })();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);
  const [listError, setListError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<{
    account: string;
    threadId: string;
    /** Whether participants already match CRM contacts (hides Add to CRM). */
    inCrm: boolean;
    /** Search hit message id — open the thread centered on it. */
    focusMessageId?: string;
  } | null>(null);
  const [composing, setComposing] = React.useState(false);
  /** Optional prefill for new compose (e.g. deep-link). */
  const [composeSeed, setComposeSeed] = React.useState<{
    to: string[];
    subject: string;
    continuedFromLabel: string;
    /** Continue this stored draft rather than starting a new one. */
    draftKey?: string;
  } | null>(null);
  /**
   * Hide the mail list so compose/thread gets the full pane. Only allowed
   * while a detail pane is open — otherwise there'd be nothing left.
   */
  const [listCollapsed, setListCollapsed] = React.useState(false);
  /** List fills the shell; reading pane is hidden until restored. */
  const [listExpanded, setListExpanded] = React.useState(false);
  const [zoom, adjustZoom] = useMailZoom();

  /**
   * When to offer the Mac address book.
   *
   * Once a mailbox exists, because completing an address means nothing before
   * there is mail to write. Then once more when a composer opens, which is the
   * moment it would have helped. `mac-contacts-ask` counts the offers and
   * stops at two.
   */
  const [macAskTrigger, setMacAskTrigger] = React.useState(0);
  const offerMacContacts = React.useCallback(() => {
    setMacAskTrigger((n) => n + 1);
  }, []);
  React.useEffect(() => {
    if (accounts.length) offerMacContacts();
  }, [accounts.length, offerMacContacts]);
  const listPlacement = useMailListPlacement();
  const listVertical =
    listPlacement === "top" || listPlacement === "bottom";
  /** Controls | threads side-by-side (top/bottom, or any placement when full-screen). */
  const listSplit = listVertical || listExpanded;
  const detailOpen = composing || selected != null;
  const [listWidth, startListResize, expandListFromNarrow, startListColumnResize] =
    useMailListWidth({
      canCollapse: detailOpen && !listExpanded,
      onCollapse: () => setListCollapsed(true),
      invertDrag: listPlacement === "right",
    });
  const [listHeight, startListHeightResize] = useMailListHeight({
    canCollapse: detailOpen && !listExpanded,
    onCollapse: () => setListCollapsed(true),
    invertDrag: listPlacement === "bottom",
  });
  const [controlsWidth, startControlsResize] = useMailControlsWidth();
  /** Expanded left/right: chrome column keeps the sidebar's list width. */
  const splitChromeWidth =
    listExpanded && !listVertical ? listWidth : controlsWidth;
  const startSplitChromeResize =
    listExpanded && !listVertical
      ? startListColumnResize
      : startControlsResize;

  const toggleListExpanded = React.useCallback(() => {
    setListExpanded((v) => {
      if (!v) {
        setListCollapsed(false);
        // Don't carry a 56px rail into the expanded chrome column.
        if (listWidth <= NARROW_LIST_WIDTH) expandListFromNarrow();
      }
      return !v;
    });
  }, [expandListFromNarrow, listWidth]);

  const closeCompose = React.useCallback(() => {
    setComposing(false);
    setComposeSeed(null);
    setListCollapsed(false);
  }, []);

  // Empty reading pane can't fill the space — always bring the list back.
  React.useEffect(() => {
    if (!detailOpen) setListCollapsed(false);
  }, [detailOpen]);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const threadsRef = React.useRef(threads);
  threadsRef.current = threads;
  /**
   * Which list the rows on screen answer.
   *
   * Rows are kept while a new fetch runs, so the list does not blank on every
   * refresh. That is only right while the view is the same one. Make a folder
   * and open it and the rows kept over were the inbox's — shown under the new
   * folder's name, as though the mail had moved into it.
   */
  const threadsKeyRef = React.useRef(
    initialList?.threads.length ? initialList.key : ""
  );
  /**
   * Soft-hide keys until `until` ms, for rows removed here before the
   * provider agrees they are gone. A quiet poll that started before the
   * removal — or a cached list the server has not rebuilt yet — can
   * otherwise put the row straight back, where it sits looking undone
   * until the next poll takes it away again. Snooze hides until the wake;
   * archive, trash, junk and move hide for a minute, which outlives any
   * response built before the change.
   */
  const hideRowUntilRef = React.useRef<Map<string, number>>(new Map());
  const loadingListRef = React.useRef(loadingList);
  loadingListRef.current = loadingList;
  const refreshingRef = React.useRef(refreshing);
  refreshingRef.current = refreshing;
  /** Monotonic id so a slow inbox response can't overwrite a newer search. */
  const loadGenRef = React.useRef(0);
  const loadAbortRef = React.useRef<AbortController | null>(null);
  const listQueryRef = React.useRef({
    folder,
    debouncedSearch,
    searchScopeKey,
    activeFolderName: folderViewToken(activeFolder),
  });
  listQueryRef.current = {
    folder,
    debouncedSearch,
    searchScopeKey,
    activeFolderName: folderViewToken(activeFolder),
  };

  /**
   * Whether a search also looks in Trash and Junk.
   *
   * Off by default: results from mail the reader has already thrown away
   * are usually noise, and quietly mixing them in would put threads in the
   * list that they had decided against. A standing preference, set in the
   * mailbox menu whenever they like — but it changes nothing until there is
   * a query, which is why the menu's own label only says "+Deleted" while
   * one is running.
   */
  const [searchDeleted, setSearchDeleted] = React.useState(false);
  const [filterRowOpen, setFilterRowOpenState] = React.useState(false);
  React.useEffect(() => setFilterRowOpenState(getMailFilterRowOpen()), []);
  const setFilterRowOpen = React.useCallback((open: boolean) => {
    setFilterRowOpenState(open);
    setMailFilterRowOpen(open);
  }, []);

  /**
   * Browse/search params for the API. List paint filters by mailbox scope
   * client-side. Search never uses folderScoped — a query covers every folder
   * on the selected mailbox(es). One selected mailbox is sent as `account`.
   */
  const appendListParams = React.useCallback(
    (params: URLSearchParams) => {
      if (!debouncedSearch) {
        if (activeFolder) {
          // A row standing for a search has no label to ask for. It asks
          // for the view instead, which is the same one the tabs use.
          if (activeFolder.virtual && activeFolder.role) {
            params.set("folder", ROLE_VIEW[activeFolder.role]);
          } else {
            params.set("label", activeFolder.name);
          }
          // Opened from the rail, so opened on one mailbox. A folder row
          // under a heading that then listed another account's mail would
          // be telling the reader something untrue about their own filing.
          if (activeFolder.account) params.set("account", activeFolder.account);
        }
        // Every view the provider keeps in a folder of its own. Leaving one
        // out does not empty the list — it quietly serves the inbox instead,
        // which is what Junk and Trash did.
        else if (SERVER_FOLDER_VIEWS.includes(folder)) {
          params.set("folder", folder);
        }
        return;
      }
      params.set("q", debouncedSearch);
      if (searchDeleted) params.set("includeDeleted", "1");
      /**
       * The view narrows the search, the way the tabs beside it already do.
       *
       * A search used to reach every folder whatever was open, which left
       * Sent lit and underlined above results that were not sent mail —
       * the reader had picked a view and watched the same list come back.
       * That argument was already settled for All / In Contacts / Other,
       * and Sent, Trash, Junk and the folders were the exception.
       *
       * `folderScoped` is how the list is told to keep the folder query
       * alongside the words; a named label keeps it either way.
       */
      if (activeFolder) {
        if (activeFolder.virtual && activeFolder.role) {
          params.set("folder", ROLE_VIEW[activeFolder.role]);
        } else {
          params.set("label", activeFolder.name);
        }
        params.set("folderScoped", "1");
      } else if (SERVER_FOLDER_VIEWS.includes(folder)) {
        params.set("folder", folder);
        params.set("folderScoped", "1");
      }
      // A folder opened on one mailbox is the narrower answer of the two.
      const account =
        activeFolder?.account ??
        mailboxScopeApiAccount(
        mailboxScopeEmails,
        accountEmails
      );
      if (account) params.set("account", account);
    },
    [
      activeFolder,
      accountEmails,
      debouncedSearch,
      folder,
      mailboxScopeEmails,
      searchDeleted,
    ]
  );

  const loadThreads = React.useCallback(
    async (options?: {
      fresh?: boolean;
      quiet?: boolean;
      /** Gmail list-diff poll — reuse unchanged thread metadata. */
      incremental?: boolean;
    }): Promise<boolean> => {
      // fresh = bypass caches; quiet = background poll (no spinner / toasts).
      const fresh = options?.fresh ?? false;
      const quiet = options?.quiet ?? false;
      const incremental = options?.incremental ?? false;
      const key = mailListCacheKey(
        activeFolder ? `label:${folderViewToken(activeFolder)}` : folder,
        debouncedSearch ? `${debouncedSearch}|${searchScopeKey}` : ""
      );

      /** Rows on screen that answer this view, rather than the last one. */
      const warmRows = threadsKeyRef.current === key ? threadsRef.current : [];
      threadsKeyRef.current = key;

      // Nothing connected yet — don't spin a skeleton waiting on an empty inbox.
      if (!accountEmails.length) {
        setThreads([]);
        setListCursor(null);
        setLoadingList(false);
        setRefreshing(false);
        if (!quiet) setListError(null);
        return true;
      }

      // Supersede any in-flight list fetch (e.g. browse still running when
      // search starts — otherwise it finishes later and wipes the results).
      loadAbortRef.current?.abort();
      const gen = ++loadGenRef.current;
      const isCurrent = () => gen === loadGenRef.current;

      const cached = fresh ? null : readCachedList(viewerId, key);
      if (fresh) {
        if (!quiet) setRefreshing(true);
      } else if (cached?.threads.length) {
        // The cache key carries the query, so these rows answer it.
        setThreads(cached.threads);
        setResultsQuery(debouncedSearch);
        setListCursor(cached.nextCursor);
        setLoadingList(false);
        setRefreshing(true);
      } else if (warmRows.length > 0) {
        // Page snapshot / prior paint already on screen — keep rows and refresh
        // in place (don't blank into a skeleton for 15s on a cache-key miss).
        setLoadingList(false);
        setRefreshing(true);
      } else {
        setThreads([]);
        setListCursor(null);
        setLoadingList(true);
        setRefreshing(false);
      }
      if (!quiet) setListError(null);
      const controller = new AbortController();
      loadAbortRef.current = controller;
      /** Single-mailbox wall clock; multi-account uses a per-mailbox timeout. */
      let timeout: number | null = null;
      try {
        const params = new URLSearchParams();
        const snoozedView = !activeFolder && folder === "snoozed";
        if (!snoozedView) {
          appendListParams(params);
        }
        if (fresh && !snoozedView) params.set("fresh", "1");
        if (incremental && !snoozedView) params.set("incremental", "1");

        // Multi-account browse/search: one request per mailbox, merged into
        // the list as each response lands — one slow mailbox no longer holds
        // back the others, and rows drop in as they arrive.
        if (
          !snoozedView &&
          !params.has("account") &&
          accountEmails.length > 1
        ) {
          const hideFiltered = (rows: MailThreadSummary[]) => {
            const now = Date.now();
            const hide = hideRowUntilRef.current;
            for (const [hideKey, until] of hide) {
              if (until <= now) hide.delete(hideKey);
            }
            const visibleAccounts = new Set(
              accountEmails.map((email) => email.toLowerCase())
            );
            return rows.filter((t) => {
              if (!visibleAccounts.has(t.account.toLowerCase())) return false;
              const until = hide.get(threadKey(t));
              return until == null || until <= now;
            });
          };

          // Rows already on screen (or cached) hold their place until their
          // own mailbox's fetch lands.
          const buckets = new Map<string, MailThreadSummary[]>();
          for (const t of cached?.threads ?? warmRows) {
            const bucket = buckets.get(t.account);
            if (bucket) bucket.push(t);
            else buckets.set(t.account, [t]);
          }
          const mergedNow = () =>
            dedupeThreadsByTip(hideFiltered([...buckets.values()].flat()));

          const cursorTokens: Record<string, string> = {};
          let successes = 0;
          let firstError: unknown = null;
          // Slow Gmail + CRM classify regularly runs 20–30s; keep headroom.
          const ACCOUNT_TIMEOUT_MS = 60_000;
          /** Cap parallel mailbox fetches so we do not stampede DB / Gmail. */
          const ACCOUNT_CONCURRENCY = 2;

          const fetchAccount = async (email: string) => {
            const accountController = new AbortController();
            const onParentAbort = () => accountController.abort();
            if (controller.signal.aborted) {
              accountController.abort();
            } else {
              controller.signal.addEventListener("abort", onParentAbort);
            }
            const accountTimeout = window.setTimeout(
              () => accountController.abort(),
              ACCOUNT_TIMEOUT_MS
            );
            try {
              const p = new URLSearchParams(params);
              p.set("account", email);
              const json = await apiJson<{
                threads?: MailThreadSummary[];
                nextCursor?: string | null;
              }>(`/api/mail/threads?${p.toString()}`, {
                signal: accountController.signal,
              });
              if (!isCurrent()) return;
              const rows = Array.isArray(json.threads) ? json.threads : [];
              // Same flaky-empty guard as the unified path, per mailbox:
              // never let an empty warm-browse response erase known rows.
              const hadRows = (buckets.get(email)?.length ?? 0) > 0;
              if (!fresh && !debouncedSearch && !rows.length && hadRows) {
                successes += 1;
                return;
              }
              successes += 1;
              Object.assign(cursorTokens, decodeCursorTokens(json.nextCursor));
              buckets.set(email, rows);
              // Rows from one mailbox are already the server's answer, so
              // local narrowing must stop even though others are still out.
              setThreads(mergedNow());
              setResultsQuery(debouncedSearch);
            } catch (err) {
              if (firstError == null) firstError = err;
            } finally {
              window.clearTimeout(accountTimeout);
              controller.signal.removeEventListener("abort", onParentAbort);
            }
          };

          for (let i = 0; i < accountEmails.length; i += ACCOUNT_CONCURRENCY) {
            if (!isCurrent() || controller.signal.aborted) break;
            const batch = accountEmails.slice(i, i + ACCOUNT_CONCURRENCY);
            await Promise.all(batch.map((email) => fetchAccount(email)));
          }

          if (!isCurrent()) return false;
          const latestQuery = listQueryRef.current;
          const currentKey = mailListCacheKey(
            latestQuery.activeFolderName
              ? `label:${latestQuery.activeFolderName}`
              : latestQuery.folder,
            latestQuery.debouncedSearch
              ? `${latestQuery.debouncedSearch}|${latestQuery.searchScopeKey}`
              : ""
          );
          if (currentKey !== key) return false;
          if (!successes) {
            throw firstError instanceof Error
              ? firstError
              : new Error("Couldn't load inbox");
          }
          const threads = mergedNow();
          const nextCursor = encodeCursorTokens(cursorTokens);
          setThreads(threads);
          setResultsQuery(debouncedSearch);
          setListCursor(nextCursor);
          writeCachedList(viewerId, key, { threads, nextCursor });
          setSelected((current) => {
            if (!current) return current;
            const next = threads.find(
              (t) => threadKey(t) === threadKey(current)
            );
            if (!next) return current;
            const inCrm = next.tab === "people";
            return current.inCrm === inCrm ? current : { ...current, inCrm };
          });
          if (successes < accountEmails.length && !quiet) {
            toast.error(mailSay("couldNotRefreshSome"));
          }
          return successes === accountEmails.length;
        }

        timeout = window.setTimeout(() => controller.abort(), 45_000);
        const json = await apiJson<{
          threads?: MailThreadSummary[];
          nextCursor?: string | null;
        }>(
          snoozedView
            ? `/api/mail/snoozed?${params.toString()}`
            : `/api/mail/threads?${params.toString()}`,
          { signal: controller.signal }
        );
        if (!isCurrent()) return false;
        // Query changed while we were in flight (search typed, tab switch…).
        const latest = listQueryRef.current;
        const latestKey = mailListCacheKey(
          latest.activeFolderName
            ? `label:${latest.activeFolderName}`
            : latest.folder,
          latest.debouncedSearch
            ? `${latest.debouncedSearch}|${latest.searchScopeKey}`
            : ""
        );
        if (latestKey !== key) return false;

        const rawThreads = Array.isArray(json.threads) ? json.threads : [];
        const nextCursor = snoozedView ? null : (json.nextCursor ?? null);
        // Never let a flaky empty response erase a warm browse list. Search
        // and explicit refresh are allowed to show a true zero.
        // An empty answer for a view we have rows for is more likely a flaky
        // mailbox than a true zero — except when those rows answer another
        // view, and an empty folder would otherwise never manage to look empty.
        const keepWarm =
          !fresh &&
          !debouncedSearch &&
          !rawThreads.length &&
          (cached?.threads.length || warmRows.length) > 0;
        if (keepWarm) {
          if (!quiet) toast.error(mailSay("couldNotRefreshInbox"));
          return false;
        }
        const now = Date.now();
        const hide = hideRowUntilRef.current;
        for (const [hideKey, until] of hide) {
          if (until <= now) hide.delete(hideKey);
        }
        // Drop rows for mailboxes hidden from Mail (server should already
        // omit them; this covers optimistic hide + any stale cache).
        const visibleAccounts = new Set(
          accountEmails.map((email) => email.toLowerCase())
        );
        const threads = snoozedView
          ? rawThreads
          : rawThreads.filter((t) => {
              if (!visibleAccounts.has(t.account.toLowerCase())) return false;
              const until = hide.get(threadKey(t));
              return until == null || until <= now;
            });
        setThreads(threads);
        setResultsQuery(debouncedSearch);
        setListCursor(nextCursor);
        writeCachedList(viewerId, key, { threads, nextCursor });
        if (snoozedView) setSnoozedCount(threads.length);
        // Keep the open thread's In CRM flag in sync after Add to CRM / refresh.
        setSelected((current) => {
          if (!current) return current;
          const next = threads.find(
            (t) => threadKey(t) === threadKey(current)
          );
          if (!next) return current;
          const inCrm = next.tab === "people";
          return current.inCrm === inCrm ? current : { ...current, inCrm };
        });
        return true;
      } catch (err) {
        if (!isCurrent()) return false;
        // Navigating to OAuth cancels in-flight fetches (WebKit: "Load failed").
        if (shouldIgnoreFetchError()) return false;
        // Keep showing the cached / on-screen list if we have one.
        const haveWarm =
          (cached?.threads.length ?? 0) > 0 || warmRows.length > 0;
        const message =
          err instanceof Error && err.name === "AbortError"
            ? mailSay("inboxLoadTimedOut")
            : err instanceof Error
              ? err.message
              : "Couldn't load inbox";
        if (!fresh && !haveWarm) {
          setListError(message);
        } else if (!quiet) {
          toast.error(
            err instanceof Error && err.name === "AbortError"
              ? message
              : message.replace("Couldn't load inbox", "Couldn't refresh inbox")
          );
        }
        return false;
      } finally {
        if (timeout != null) window.clearTimeout(timeout);
        if (isCurrent()) {
          setLoadingList(false);
          setRefreshing(false);
        }
      }
    },
    [
      accountEmails.length,
      activeFolder,
      appendListParams,
      debouncedSearch,
      folder,
      searchScopeKey,
      viewerId,
    ]
  );

  /**
   * After a send, refresh only that mailbox's Sent list (not every account).
   * Updates the Sent cache always; merges into the live list when Sent is open.
   */
  const refreshSentForAccount = React.useCallback(
    async (accountEmail: string) => {
      const email = accountEmail.trim();
      if (!email) return;
      try {
        const params = new URLSearchParams({
          folder: "sent",
          account: email,
          fresh: "1",
          incremental: "1",
        });
        const json = await apiJson<{
          threads?: MailThreadSummary[];
          nextCursor?: string | null;
        }>(`/api/mail/threads?${params.toString()}`);
        const rows = Array.isArray(json.threads) ? json.threads : [];
        const sentKey = mailListCacheKey("sent", "");
        const cached = readCachedList(viewerId, sentKey);
        const others = (cached?.threads ?? []).filter(
          (t) => t.account.toLowerCase() !== email.toLowerCase()
        );
        const nextThreads = dedupeThreadsByTip([...others, ...rows]);
        const tokens = decodeCursorTokens(cached?.nextCursor ?? null);
        const incoming = decodeCursorTokens(json.nextCursor ?? null);
        if (Object.keys(incoming).length) {
          Object.assign(tokens, incoming);
        } else if (json.nextCursor) {
          tokens[email] = json.nextCursor;
        }
        writeCachedList(viewerId, sentKey, {
          threads: nextThreads,
          nextCursor: encodeCursorTokens(tokens),
        });

        const view = listQueryRef.current;
        if (
          view.folder === "sent" &&
          !view.activeFolderName &&
          !view.debouncedSearch
        ) {
          setThreads((current) => {
            const keep = current.filter(
              (t) => t.account.toLowerCase() !== email.toLowerCase()
            );
            return dedupeThreadsByTip([...keep, ...rows]);
          });
        }
      } catch {
        /* quiet — the next poll still catches up */
      }
    },
    [viewerId]
  );

  /** Provider Sent indexing lags; two quiet beats for one mailbox only. */
  const scheduleSentRefreshForAccount = React.useCallback(
    (accountEmail: string) => {
      const email = accountEmail.trim();
      if (!email) return;
      for (const delay of [1_200, 5_000]) {
        window.setTimeout(() => {
          void refreshSentForAccount(email);
        }, delay);
      }
    },
    [refreshSentForAccount]
  );

  // Cheap count so the Snoozed tab can appear without loading the full list.
  // All-accounts count — the account menu filters the snoozed list client-side.
  // Defer so threads + folder names claim the first network slots.
  React.useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const json = await apiJson<{ count: number }>(
            "/api/mail/snoozed?countOnly=1"
          );
          if (!cancelled) setSnoozedCount(json.count);
        } catch {
          /* tab visibility is best-effort */
        }
      })();
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // If the last snooze clears while you're on Snoozed, leave the tab.
  React.useEffect(() => {
    if (snoozedCount == null) return;
    if (tab === "snoozed" && snoozedCount <= 0) {
      setTab("all");
    }
  }, [tab, snoozedCount, setTab]);

  const loadMoreThreads = React.useCallback(async () => {
    if (!listCursor || loadingMore || loadingList || refreshing) return;
    if (!activeFolder && folder === "snoozed") return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      appendListParams(params);
      params.set("cursor", listCursor);
      const json = await apiJson<{
        threads: MailThreadSummary[];
        nextCursor?: string | null;
      }>(`/api/mail/threads?${params.toString()}`);
      const nextCursor = json.nextCursor ?? null;
      setThreads((current) => {
        const byKey = new Map(current.map((t) => [threadKey(t), t]));
        for (const t of json.threads) byKey.set(threadKey(t), t);
        // Sorts newest-first and collapses cc'd copies across mailboxes.
        const merged = dedupeThreadsByTip([...byKey.values()]);
        writeCachedList(viewerId, listCacheKey, { threads: merged, nextCursor });
        return merged;
      });
      setListCursor(nextCursor);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load more");
    } finally {
      setLoadingMore(false);
    }
  }, [
    appendListParams,
    folder,
    activeFolder,
    listCacheKey,
    listCursor,
    loadingList,
    loadingMore,
    refreshing,
  ]);

  React.useEffect(() => {
    // Quiet: automatic open must not toast when one slow mailbox fails.
    // Manual refresh / pull still surfaces partial failures.
    void loadThreads({ incremental: true, quiet: true });
  }, [loadThreads]);

  /*
   * The address book changed, so the split between In Contacts and Other
   * may be wrong for rows already on screen. On a first run the inbox loads
   * before the first contact sync ends, and every row lands in Other until
   * the next poll. Load again now, past the caches, so the tabs are right
   * as soon as the contacts are.
   */
  React.useEffect(() => {
    const onContactsChanged = () => {
      void loadThreads({ fresh: true, quiet: true });
    };
    window.addEventListener(CONTACTS_CHANGED_EVENT, onContactsChanged);
    return () =>
      window.removeEventListener(CONTACTS_CHANGED_EVENT, onContactsChanged);
  }, [loadThreads]);

  // Focus-aware inbox poll: while the window is visible, quietly refresh so
  // new mail shows up without a manual refresh. Pause when hidden; back off
  // on errors so we don't melt Gmail during outages. Always incremental —
  // Gmail History / prior-page reuse; full rebuild only when priors are gone.
  React.useEffect(() => {
    const BASE_MS = 60_000;
    const MAX_MS = 5 * 60_000;
    const RESUME_MS = 1_500;
    let cancelled = false;
    let timer: number | null = null;
    let delay = BASE_MS;
    let inFlight = false;

    const clear = () => {
      if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = (ms: number) => {
      clear();
      if (cancelled) return;
      timer = window.setTimeout(() => {
        void tick();
      }, ms);
    };

    const mailSurfaceHidden = () => {
      // Plan shell keeps the previous tab mounted (CSS hidden) during nav.
      const el = mailSurfaceRef.current;
      if (!el) return false;
      return Boolean(el.closest('[aria-hidden="true"]'));
    };

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible" || mailSurfaceHidden()) {
        schedule(delay);
        return;
      }
      // Skip while the user is searching or another list fetch is running.
      if (
        debouncedSearch ||
        inFlight ||
        loadingListRef.current ||
        refreshingRef.current
      ) {
        schedule(delay);
        return;
      }
      inFlight = true;
      const ok = await loadThreads({
        quiet: true,
        incremental: true,
      });
      inFlight = false;
      if (cancelled) return;
      delay = ok ? BASE_MS : Math.min(Math.max(delay, BASE_MS) * 2, MAX_MS);
      schedule(delay);
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible" || mailSurfaceHidden()) {
        clear();
        return;
      }
      delay = BASE_MS;
      schedule(RESUME_MS);
    };

    document.addEventListener("visibilitychange", onVisibility);
    schedule(BASE_MS);

    return () => {
      cancelled = true;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadThreads, debouncedSearch]);

  // A chat popout window sent mail: refresh that mailbox's Sent soon
  // (staggered — the provider needs a beat to index the sent copy).
  // Browsers signal via the storage event; desktop shells via Tauri.
  React.useEffect(() => {
    const accountFromPayload = (raw: unknown): string => {
      if (!raw || typeof raw !== "object") return "";
      const account = (raw as { account?: unknown }).account;
      return typeof account === "string" ? account.trim() : "";
    };
    const refreshAfterRemoteSend = (accountEmail: string) => {
      if (accountEmail) scheduleSentRefreshForAccount(accountEmail);
      else {
        // Legacy signal without account — keep prior full-list refresh.
        for (const delay of [1_200, 5_000]) {
          window.setTimeout(() => {
            void loadThreads({ fresh: true, quiet: true, incremental: true });
          }, delay);
        }
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== MAIL_POPOUT_SENT_KEY || !event.newValue) return;
      try {
        refreshAfterRemoteSend(
          accountFromPayload(JSON.parse(event.newValue))
        );
      } catch {
        refreshAfterRemoteSend("");
      }
    };
    window.addEventListener("storage", onStorage);
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    const tauriEvent = (
      window as unknown as {
        __TAURI__?: {
          event?: {
            listen?: (
              name: string,
              handler: (event: { payload: unknown }) => void
            ) => Promise<() => void>;
          };
        };
      }
    ).__TAURI__?.event;
    if (tauriEvent?.listen) {
      void tauriEvent
        .listen("mail-sent", (event) => {
          refreshAfterRemoteSend(accountFromPayload(event.payload));
        })
        .then((fn) => {
          if (cancelled) fn();
          else unlisten = fn;
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      unlisten?.();
    };
  }, [loadThreads, scheduleSentRefreshForAccount]);

  const listScrollRef = React.useRef<HTMLDivElement | null>(null);

  // Mailbox menu only filters what we paint — the fetch always loads every
  // connected mailbox so toggling stays instant.
  const threadsForAccount = threads.filter((t) =>
    accountPassesMailboxScope(t.account, mailboxScopeEmails, accountEmails)
  );

  // "all" = the whole inbox (both CRM piles); "sent" / "snoozed" are folders.
  // Folder view shows every thread in that label (no CRM split).
  // The tabs narrow a search too. They used not to, on the reasoning that a
  // query should reach both piles — but the tabs stayed lit and clickable
  // while doing nothing, so a reader narrowing their results watched the same
  // list come back and could only read it as broken. "All" already reaches
  // everything, which is the tab a search starts on.
  // Custom lists: any external participant in the list's people.
  // Inbox tabs: newest-first. Snoozed: soonest wake first.
  const visible = (
    activeFolder ||
    // Every view that is a place rather than a slice of the inbox. `t.tab` is
    // only ever "people" or "other", so filtering by it here empties any of
    // these — which is exactly how Junk and Trash came back empty even with
    // the provider returning rows.
    MAIL_OFF_TAB_VIEWS.includes(tab) ||
    tab === "all"
      ? threadsForAccount
      : activeCustomList
        ? threadsForAccount.filter((t) =>
            threadMatchesCustomList(t, activeCustomList)
          )
        : threadsForAccount.filter((t) => t.tab === tab)
  )
    .slice()
    .sort((a, b) =>
      tab === "snoozed"
        ? Date.parse(a.snoozedUntil ?? a.lastAt) -
          Date.parse(b.snoozedUntil ?? b.lastAt)
        : Date.parse(b.lastAt) - Date.parse(a.lastAt)
    );

  // On-screen thread order for successor selection after delete/archive/move.
  // Updated below once pinned band + flow list are known; read from the ref
  // inside removeThread so those values don't need to be declared earlier.
  const screenThreadOrderRef = React.useRef<MailThreadSummary[]>([]);

  // The same, for the by-person list. Set once the rows are grouped, below.
  const personRowOrderRef = React.useRef<PersonRow[]>([]);

  // The open folder's chip takes the counted number and leaves it alone.
  //
  // It used to raise that number to however many threads were loaded,
  // because Gmail's label totals lag after a message is filed. Counting by
  // search removed the lag, and the raise was reading the wrong thing
  // anyway: `threads` still holds the previous view's rows for a moment
  // after a folder opens, so a folder holding one thread was labelled with
  // the inbox's row count, and stuck there for ninety seconds.

  const removeThread = React.useCallback(
    (key: string) => {
      /**
       * Where to go next, worked out before the row is gone.
       *
       * The painted order is the one to follow — pins band, then the visible
       * flow — because that is what the reader is looking at. But it is put
       * into a ref while the component renders, and this runs from an event,
       * so the two can disagree about what is on screen. When they do, the
       * plain thread order is a worse answer than the painted one and a much
       * better answer than none: dropping to the empty pane after a delete
       * reads as though something went wrong.
       */
      const painted = screenThreadOrderRef.current;
      const isRemoved = (t: MailThreadSummary) => threadKey(t) === key;
      const successor = successorInEitherOrder(
        painted,
        threadsRef.current,
        isRemoved
      );
      if (
        !successor &&
        !painted.some(isRemoved) &&
        !threadsRef.current.some(isRemoved)
      ) {
        console.warn(
          `[mail] ${key} was not in the list it was removed from — nothing to open next`
        );
      }

      setThreads((current) => {
        const next = current.filter((t) => threadKey(t) !== key);
        patchCachedThreads(viewerId, listCacheKey, next);
        return next;
      });
      // The row is gone from this list. It is gone from the others too, and
      // those are cached in storage with no expiry — so a folder or a search
      // the reader comes back to later would paint it again.
      forgetThreadEverywhere(viewerId, (t) => threadKey(t) === key);
      setSelected((current) => {
        if (!current || threadKey(current) !== key) return current;
        // With a person digest open, fall back to it — the successor thread
        // in list order could belong to someone else entirely.
        if (viewMode === "people" && selectedPersonKey) return null;
        return successor
          ? {
              account: successor.account,
              threadId: successor.threadId,
              inCrm: successor.tab === "people",
              focusMessageId: successor.focusMessageId,
            }
          : null;
      });
    },
    [listCacheKey, viewMode, selectedPersonKey]
  );

  const markUnread = React.useCallback(
    async (t: { account: string; threadId: string }) => {
      const key = threadKey(t);
      try {
        await apiJson("/api/mail/unread", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(t),
        });
        setThreads((current) => {
          const next = current.map((item) =>
            threadKey(item) === key ? { ...item, unread: true } : item
          );
          patchCachedThreads(viewerId, listCacheKey, next);
          return next;
        });
        toast(mailSay("markedAsUnread"));
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't mark as unread"
        );
      }
    },
    [listCacheKey]
  );

  type MailUndoEntry = {
    id: string;
    kind: "trash" | "archive" | "move" | "snooze";
    summary: MailThreadSummary;
    toastId: string | number;
    folderName?: string;
    /** The open folder this left, if it left one. Undo puts the count back. */
    leftFolderName?: string | null;
  };

  /** Stack of archive/trash/move/snooze actions — each Cmd+Z pops exactly one. */
  const mailUndoStackRef = React.useRef<MailUndoEntry[]>([]);

  const applyMailUndo = React.useCallback(
    async (undo: MailUndoEntry) => {
      toast.dismiss(undo.toastId);
      // The row is coming back; nothing may keep hiding it. Every kind set
      // a hide when it removed the row, so every kind clears one here.
      hideRowUntilRef.current.delete(threadKey(undo.summary));
      if (undo.leftFolderName)
        bumpMailFolderCount(undo.summary.account, undo.leftFolderName, 1);
      setThreads((current) => {
        const key = threadKey(undo.summary);
        if (current.some((t) => threadKey(t) === key)) return current;
        const next = [...current, undo.summary].sort(
          (a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt)
        );
        patchCachedThreads(viewerId, listCacheKey, next);
        return next;
      });
      try {
        if (undo.kind === "move") {
          await apiJson("/api/mail/folders/unmove", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              account: undo.summary.account,
              threadId: undo.summary.threadId,
              folderName: undo.folderName,
            }),
          });
          if (undo.folderName)
            bumpMailFolderCount(undo.summary.account, undo.folderName, -1);
          toast.success(mailSay("movedBackToInbox"));
        } else if (undo.kind === "snooze") {
          await apiJson("/api/mail/unsnooze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              account: undo.summary.account,
              threadId: undo.summary.threadId,
            }),
          });
          setSnoozedCount((n) => {
            const current = n == null ? 1 : n;
            return Math.max(0, current - 1);
          });
          toast.success(mailSay("snoozeCancelled"));
        } else {
          await apiJson(
            undo.kind === "trash" ? "/api/mail/untrash" : "/api/mail/unarchive",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                account: undo.summary.account,
                threadId: undo.summary.threadId,
              }),
            }
          );
          toast.success(
            mailSay(
              undo.kind === "trash" ? "restoredToInbox" : "movedBackToInbox"
            )
          );
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : mailSay("couldNotRestore")
        );
      }
    },
    [listCacheKey]
  );

  const undoLastMailAction = React.useCallback(async () => {
    const undo = mailUndoStackRef.current.pop();
    if (!undo) return;
    await applyMailUndo(undo);
  }, [applyMailUndo]);

  /** Toast Undo undoes that specific action even if newer ones followed. */
  const undoMailActionById = React.useCallback(
    async (id: string) => {
      const stack = mailUndoStackRef.current;
      const idx = stack.findIndex((entry) => entry.id === id);
      if (idx < 0) return;
      const [undo] = stack.splice(idx, 1);
      await applyMailUndo(undo);
    },
    [applyMailUndo]
  );

  const pushMailUndo = React.useCallback(
    (
      kind: "trash" | "archive" | "move" | "snooze",
      summary: MailThreadSummary,
      label: string,
      folderName?: string,
      leftFolderName?: string | null
    ) => {
      const id = `${kind}-${threadKey(summary)}-${Date.now()}`;
      const toastId =
        kind === "move"
          ? toast.success(label, {
              action: {
                label: "Undo",
                onClick: () => void undoMailActionById(id),
              },
              duration: 8000,
            })
          : toast(label, {
              action: {
                label: "Undo",
                onClick: () => void undoMailActionById(id),
              },
              duration: 8000,
            });
      mailUndoStackRef.current.push({
        id,
        kind,
        summary,
        toastId,
        folderName,
        leftFolderName,
      });
      if (mailUndoStackRef.current.length > 50) {
        mailUndoStackRef.current.shift();
      }
    },
    [undoMailActionById]
  );

  /**
   * A conversation left the folder we have open, so that folder holds one
   * fewer. Only for the folder on screen: leaving the inbox is not leaving a
   * folder, and the counts we keep are for named folders only.
   */
  const openFolderName = activeFolder?.name ?? null;
  const noteLeftOpenFolder = React.useCallback(
    (account: string) => {
      if (openFolderName) bumpMailFolderCount(account, openFolderName, -1);
    },
    [openFolderName]
  );

  /**
   * Keep an optimistically removed row from being resurrected.
   *
   * Longer than any list response that was already in flight when the row
   * was removed, and long enough for the provider's own listing to catch
   * up. The abort drops the response most likely to carry it back.
   */
  const REMOVED_ROW_HIDE_MS = 60_000;
  const hideRemovedRows = React.useCallback((keys: string[]) => {
    const until = Date.now() + REMOVED_ROW_HIDE_MS;
    for (const rowKey of keys) hideRowUntilRef.current.set(rowKey, until);
    loadAbortRef.current?.abort();
  }, []);
  const unhideRows = React.useCallback((keys: string[]) => {
    for (const rowKey of keys) hideRowUntilRef.current.delete(rowKey);
  }, []);

  const moveToFolder = React.useCallback(
    async (
      t: { account: string; threadId: string },
      folderName: string,
      create: boolean
    ) => {
      const key = threadKey(t);
      const before = threads;
      const summary = threads.find((x) => threadKey(x) === key);
      removeThread(key);
      hideRemovedRows([key]);
      try {
        const json = await apiJson<{
          folderName: string;
          movedOut?: boolean;
        }>(
          "/api/mail/folders/move",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              account: t.account,
              threadId: t.threadId,
              folderName,
              create,
            }),
          }
        );
        bumpMailFolderCount(t.account, json.folderName, 1);
        // Outlook keeps a message in one folder, so it has left this one.
        // Gmail keeps every label it had, so it has not.
        if (json.movedOut) noteLeftOpenFolder(t.account);
        if (summary) {
          pushMailUndo(
            "move",
            summary,
            mailSay("movedToFolder", { name: json.folderName }),
            json.folderName,
            json.movedOut ? openFolderName : null
          );
        } else {
          toast.success(mailSay("movedToFolder", { name: json.folderName }));
        }
      } catch (err) {
        unhideRows([key]);
        setThreads(before);
        throw err;
      }
    },
    [
      threads,
      removeThread,
      pushMailUndo,
      noteLeftOpenFolder,
      openFolderName,
      hideRemovedRows,
      unhideRows,
    ]
  );

  /*
   * Toasts name the provider that did the deed, so they ask which one it
   * was. "Archived in Gmail" over an Outlook mailbox was the app talking
   * about itself instead of the account in front of it — the mail had in
   * fact gone to Outlook, and the sentence said otherwise.
   */
  const isOutlookAccount = useIsOutlookAccount();
  const archive = React.useCallback(
    async (t: { account: string; threadId: string }) => {
      const key = threadKey(t);
      const before = threads;
      const summary = threads.find((x) => threadKey(x) === key);
      const provider = isOutlookAccount(t.account) ? "Outlook" : "Gmail";
      removeThread(key);
      hideRemovedRows([key]);
      try {
        await apiJson("/api/mail/archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(t),
        });
        if (summary) {
          pushMailUndo(
            "archive",
            summary,
            `"${summary.subject}" archived in ${provider}`
          );
        } else {
          toast(mailSay("archivedIn", { provider }));
        }
      } catch (err) {
        unhideRows([key]);
        setThreads(before);
        toast.error(err instanceof Error ? err.message : "Couldn't archive");
      }
    },
    [
      threads,
      removeThread,
      pushMailUndo,
      hideRemovedRows,
      unhideRows,
      isOutlookAccount,
    ]
  );

  /**
   * Archive every conversation with someone.
   *
   * Not the per-thread `archive` called in a loop: that pushes an undo toast
   * each time, so archiving a person you write to often would stack twenty of
   * them, and undoing would mean twenty clicks. One request per thread is
   * unavoidable — the providers have no batch — but one toast is not.
   */
  const archivePerson = React.useCallback(
    async (row: PersonRow) => {
      const targets = row.threads.map((t) => ({
        account: t.account,
        threadId: t.threadId,
      }));
      if (!targets.length) return;
      const before = threads;

      // Work out where to go before the rows are gone. The one below, or the
      // one above when this was the last — the same rule the thread list uses
      // in removeThread, so archiving behaves the same in either view.
      const wasOpen = selectedPersonKey === row.key;
      const successor = successorAfterRemoving(
        personRowOrderRef.current,
        (r) => r.key === row.key
      );

      const targetKeys = targets.map((t) => threadKey(t));
      for (const rowKey of targetKeys) removeThread(rowKey);
      hideRemovedRows(targetKeys);
      if (wasOpen) {
        setSelected(null);
        setSelectedPersonKey(successor ? successor.key : null);
      }

      const results = await Promise.allSettled(
        targets.map((t) =>
          apiJson("/api/mail/archive", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(t),
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed === targets.length) {
        unhideRows(targetKeys);
        setThreads(before);
        toast.error(`Couldn't archive ${row.name}'s mail`);
        return;
      }
      // Some through, some not: the list is rebuilt from the server on the
      // next load anyway, so say what happened rather than guessing.
      if (failed) {
        toast.error(`${failed} of ${targets.length} couldn't be archived`);
        return;
      }

      const archived = targets.length;
      toast(
        archived === 1
          ? `Conversation with ${row.name} archived`
          : `${archived} conversations with ${row.name} archived`,
        {
          action: {
            label: "Undo",
            onClick: () => {
              void (async () => {
                try {
                  await Promise.all(
                    targets.map((t) =>
                      apiJson("/api/mail/unarchive", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(t),
                      })
                    )
                  );
                  unhideRows(targetKeys);
                  setThreads(before);
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Couldn't undo"
                  );
                }
              })();
            },
          },
          duration: 8000,
        }
      );
    },
    [threads, removeThread, hideRemovedRows, unhideRows]
  );

  /**
   * Read when anything is unread; otherwise the newest back to unread.
   *
   * One button for both, because they are the same intent seen from either
   * side: "I have dealt with this" and "I have not, after all". Which way it
   * goes is read off the rows, so the button always does the thing the icon
   * shows.
   *
   * Marking read clears every thread given. Marking unread touches one — the
   * newest — since bringing back eleven messages nobody asked for is not what
   * unread means to a reader.
   */
  const toggleRead = React.useCallback(
    async (rows: MailThreadSummary[], label: string) => {
      const unread = rows.filter((t) => t.unread);
      const before = threads;
      const call = (path: string, t: MailThreadSummary) =>
        apiJson(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account: t.account, threadId: t.threadId }),
        });

      if (unread.length) {
        setThreads((current) =>
          current.map((t) =>
            unread.some((u) => threadKey(u) === threadKey(t))
              ? { ...t, unread: false }
              : t
          )
        );
        const results = await Promise.allSettled(
          unread.map((t) => call("/api/mail/read", t))
        );
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed) {
          setThreads(before);
          toast.error(`Couldn't mark ${label} read`);
        }
        return;
      }

      // Newest first in the list, so the newest thread is the one at the top.
      const newest = rows[0];
      if (!newest) return;
      setThreads((current) =>
        current.map((t) =>
          threadKey(t) === threadKey(newest) ? { ...t, unread: true } : t
        )
      );
      try {
        await call("/api/mail/unread", newest);
      } catch (err) {
        setThreads(before);
        toast.error(
          err instanceof Error ? err.message : "Couldn't mark unread"
        );
      }
    },
    [threads]
  );

  const togglePersonPin = React.useCallback((row: PersonRow) => {
    const pinned = toggleMailPersonPin(row.key);
    toast(pinned ? `${row.name} pinned to the top` : `${row.name} unpinned`);
  }, []);

  const pinFlipFromRef = React.useRef<Map<string, DOMRect> | null>(null);
  const pinFlipFocusRef = React.useRef<string | null>(null);

  const capturePinFlip = React.useCallback((focusKey: string) => {
    pinFlipFromRef.current = readThreadRowRects(listScrollRef.current);
    pinFlipFocusRef.current = focusKey;
  }, []);

  const togglePin = React.useCallback(
    (summary: MailThreadSummary) => {
      capturePinFlip(threadKey(summary));
      const nowPinned = toggleMailPin(summary);
      toast(nowPinned ? t("pinned") : t("unpinned"));
    },
    [capturePinFlip]
  );

  // After pin/unpin reflow, glide rows from their old spots (FLIP).
  React.useLayoutEffect(() => {
    const from = pinFlipFromRef.current;
    if (!from) return;
    const focus = pinFlipFocusRef.current;
    pinFlipFromRef.current = null;
    pinFlipFocusRef.current = null;
    playThreadRowFlip(listScrollRef.current, from, focus);
  }, [pins]);

  const trash = React.useCallback(
    async (t: { account: string; threadId: string }) => {
      const key = threadKey(t);
      const before = threads;
      const summary = threads.find((x) => threadKey(x) === key);
      const provider = isOutlookAccount(t.account) ? "Outlook" : "Gmail";
      // Trash removes the conversation — drop pin + body cache with it.
      unpinMailThread(t.account, t.threadId);
      invalidateCachedMailThread(t.account, t.threadId);
      removeThread(key);
      hideRemovedRows([key]);
      try {
        await apiJson("/api/mail/trash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(t),
        });
        // Neither provider counts a deleted conversation in a folder.
        noteLeftOpenFolder(t.account);
        if (summary) {
          pushMailUndo(
            "trash",
            summary,
            `"${summary.subject}" moved to Trash in ${provider}`,
            undefined,
            openFolderName
          );
        } else {
          toast(`Conversation moved to Trash in ${provider}`);
        }
      } catch (err) {
        unhideRows([key]);
        setThreads(before);
        toast.error(err instanceof Error ? err.message : "Couldn't delete");
      }
    },
    [
      threads,
      removeThread,
      pushMailUndo,
      noteLeftOpenFolder,
      openFolderName,
      hideRemovedRows,
      unhideRows,
      isOutlookAccount,
    ]
  );

  /**
   * Put a deleted conversation back where it came from.
   *
   * Only offered from the Trash view, which is the only place a thread is
   * known to be deleted. There is no permanent delete to go with it: that is
   * the one action nothing can undo, and the provider offers it already.
   */
  const restoreFromTrash = React.useCallback(
    async (t: { account: string; threadId: string }) => {
      const key = threadKey(t);
      const before = threads;
      invalidateCachedMailThread(t.account, t.threadId);
      removeThread(key);
      setSelected(null);
      try {
        await apiJson("/api/mail/untrash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(t),
        });
        toast.success(mailSay("movedOutOfTrash"));
      } catch (err) {
        setThreads(before);
        toast.error(
          err instanceof Error ? err.message : mailSay("couldNotRestore")
        );
      }
    },
    [threads, removeThread]
  );

  /**
   * File a conversation as junk, or take it back out.
   *
   * Filing, not reporting: it moves the mail and syncs everywhere, and
   * teaches neither provider anything about the sender. See
   * `markMailThreadJunk`.
   */
  const setThreadJunk = React.useCallback(
    async (t: { account: string; threadId: string }, junk: boolean) => {
      const key = threadKey(t);
      const before = threads;
      invalidateCachedMailThread(t.account, t.threadId);
      removeThread(key);
      if (junk) hideRemovedRows([key]);
      setSelected(null);
      try {
        await apiJson(junk ? "/api/mail/junk" : "/api/mail/not-junk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(t),
        });
        // Junk is out of every folder search, the same as Trash. Taking one
        // back out of Junk happens in the Junk view, where no folder is open.
        if (junk) noteLeftOpenFolder(t.account);
        toast.success(
          mailSay(junk ? "movedToJunk" : "movedBackToTheInbox")
        );
      } catch (err) {
        unhideRows([key]);
        setThreads(before);
        toast.error(
          err instanceof Error
            ? err.message
            : mailSay(junk ? "couldNotMoveToJunk" : "couldNotMoveBack")
        );
      }
    },
    [threads, removeThread, noteLeftOpenFolder, hideRemovedRows, unhideRows]
  );

  const startCompose = React.useCallback(
    (seed?: {
      to: string[];
      subject: string;
      continuedFromLabel: string;
      draftKey?: string;
    }) => {
      setSelected(null);
      setSelectedPersonKey(null);
      setListCollapsed(false);
      setListExpanded(false);
      setComposeSeed(seed ?? null);
      setComposing(true);
      // The second and last offer of the Mac address book, at the point it
      // would have helped. It shows nothing if the first one settled it.
      offerMacContacts();
    },
    [offerMacContacts]
  );

  // An address clicked in a message body — in the plain-text view, or inside
  // the frame that renders HTML. Both ask through the same event.
  React.useEffect(
    () =>
      onMailComposeTo((address) =>
        startCompose({ to: [address], subject: "", continuedFromLabel: "" })
      ),
    [startCompose]
  );

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = Boolean(
        target?.closest('input, textarea, [contenteditable="true"]')
      );
      /**
       * A key pressed inside an open menu belongs to that menu.
       *
       * These shortcuts live on the window, so they answered keys pressed
       * anywhere — including inside a popover the reader had just opened.
       * Down in the snooze menu moved the selected thread, which is the
       * one thing that must not happen while you are choosing what to do
       * with the thread you are on.
       */
      if (
        target?.closest(
          '[data-radix-popper-content-wrapper], [role="dialog"], [role="menu"], [role="listbox"]'
        )
      ) {
        return;
      }

      // Escape → leave the open folder (back to inbox tabs).
      if (
        !typing &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key === "Escape" &&
        activeFolder
      ) {
        e.preventDefault();
        setActiveFolder(null);
        return;
      }

      /**
       * Down and Up move the selection to the next message.
       *
       * They were scrolling the list and leaving the selection where it was,
       * which is not what a list with a selection in it does — the reader
       * loses sight of the row they are on and nothing follows the keys.
       */
      if (
        !typing &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        (e.key === "ArrowDown" || e.key === "ArrowUp")
      ) {
        const rows = screenThreadOrderRef.current;
        if (!rows.length) return;
        e.preventDefault();
        const at = selected
          ? rows.findIndex((t) => threadKey(t) === threadKey(selected))
          : -1;
        // Nothing selected yet: the first key press takes the top row rather
        // than counting from a place the reader never was.
        const next =
          at === -1
            ? 0
            : e.key === "ArrowDown"
              ? Math.min(at + 1, rows.length - 1)
              : Math.max(at - 1, 0);
        const target = rows[next];
        // Already at the end being asked for. Re-opening the same row would
        // refetch and re-focus it for no movement at all.
        if (!target || next === at) return;
        openThreadRef.current?.(target);
        // After the row is painted as selected, and only as far as it needs
        // to go — a selection two rows down should not re-centre the list.
        // Found by reading the keys rather than by a selector, because a
        // thread id is not safe to put in one.
        const wanted = threadKey(target);
        requestAnimationFrame(() => {
          for (const row of document.querySelectorAll<HTMLElement>(
            "[data-thread-key]"
          )) {
            if (row.dataset.threadKey !== wanted) continue;
            // Focus as well as select. Each row is focusable, so the ring the
            // browser draws stays on whichever one was last clicked — it sat
            // on the row at the top while the selection walked away from it,
            // marking a row that was no longer the one in hand.
            row.focus({ preventScroll: true });
            row.scrollIntoView({ block: "nearest" });
            break;
          }
        });
        return;
      }

      // Backspace deletes, and Cmd+Shift+A archives. Both are thread
      // shortcuts now, and editable — see lib/mail/shortcuts and ThreadPane.

      // Cmd/Ctrl+Option+F → the mail search box, from anywhere including an
      // open thread. Apple Mail puts mailbox search here and Forward on
      // Cmd+Shift+F, which is where the thread shortcuts put it too. Plain
      // Cmd+F belongs to find-in-thread; see `use-thread-find.ts`.
      //
      // `code` rather than `key`: macOS turns Option+F into "ƒ".
      if (
        (e.metaKey || e.ctrlKey) &&
        e.altKey &&
        !e.shiftKey &&
        e.code === "KeyF"
      ) {
        e.preventDefault();
        const field = searchInputRef.current;
        field?.focus();
        field?.select();
        return;
      }

      // Cmd/Ctrl+Plus and Cmd/Ctrl+Minus → the text size the +/− controls set.
      //
      // This sits above the Shift test below on purpose. A US keyboard makes
      // "+" with Shift, and a Danish one has a key for it, so the Shift state
      // says nothing here. Both layouts are read by `key`, not `code`.
      //
      // It fires while typing as well: the composer shows the same control,
      // and no text field does anything else with these.
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        if (e.key === "+" || e.key === "=") {
          // Without this the webview zooms the whole window instead.
          e.preventDefault();
          // To the next round size, not a tenth on from wherever a pinch
          // happened to stop — see `nextZoomStop`.
          adjustZoom(nextZoomStop(zoom, 1) - zoom);
          return;
        }
        if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          adjustZoom(nextZoomStop(zoom, -1) - zoom);
          return;
        }
      }

      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      const key = e.key.toLowerCase();

      // Cmd/Ctrl+N → Compose (block the browser's New Window).
      if (key === "n") {
        e.preventDefault();
        startCompose();
        return;
      }

      // Cmd/Ctrl+Z → undo one archive/trash (not while typing — editor undo).
      if (key === "z") {
        if (typing || e.repeat || mailUndoStackRef.current.length === 0) return;
        e.preventDefault();
        void undoLastMailAction();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    undoLastMailAction,
    startCompose,
    selected,
    archive,
    activeFolder,
    adjustZoom,
    // Read to work out the next round size to step to.
    zoom,
  ]);

  const snooze = React.useCallback(
    async (t: { account: string; threadId: string }, untilIso: string) => {
      const key = threadKey(t);
      const before = threads;
      const summary = threads.find((x) => threadKey(x) === key);
      const onSnoozedTab = !activeFolder && tab === "snoozed";
      const untilMs = Date.parse(untilIso);
      if (!onSnoozedTab && Number.isFinite(untilMs)) {
        // Only until the server has caught up, not until the wake time.
        // The server's filter owns the hiding after that — and it can end
        // a snooze early when a reply arrives, which a row vetoed here
        // until the original wake time would never show.
        hideRowUntilRef.current.set(
          key,
          Math.min(untilMs, Date.now() + REMOVED_ROW_HIDE_MS)
        );
        // Drop any in-flight list response built before this snooze.
        loadAbortRef.current?.abort();
      }
      if (onSnoozedTab) {
        setThreads((current) => {
          const next = current
            .map((row) =>
              threadKey(row) === key
                ? { ...row, snoozedUntil: untilIso }
                : row
            )
            .sort(
              (a, b) =>
                Date.parse(a.snoozedUntil ?? a.lastAt) -
                Date.parse(b.snoozedUntil ?? b.lastAt)
            );
          patchCachedThreads(viewerId, listCacheKey, next);
          return next;
        });
      } else {
        removeThread(key);
      }
      try {
        await apiJson("/api/mail/snooze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...t, until: untilIso }),
        });
        const when = formatSnoozeWakeLabel(untilIso);
        if (!onSnoozedTab) {
          setSnoozedCount((n) => {
            const current = n == null ? 0 : n;
            return current + 1;
          });
        }
        if (summary && !onSnoozedTab) {
          pushMailUndo("snooze", summary, `Snoozed until ${when}`);
        } else {
          toast(`Snoozed until ${when}`);
        }
      } catch (err) {
        hideRowUntilRef.current.delete(key);
        setThreads(before);
        toast.error(err instanceof Error ? err.message : "Couldn't snooze");
      }
    },
    [
      threads,
      removeThread,
      pushMailUndo,
      activeFolder,
      tab,
      listCacheKey,
    ]
  );

  const unsnooze = React.useCallback(
    async (t: { account: string; threadId: string }) => {
      const key = threadKey(t);
      const before = threads;
      hideRowUntilRef.current.delete(key);
      removeThread(key);
      try {
        await apiJson("/api/mail/unsnooze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(t),
        });
        setSnoozedCount((n) => {
          const current = n == null ? 1 : n;
          return Math.max(0, current - 1);
        });
        toast.success(mailSay("snoozeCancelled"));
      } catch (err) {
        setThreads(before);
        toast.error(
          err instanceof Error ? err.message : "Couldn't cancel snooze"
        );
      }
    },
    [threads, removeThread]
  );

  /**
   * Sync, as the reader means it: everything, including the thread on screen.
   *
   * Refreshing the list alone was not enough. A thread's body is cached and
   * held fresh while its newest message is unchanged — and a reply written in
   * Gmail is a draft, not a message, so the thread's tip does not move and
   * nothing here had any reason to look again. The draft stayed invisible
   * however many times Sync was pressed.
   */
  /**
   * The button spins for at least one turn.
   *
   * A poll that finds nothing new answers in a moment, and the icon started
   * and stopped inside a fifth of a second — a twitch, in the middle of a
   * rotation, which reads as a sync that failed rather than one that found
   * nothing. A whole turn is a movement, and it ends where it began.
   *
   * `animate-spin` is a one second rotation, so the floor is one second: any
   * other number stops the icon mid-way round.
   */
  const [syncTurn, setSyncTurn] = React.useState(false);
  const syncTurnRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (syncTurnRef.current) clearTimeout(syncTurnRef.current);
    },
    []
  );

  const syncNow = React.useCallback(() => {
    if (selected) {
      invalidateCachedMailThread(selected.account, selected.threadId);
    }
    setSyncTurn(true);
    if (syncTurnRef.current) clearTimeout(syncTurnRef.current);
    syncTurnRef.current = setTimeout(() => {
      syncTurnRef.current = null;
      setSyncTurn(false);
    }, 1000);
    /*
      And say what came in, when something did.

      A poll that finds nothing changes nothing on screen, which is the right
      answer and an easy one to read as "it did not run". The turn of the icon
      says it ran; this says what it found, and stays quiet when the answer is
      nothing — a message saying "no new mail" after every press is a message
      nobody thanks you for.
    */
    const before = new Set(threadsRef.current.map((t) => threadKey(t)));
    void loadThreads({ fresh: true, incremental: true }).then((ok) => {
      if (!ok) return;
      const arrived = threadsRef.current.filter(
        (t) => !before.has(threadKey(t))
      ).length;
      if (!arrived) return;
      toast.success(
        arrived === 1
          ? mailSay("syncFoundOne")
          : mailSay("syncFoundMany", { count: arrived })
      );
    });
  }, [loadThreads, selected]);

  /**
   * What the providers are holding, across every mailbox that can hold.
   *
   * Its own group above the days, and only when there is something in it —
   * an empty heading is one more thing to read and rule out. Refreshed on a
   * slow timer so a row leaves the group when its message goes.
   */
  const [heldMessages, setHeldMessages] = React.useState<
    MailScheduledMessage[]
  >([]);
  const loadHeldMessages = React.useCallback(async () => {
    try {
      const json = await apiJson<{ messages?: MailScheduledMessage[] }>(
        "/api/mail/scheduled"
      );
      setHeldMessages(json.messages ?? []);
    } catch {
      // No Outlook, or the provider would not say. Show no group.
      setHeldMessages([]);
    }
  }, []);
  React.useEffect(() => {
    void loadHeldMessages();
    const timer = window.setInterval(() => void loadHeldMessages(), 60_000);
    const onFocus = () => void loadHeldMessages();
    window.addEventListener("focus", onFocus);
    // The thread says so the moment one is cancelled, sent, or edited. The
    // timer is for messages that leave on their own, at their time.
    const stopListening = onScheduledChanged(() => void loadHeldMessages());
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      stopListening();
    };
  }, [loadHeldMessages]);

  /** Held in a ref: the key handler above is created before this exists. */
  const openThreadRef = React.useRef<
    ((t: MailThreadSummary) => void) | null
  >(null);

  const openThread = React.useCallback((t: MailThreadSummary) => {
    setComposing(false);
    setListExpanded(false);
    setSelected({
      account: t.account,
      threadId: t.threadId,
      inCrm: t.tab === "people",
      focusMessageId: t.focusMessageId,
    });
    /**
     * Tell the provider it has been read.
     *
     * Fetching the thread does this too, but only when the fetch is actually
     * made. A thread whose body was prefetched paints straight from the cache
     * and asks the server nothing — the prefetch deliberately passes
     * `markRead=0` so warming a body does not clear unread badges, and the
     * open that follows never sends anything at all. So the read state stayed
     * on this machine, looked right, and the next sync put the bold back.
     * Marking read by hand from the settings menu always worked, because that
     * has an endpoint of its own; opening a thread had none.
     */
    if (t.unread) {
      void apiJson("/api/mail/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: t.account, threadId: t.threadId }),
      }).catch((err) => {
        console.warn("[mail] could not mark the thread read:", err);
      });
    }
    setThreads((current) => {
      const next = current.map((item) =>
        threadKey(item) === threadKey(t) ? { ...item, unread: false } : item
      );
      patchCachedThreads(viewerId, listCacheKey, next);
      return next;
    });
  }, [listCacheKey]);
  openThreadRef.current = openThread;

  /**
   * A discard still inside its undo window when the window closes.
   *
   * Sending it beats losing it: the reader has had their chance to take it
   * back, and dropping the request would leave a draft in Gmail that this app
   * said it had thrown away. Best effort — a request started this late is not
   * guaranteed to finish, and if it does not, the draft simply stays.
   */
  React.useEffect(() => {
    const onHide = () => flushPendingDiscards();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  /**
   * A forward asked for from a chat popout.
   *
   * That window has no recipient picker and no subject line, so it asks this
   * one. Open the thread and hand the message to the reader, which does have
   * a composer. Both channels, for the same reason the sent signal uses both.
   */
  const [pendingForward, setPendingForward] =
    React.useState<MailForwardRequest | null>(null);

  React.useEffect(() => {
    const take = (raw: unknown) => {
      const request = readForwardRequest(raw);
      if (!request) return;
      setComposing(false);
      setSelectedPersonKey(null);
      setSelected({
        account: request.account,
        threadId: request.threadId,
        inCrm: false,
      });
      setPendingForward(request);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== MAIL_FORWARD_REQUEST_KEY || !event.newValue) return;
      take(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    const tauriEvent = (
      window as unknown as {
        __TAURI__?: {
          event?: {
            listen?: (
              name: string,
              handler: (event: { payload: unknown }) => void
            ) => Promise<() => void>;
          };
        };
      }
    ).__TAURI__?.event;
    if (tauriEvent?.listen) {
      void tauriEvent
        .listen("mail-forward", (event) => take(event.payload))
        .then((fn) => {
          if (cancelled) fn();
          else unlisten = fn;
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      unlisten?.();
    };
  }, []);

  // Keep pin snapshots fresh when the inbox refetch returns newer rows.
  React.useEffect(() => {
    if (threads.length) syncMailPinSummaries(threads);
  }, [threads]);

  // Pinned band: All + folder views only (not People/Other/Sent), never search.
  const showPinnedBand =
    viewMode === "threads" &&
    !debouncedSearch &&
    (tab === "all" || activeFolder != null);

  const pinnedThreads: MailThreadSummary[] = showPinnedBand
    ? pins
        .flatMap((pin) => {
          const live = threads.find(
            (t) => t.account === pin.account && t.threadId === pin.threadId
          );
          if (live) return [live];
          // Archived pins stay in All; don't leak them into a label folder.
          if (activeFolder) return [];
          return [pin.summary];
        })
        .filter((t) =>
          accountPassesMailboxScope(
            t.account,
            mailboxScopeEmails,
            accountEmails
          )
        )
    : [];

  /**
   * Tokens to narrow by while waiting, and empty once the server has answered.
   *
   * The search is debounced and runs across every mailbox, so it feels stuck
   * if nothing moves until it returns. Narrowing the rows already on screen
   * gives an answer on the first keystroke. As soon as results for this exact
   * query land, `resultsQuery` matches and this empties — the server's answer
   * is then shown whole, including hits it found in message bodies that no
   * local check could see.
   */
  const pendingTokens = React.useMemo(
    () => (search.trim() === resultsQuery ? [] : searchTokens(search)),
    [search, resultsQuery]
  );

  const searchedVisible = pendingTokens.length
    ? visible.filter((t) => matchesTokens(threadHaystack(t), pendingTokens))
    : visible;

  const flowThreads = showPinnedBand
    ? searchedVisible.filter((t) => !pinKeySet.has(threadKey(t)))
    : searchedVisible;

  // Keep successor lookup in sync with what the list actually shows.
  const screenThreadOrder = showPinnedBand
    ? [...pinnedThreads, ...flowThreads]
    : flowThreads;
  screenThreadOrderRef.current = screenThreadOrder;

  // Warm top-of-list bodies so open / post-delete successor paints from cache.
  // Wait until the list is idle so prefetch does not compete with mailbox refresh.
  const prefetchOrderKey = screenThreadOrder
    .slice(0, 15)
    .map((t) => `${threadKey(t)}@${t.lastAt}`)
    .join("|");
  React.useEffect(() => {
    if (loadingList || refreshing) return;
    if (!screenThreadOrderRef.current.length) return;
    return scheduleMailThreadPrefetch(screenThreadOrderRef.current, {
      delayMs: 800,
    });
  }, [listCacheKey, prefetchOrderKey, loadingList, refreshing]);

  // Browse: group by day. Search / snoozed: one flat list (no day buckets).
  const groups: {
    /** The day heading's key, or "" for a flat list with no headings. */
    label: MailStringKey | "";
    items: MailThreadSummary[];
  }[] = [];
  if (debouncedSearch || tab === "snoozed") {
    if (flowThreads.length) groups.push({ label: "", items: flowThreads });
  } else {
    for (const t of flowThreads) {
      const label = dayBucket(t.lastAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(t);
      else groups.push({ label, items: [t] });
    }
  }

  // One row per correspondent for the People view.
  const { connecting, connect } = useMailConnect();
  const personPins = useMailPersonPins();
  /**
   * By-person list, narrowed by the same waiting rule as the thread list.
   *
   * Grouped from the unnarrowed rows, then matched on the person as well as
   * their mail: someone found by CRM name or by the words in their address
   * must survive even when no thread text carries the query.
   */
  const personRows = React.useMemo(() => {
    if (viewMode !== "people") return [];
    const grouped = orderByPersonPin(groupThreadsByPerson(visible));
    if (!pendingTokens.length) return grouped;
    return grouped.filter((row) =>
      matchesTokens(
        [
          row.name,
          row.email,
          row.crmName ?? "",
          emailLocalWords(row.email),
          ...row.threads.map(threadHaystack),
        ].join(" "),
        pendingTokens
      )
    );
    // pendingTokens is derived from search + resultsQuery each render.
  }, [viewMode, visible, pendingTokens]);
  personRowOrderRef.current = personRows;
  // Read so the list re-sorts the moment a pin changes.
  void personPins;
  const draftKeys = useThreadDraftKeys();
  const selectedPerson = selectedPersonKey
    ? (personRows.find((r) => r.key === selectedPersonKey) ?? null)
    : null;

  /**
   * The open thread's row in the list, when the list holds one.
   *
   * It carries the state the reader's own actions need to read — whether the
   * thread is unread, when it is snoozed until. A thread reached from a search
   * hit or a deep link can be open without being in the list at all.
   */
  const selectedRow = selected
    ? (threads.find((t) => threadKey(t) === threadKey(selected)) ?? null)
    : null;

  const openPerson = (row: PersonRow) => {
    setComposing(false);
    setListExpanded(false);
    setSelected(null);
    setSelectedPersonKey(row.key);
  };

  const hideList = listCollapsed && detailOpen;

  /**
   * Whether the rail and the empty reader still fit — see the note on
   * RAIL_GIVES_WAY_BELOW.
   *
   * `railOpen` stays exactly as the reader left it. What narrows is only
   * whether it is shown, so widening the window brings the folders back
   * without anybody having to ask for them twice.
   *
   * A width of nought means it has not been measured yet, and a first paint
   * that hides things it is about to show is worse than one that shows
   * things it is about to hide.
   */

  /**
   * Avatar-rail mode: left/right list dragged below the readable min.
   * Top/bottom keep a normal height strip (no avatar-column analogue).
   */
  const listNarrow =
    !listVertical && !listExpanded && listWidth <= NARROW_LIST_WIDTH;
  // Vertical layout still fades while dragging toward hide; horizontal snaps
  // discretely to the rail, so a mid-drag fade isn't useful there.
  const listNearSnap =
    detailOpen && listVertical && listHeight < SNAP_HIDE_LIST_HEIGHT;
  const listFirst =
    listPlacement === "left" || listPlacement === "top";
  /**
   * The folders travel with the list.
   *
   * They are the list's own heading — which mailbox and which folder these
   * threads came from — so with the list moved to the right of the reader,
   * the rail belongs on the far side of it and not stranded across the
   * window from what it names. Above and below, the list runs the width of
   * the window and has no far side, so the rail stays where it was.
   */
  const railOnRight = listPlacement === "right";
  /**
   * Where the thread list's own controls begin, in px from the left edge of
   * the window.
   *
   * The list column starts after the rail and the gutter between them, and
   * holds its contents in from there — so New email, the first thing in it,
   * stands here. Published to the shell so a title strip laid out from the
   * left edge of the window can stand its own first control in the same
   * column (the standalone app on Windows does — see `--mail-titlebar-left`
   * in apps/mail/src/standalone.css). Only the column's own inset when
   * there is no rail to the left of the list to clear.
   */
  const listControlsLeft =
    (!hideList && railShowing && !railOnRight ? railWidth + RAIL_GUTTER : 0) +
    LIST_COLUMN_PAD;
  const listBorderClass =
    listPlacement === "left"
      ? "border-r"
      : listPlacement === "right"
        ? "border-l"
        : listPlacement === "top"
          ? "border-b"
          : "border-t";
  const chromeIconBtn = cn(
    "rounded-md p-1.5",
    chromeDark
      ? "text-[var(--mail-chrome-muted)] hover:bg-[var(--mail-chrome-hover)] hover:text-[var(--mail-chrome-fg)]"
      : "text-stone-500 hover:bg-stone-200/70 hover:text-stone-800"
  );
  /*
   * The title bar starts where the traffic lights end, in every layout.
   *
   * It used to start somewhere different in each: pinned 380px in from the
   * left so the search field met the reading pane's edge on the default
   * layout, tight against the window on some others, clear of the lights on
   * the rest. Moving the list moved the controls, and the row you reach for
   * without looking was never twice in the same place.
   */
  const folderApiAccount = mailboxScopeApiAccount(
    mailboxScopeEmails,
    accountEmails
  );
  const onMailboxVisibilityChange = React.useCallback(
    (email: string, inMailTab: boolean) => {
      const key = email.toLowerCase();
      setAccountEmails((prev) => {
        if (!inMailTab) {
          return prev.filter((e) => e.toLowerCase() !== key);
        }
        if (prev.some((e) => e.toLowerCase() === key)) return prev;
        return [...prev, email];
      });
      if (!inMailTab) {
        setMailboxScopeEmails((prev) =>
          prev.filter((e) => e.toLowerCase() !== key)
        );
      }
    },
    []
  );
  /**
   * Put one mailbox in front of another, from the folder rail.
   *
   * The whole arrangement is written down, not the one move: it is the
   * reader's own order of their mailboxes, and it belongs to them rather than
   * to Gmail or to Outlook — see `@/lib/mail/account-order` for why neither
   * provider can hold it. `before` is null for the end of the list.
   */
  const onReorderAccount = React.useCallback(
    (moved: string, before: string | null) => {
      setAccountEmails((prev) => {
        const next = moveAccountBefore(prev, moved, before);
        writeAccountOrder(next);
        return next;
      });
    },
    []
  );

  const foldersMenu = (iconOnly: boolean) => (
    <FoldersTabMenu
      onNavy={chromeDark}
      iconOnly={iconOnly}
      folders={folders}
      loading={foldersLoading}
      onMenuOpen={() => void refreshFolders()}
      onOpenFolder={(f) => {
        setActiveFolder({ ...f, account: null });
        setSelected(null);
        setSelectedPersonKey(null);
      }}
      onOpenSent={() => {
        setActiveFolder(null);
        setSelected(null);
        setSelectedPersonKey(null);
        setTab("sent");
      }}
      draftCount={drafts.length || null}
      onOpenDrafts={() => {
        setActiveFolder(null);
        setSelected(null);
        setSelectedPersonKey(null);
        setTab("drafts");
        refreshDrafts();
      }}
      onOpenTrash={() => {
        setActiveFolder(null);
        setSelected(null);
        setSelectedPersonKey(null);
        setTab("trash");
      }}
      onOpenJunk={() => {
        setActiveFolder(null);
        setSelected(null);
        setSelectedPersonKey(null);
        setTab("junk");
      }}
      onDropThread={(folderName, thread) =>
        moveToFolder(thread, folderName, false)
      }
      onCreateFolder={async (name) => {
        const json = await apiJson<{ folder: MailFolder }>(
          "/api/mail/folders",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              ...(folderApiAccount ? { account: folderApiAccount } : null),
            }),
          }
        );
        await refreshFolders();
        // Stay where you are. A new folder is empty, and it is made in order
        // to put something in it — opening it takes you away from the mail
        // you meant to file.
        toast.success(mailSay("folderReady", { name: json.folder.name }));
      }}
    />
  );

  /**
   * The four unified views, as the rail lights them.
   *
   * A folder being open beats a tab: opening Academia out of the rail
   * leaves `tab` on whatever it was, and Sent must not stay lit.
   */
  const railSystemView = activeFolder
    ? null
    : tab === "sent"
      ? "sent"
      : tab === "drafts"
        ? "drafts"
        : tab === "trash"
          ? "trash"
          : tab === "junk"
            ? "junk"
            : null;

  const folderRail = (
    <MailFolderRail
      accountFolders={accountFolders}
      loading={foldersLoading}
      onReorderAccount={onReorderAccount}
      accounts={accountEmails}
      openFolder={
        activeFolder
          ? { account: activeFolder.account, name: activeFolder.name }
          : null
      }
      systemView={railSystemView}
      draftCount={drafts.length || null}
      draggingAccount={draggingAccount}
      side={railOnRight ? "right" : "left"}
      onClose={() => setRailOpen(false)}
      onOpenFolder={(account, name) => {
        const known = accountFolders.find(
          (f) =>
            f.account.toLowerCase() === account.toLowerCase() &&
            f.name.toLowerCase() === name.toLowerCase()
        );
        setActiveFolder({
          account,
          name,
          count: known?.count ?? 0,
          role: known?.role,
          virtual: known?.virtual,
        });
        setSelected(null);
        setSelectedPersonKey(null);
      }}
      onOpenSent={() => {
        setActiveFolder(null);
        setSelected(null);
        setSelectedPersonKey(null);
        setTab("sent");
      }}
      onOpenDrafts={() => {
        setActiveFolder(null);
        setSelected(null);
        setSelectedPersonKey(null);
        setTab("drafts");
        refreshDrafts();
      }}
      onOpenTrash={() => {
        setActiveFolder(null);
        setSelected(null);
        setSelectedPersonKey(null);
        setTab("trash");
      }}
      onOpenJunk={() => {
        setActiveFolder(null);
        setSelected(null);
        setSelectedPersonKey(null);
        setTab("junk");
      }}
      onDropThread={(account, folderName) => {
        // Read before the drag is cleared: the window-level dragend that
        // clears it runs after this, because a React handler is called from
        // the root container on the way up.
        const thread = draggingMailThread();
        clearMailThreadDrag();
        // The rail refuses a foreign mailbox already; this is the same rule
        // where it is enforced rather than drawn.
        if (!thread || thread.account.toLowerCase() !== account.toLowerCase()) {
          return;
        }
        return moveToFolder(thread, folderName, false);
      }}
      onDropTrash={() => {
        const thread = draggingMailThread();
        clearMailThreadDrag();
        if (!thread) return;
        return trash(thread);
      }}
      onDropJunk={() => {
        const thread = draggingMailThread();
        clearMailThreadDrag();
        if (!thread) return;
        return setThreadJunk(thread, true);
      }}
      onCreateFolder={async (account, name) => {
        const json = await apiJson<{ folder: MailFolder }>(
          "/api/mail/folders",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, account }),
          }
        );
        await refreshFolders();
        // Stay where you are. A new folder is empty, and it is made in
        // order to put something in it.
        toast.success(mailSay("folderReady", { name: json.folder.name }));
      }}
      onRenameFolder={async (account, name, newName) => {
        /**
         * Say it is happening, because it takes seconds.
         *
         * The provider does the work and then the whole folder list is
         * read back, and until both are done the rail can only show the
         * folder where it was. A message that arrives with the result
         * arrives after the wait it was meant to explain.
         *
         * A move and a rename are the same call and not the same sentence:
         * the parent changing is a move, the last part changing is a
         * rename, and the folder is told apart from its place by comparing
         * the two names rather than by being passed a flag.
         */
        const parentOf = (path: string) =>
          path.split("/").slice(0, -1).join("/");
        const moved = parentOf(name) !== parentOf(newName);
        const leaf = newName.split("/").pop() ?? newName;
        const into = parentOf(newName);
        const pending = toast.loading(
          moved
            ? `Moving ${leaf} to ${into || "the top level"}…`
            : `Renaming to ${leaf}…`,
          { description: "This can take a few seconds to reach the server." }
        );
        try {
          // On that mailbox only. Without the account this renames the
          // folder on every account that happens to share its name, which
          // is what the merged menu meant by a folder and is not what a row
          // under one mailbox's heading means.
          await apiJson<{ folder: MailFolder }>("/api/mail/folders", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, newName, account }),
          });
        } catch (err) {
          toast.dismiss(pending);
          throw err;
        }
        await refreshFolders();
        // The open folder was that folder. Follow it, rather than leaving
        // the reader looking at a list headed by a name nothing has.
        setActiveFolder((current) =>
          current &&
          current.name.toLowerCase() === name.toLowerCase() &&
          (current.account ?? "").toLowerCase() === account.toLowerCase()
            ? { ...current, name: newName }
            : current
        );
        toast.success(
          moved
            ? `${leaf} moved to ${into || "the top level"}`
            : `Renamed to ${leaf}`,
          { id: pending, description: undefined }
        );
      }}
      onDeleteFolder={async (account, name) => {
        // On that mailbox only, for the same reason the rename is: a row
        // under one heading means that mailbox's folder, and no other.
        await apiJson("/api/mail/folders", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, account }),
        });
        await refreshFolders();
        // Standing in a folder that no longer exists is standing nowhere.
        setActiveFolder((current) =>
          current &&
          current.name.toLowerCase() === name.toLowerCase() &&
          (current.account ?? "").toLowerCase() === account.toLowerCase()
            ? null
            : current
        );
        toast.success(`${name} deleted`);
      }}
    />
  );

  const listTabsOrFolder = activeFolder ? (
    <FolderViewHeader
      onNavy={chromeDark}
      folder={(() => {
        const meta =
          folders.find(
            (f) => f.name.toLowerCase() === activeFolder.name.toLowerCase()
          ) ?? activeFolder;
        return {
          ...meta,
          count: debouncedSearch
            ? meta.count
            : Math.max(threads.length, meta.count),
        };
      })()}
      onBack={() => setActiveFolder(null)}
      onOpenParent={(path) => {
        // Up one level, on the mailbox this folder was opened from. A
        // parent standing in for one nobody made has no count of its own,
        // so it opens on nothing until the list comes back.
        const known = accountFolders.find(
          (f) =>
            (activeFolder.account ?? "").toLowerCase() ===
              f.account.toLowerCase() &&
            f.name.toLowerCase() === path.toLowerCase()
        );
        setActiveFolder({
          account: activeFolder.account,
          name: path,
          count: known?.count ?? 0,
          role: known?.role,
          virtual: known?.virtual,
        });
        setSelected(null);
        setSelectedPersonKey(null);
      }}
    />
  ) : (
    <div
      className={cn(
        "text-sm",
        // In the controls column (normal + expanded list); top/bottom layout
        // mounts tabs above the thread list instead.
        !listVertical && "mt-3"
      )}
    >
      {/*
        Two rows, and the second one grows when it is asked to.

        The first says whose mail this is — All, or one mailbox — and it gets
        the width to itself, because that is the row a reader reads along.

        The second holds the folders and the funnel, and the filters unroll
        along it when the funnel is pressed: they belong to that button, so
        they come out beside it rather than starting a row of their own. A
        reader who wants everything from one mailbox, which is most of the
        time, never sees them.
      */}
      <div>
        <MailAccountTabs
          accounts={accountEmails}
          labels={accountLabels}
          isOutlookAccount={isOutlookAccount}
          selected={mailboxScopeEmails}
          onSelect={setMailboxScopeEmails}
          onReorder={(next) => {
            // The row writes the arrangement itself, All among the mailboxes.
            // This is the list answering at once, before the store's own
            // event comes back around.
            setAccountEmails(next);
          }}
          onNavy={chromeDark}
        />
      </div>

      {/*
        Under the tabs, not beside them.

        Beside them they were two more things competing for a sidebar's worth
        of width with the mailboxes, which are the row's whole point — and the
        first thing to be squeezed out was the mailbox at the end. Underneath,
        the tabs get the width and these two get their names.
      */}
      <div className="mt-2 flex items-center gap-2">
        {!railShowing ? (
          <MailRowButton
            icon={Folder}
            label={t("folders")}
            onNavy={chromeDark}
            onClick={() => setRailOpen(true)}
            onDragEnter={(e: React.DragEvent) => {
              // Dragging a conversation at the folders asks for the folders.
              // It opens and stays open — the rail is not a menu that springs
              // shut again once the drop has landed.
              if (!isMailThreadDrag(e.dataTransfer)) return;
              e.preventDefault();
              setRailOpen(true);
            }}
            onDragOver={(e: React.DragEvent) => {
              if (!isMailThreadDrag(e.dataTransfer)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
          />
        ) : null}
        <MailRowButton
          icon={Funnel}
          label={t("filterLabel")}
          // Lit while the filters are showing, and only then. Lighting it
          // because a filter happened to be on made it look like the chosen
          // one of a pair of buttons, which it is not.
          active={filterRowOpen}
          aria-expanded={filterRowOpen}
          onNavy={chromeDark}
          onClick={() => setFilterRowOpen(!filterRowOpen)}
        />

        {filterRowOpen ? (
        /* The half-rem of padding, and the same again in negative margin, is
           room for a chip's own outline. A scroller clips at its box, and the
           first chip sat exactly on that edge — so the left of its border was
           shaved off, which read as a chip half out of the row. The margin
           puts the row back where it was. */
        <div className="-mx-0.5 min-w-0 flex-1 overflow-x-auto px-0.5 py-0.5 [scrollbar-width:thin]">
          <DndContext
            sensors={tabReorderSensors}
            collisionDetection={closestCenter}
            onDragStart={() => {
              tabReorderSuppressClick.current = true;
            }}
            onDragEnd={(event) => {
              const { active, over } = event;
              if (over && active.id !== over.id) {
                const oldIndex = tabOrder.indexOf(active.id as MailListTab);
                const newIndex = tabOrder.indexOf(over.id as MailListTab);
                if (oldIndex >= 0 && newIndex >= 0) {
                  setTabOrder(arrayMove(tabOrder, oldIndex, newIndex));
                }
              }
              // Drop can synthesize a click — ignore that one.
              window.setTimeout(() => {
                tabReorderSuppressClick.current = false;
              }, 0);
            }}
          >
            <SortableContext
              items={tabOrder}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex w-max items-center gap-2 py-0.5 pr-2">
                {tabOrder.map((id) => {
                  const listId = parseCustomListTabId(id);
                  const custom = listId
                    ? customListById.get(listId)
                    : undefined;
                  const label = custom
                    ? custom.name
                    : mailBuiltinTabLabels(t)[id] ?? id;
                  return (
                    <SortableMailListTab
                      key={id}
                      id={id}
                      label={label}
                      active={tab === id}
                      suppressClick={tabReorderSuppressClick}
                      onSelect={() => {
                        setActiveFolder(null);
                        // The first press chooses the list. Pressing the one
                        // already chosen is what opens it for editing: a
                        // reader switching between two lists was being handed
                        // the editor every time they switched.
                        const alreadyOn = tab === id;
                        setTab(id);
                        if (!alreadyOn) return;
                        // A list of your own opens whole; a built-in filter
                        // opens at its schedule, which is all there is to it.
                        if (custom) setListEditor(custom.id);
                        else if (MAIL_LIST_TABS.includes(id)) setListEditor(id);
                      }}
                      onEdit={
                        custom ? () => setListEditor(custom.id) : undefined
                      }
                    />
                  );
                })}
                {tab === "sent" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFolder(null);
                      setTab("sent");
                    }}
                    className="shrink-0 whitespace-nowrap border-b-[3px] border-[var(--mail-tab-active)] pb-0.5 font-medium text-[var(--mail-chrome-fg)]"
                  >
                    {mailBuiltinTabLabels(t).sent}
                  </button>
                ) : null}
                {tab === "junk" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFolder(null);
                      setTab("junk");
                    }}
                    className="shrink-0 whitespace-nowrap border-b-[3px] border-[var(--mail-tab-active)] pb-0.5 font-medium text-[var(--mail-chrome-fg)]"
                  >
                    {mailBuiltinTabLabels(t).junk}
                  </button>
                ) : null}
                {tab === "trash" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFolder(null);
                      setTab("trash");
                    }}
                    className="shrink-0 whitespace-nowrap border-b-[3px] border-[var(--mail-tab-active)] pb-0.5 font-medium text-[var(--mail-chrome-fg)]"
                  >
                    {mailBuiltinTabLabels(t).trash}
                  </button>
                ) : null}
                {tab === "drafts" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFolder(null);
                      setTab("drafts");
                    }}
                    className="shrink-0 whitespace-nowrap border-b-[3px] border-[var(--mail-tab-active)] pb-0.5 font-medium text-[var(--mail-chrome-fg)]"
                  >
                    {mailBuiltinTabLabels(t).drafts}
                  </button>
                ) : null}
                {tab === "snoozed" ||
                (snoozedCount != null && snoozedCount > 0) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFolder(null);
                      setTab("snoozed");
                    }}
                    className={cn(
                      "shrink-0 whitespace-nowrap border-b-[3px] pb-0.5 font-medium",
                      tab === "snoozed"
                        ? "border-[var(--mail-tab-active)] text-[var(--mail-chrome-fg)]"
                        : "border-transparent text-[var(--mail-chrome-muted)] hover:text-[var(--mail-chrome-fg)]"
                    )}
                  >
                    {mailBuiltinTabLabels(t).snoozed}
                  </button>
                ) : null}
                <button
                  type="button"
                  title={t("newList")}
                  aria-label={t("newListTab")}
                  aria-expanded={listEditor != null}
                  onClick={() =>
                    setListEditor((prev) =>
                      prev == null ? "create" : null
                    )
                  }
                  className={cn(
                    // Transparent bottom border keeps height aligned with tabs;
                    // active state is the inset square (not ring — overflow-x
                    // on the tab scroller would clip a ring's top edge).
                    "flex shrink-0 items-center border-b-[3px] border-transparent pb-0.5",
                    listEditor != null
                      ? "text-teal-700"
                      : "text-[var(--mail-chrome-muted)] hover:text-[var(--mail-chrome-fg)]"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded",
                      listEditor != null
                        ? "border border-teal-600"
                        : "border border-transparent"
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                </button>
              </div>
            </SortableContext>
          </DndContext>
        </div>
        ) : null}
      </div>
      <MailCustomListEditor
        open={listEditor != null}
        onCancel={() => setListEditor(null)}
        scheduleOnly={Boolean(editingBuiltin)}
        title={
          editingBuiltin
            ? mailBuiltinTabLabels(t)[editingBuiltin] ?? editingBuiltin
            : editingList
              ? t("editList")
              : t("newList")
        }
        submitLabel={editingList || editingBuiltin ? t("save") : t("createList")}
        initial={
          editingBuiltin
            ? {
                name: editingBuiltin,
                members: [],
                scheduleDefault: Boolean(tabSchedules[editingBuiltin]),
                scheduleFrom: tabSchedules[editingBuiltin]?.from,
                scheduleTo: tabSchedules[editingBuiltin]?.to,
                scheduleDays: tabSchedules[editingBuiltin]?.days,
              }
            : editingList
              ? {
                  name: editingList.name,
                  members: editingList.members,
                  scheduleDefault: editingList.scheduleDefault,
                  scheduleFrom: editingList.scheduleFrom,
                  scheduleTo: editingList.scheduleTo,
                  scheduleDays: editingList.scheduleDays,
                }
              : undefined
        }
        onSubmit={(name, members, schedule) => {
          if (editingBuiltin) {
            setTabSchedule(editingBuiltin, schedule.enabled ? schedule : null);
            setListEditor(null);
            return;
          }
          if (editingList) {
            updateCustomList(editingList.id, {
              name,
              members,
              schedule,
            });
            setListEditor(null);
            return;
          }
          const list = createCustomList(name, members, schedule);
          const tabId = customListTabId(list.id);
          setTabOrder([...tabOrder, tabId]);
          setActiveFolder(null);
          setTab(tabId);
          setListEditor(null);
        }}
        onDelete={
          editingList
            ? () => {
                const tabId = customListTabId(editingList.id);
                deleteCustomList(editingList.id);
                setTabOrder(tabOrder.filter((id) => id !== tabId));
                if (tab === tabId) setTab("people");
                setListEditor(null);
              }
            : undefined
        }
      />
    </div>
  );

  return (
    <div
      ref={mailSurfaceRef}
      className="mail-shell flex h-dvh min-h-0 flex-1 flex-col overflow-hidden bg-[var(--mail-chrome)]"
      data-theme={colorMode}
      style={
        {
          "--mail-list-controls-left": `${listControlsLeft}px`,
          // How long anything following that column takes to catch up with
          // it: the length of the rail's slide, and nothing at all while the
          // rail is being dragged, where a lag would be a control trailing
          // the pointer.
          "--mail-rail-slide": railResizing ? "0ms" : `${RAIL_SLIDE_MS}ms`,
        } as React.CSSProperties
      }
    >
      {/* Overlay title bar — same height as the Mac traffic-light strip
          (matches .dh-titlebar / NativeTitleDragStrip h-11). Search sits in
          this row like Outlook, not in a second toolbar underneath.
          `deep` makes empty chrome draggable; inputs stay interactive. */}
      <div
        data-tauri-drag-region="deep"
        className="mail-titlebar relative flex h-11 shrink-0 items-center gap-3 border-b bg-[var(--mail-chrome)]"
        style={{
          borderColor: "var(--mail-chrome-border)",
          // Where the row stops. A shell that puts window buttons at the
          // right of the strip (the standalone app on Windows) sets this.
          paddingRight: "var(--mail-titlebar-right, 12px)",
          /*
           * Where the controls start: the sidebar's default width on a big
           * window, so tabs and search stand over the reading pane rather
           * than crowding the traffic lights. The clamp gives that back as
           * the window narrows — the middle term is the room the controls
           * themselves need (their 768px max, the right padding, a little
           * slack) — down to a floor that still clears the lights.
           *
           * The same rule in every layout, so the row the reader reaches
           * for without looking is always in the same place; and a rule of
           * the window's width, not the sidebar's, so dragging the sidebar
           * does not drag the search field.
           *
           * A shell with no traffic lights to clear overrides the whole rule
           * through the variable — the standalone app's Windows window
           * stands the row over the list column instead, and follows it in
           * and out with the rail. See apps/mail/src/standalone.css.
           */
          paddingLeft:
            "var(--mail-titlebar-left, clamp(80px, calc(100vw - 800px), 380px))",
        }}
      >
        {/* Thread/person, density and settings, then search takes the rest.
            A shell can put the search first instead — see the standalone
            app's Windows window in apps/mail/src/standalone.css. */}
        <div className="mail-titlebar-controls -ml-[4px] flex min-w-0 max-w-3xl flex-1 items-center gap-2">
          <MailViewModeTabs
            viewMode={viewMode}
            onChange={setViewMode}
            onNavy={chromeDark}
          />
          <ListDensityToggle
            density={listDensity}
            onChange={setListDensity}
            onNavy={chromeDark}
          />
          <MailLayoutMenu
            onNavy={chromeDark}
            // It opens below the button now rather than off the right edge,
            // so it lines up with its left side.
            align="start"
            knownEmails={accountEmails}
            onVisibilityChange={onMailboxVisibilityChange}
            onAccountsChanged={() => {
              void loadThreads({ fresh: true });
            }}
            autoReplies={autoReplies}
            onSetUpAutoReply={(account) => {
              setAutoReplyAccount(account);
              setAutoReplyOpen(true);
            }}
            onEndAutoReply={(account) => void endAutoReply(account)}
            ownIdentity={ownIdentity}
            onOwnIdentityChange={onOwnIdentityChange}
          />
          <label
            className={cn(
              "mail-titlebar-search",
              // h-7 (~28px) centers with traffic lights in the 44px strip.
              "relative flex h-7 min-w-0 flex-1 items-center rounded-full border border-stone-200 bg-white shadow-sm",
              "focus-within:ring-2 focus-within:ring-[var(--mail-title-search-ring)]"
            )}
          >
            {/* Which mailboxes to search is which mailbox the tabs are
                showing, so no menu for that here any more. What is left is
                the one thing that is about the searching rather than about
                the list: whether deleted mail answers. */}
            <SearchOptionsMenu
              includeDeleted={searchDeleted}
              onIncludeDeletedChange={setSearchDeleted}
            />
            <Search
              className="pointer-events-none h-3.5 w-3.5 shrink-0 text-stone-400"
              aria-hidden
            />
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={mailSearchPlaceholder({
                folderName: activeFolder?.name ?? null,
                customListName: activeCustomList?.name ?? null,
                tab,
                t,
              })}
              className="h-full min-w-0 flex-1 border-0 bg-transparent py-1 pl-2 pr-8 text-[13px] text-stone-800 outline-none placeholder:text-stone-400 shadow-none [&::-webkit-search-cancel-button]:hidden"
            />
            {search ? (
              <button
                type="button"
                title={t("clearSearch")}
                aria-label={t("clearSearch")}
                className="absolute right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                onPointerDown={beginNativeWindowDragOnMove}
                onClick={() => setSearch("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>
        </div>
      </div>

      {/* The rail stands outside the pane row rather than inside it: the
          pane may be laid out top-to-bottom (list over reader), and the
          folders run down the side of both however that is set. */}
      <div
        ref={paneRowRef}
        className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      >
      {!hideList ? (
        <div
          style={{
            width: railShowing ? railWidth : 0,
            order: railOnRight ? 3 : 1,
          }}
          className={cn(
            "relative shrink-0 overflow-hidden",
            // Closed and finished closing: out of the tab order, rather
            // than a strip of nothing that can still be tabbed into.
            railHidden && "invisible",
            // Not while it is being dragged. The slide and the drag animate
            // the same property, so a rail being resized would trail the
            // pointer by the length of the opening.
            !railResizing &&
              "transition-[width] duration-200 ease-out motion-reduce:transition-none"
          )}
        >
          {/*
            Its own width, held against the right edge of the box whose
            width is changing.

            Its own width, because a rail laid out again at every width on
            the way would re-wrap every folder name sixty times per slide.
            Held to the right, because that is what makes it a slide: the
            box's right edge is where the thread list starts, so the rail
            travels left with it and is cut off against the pane's own left
            edge, the way a drawer goes back into a cabinet.

            One property moving, and not two. This used to also translate
            the rail left as the box narrowed, so the content left the
            screen at twice the rate the gap closed — gone halfway through,
            with an empty gap still shutting after it. That is what made
            hiding feel abrupt when showing did not.

            Held to the other edge when the rail is on the right, for the
            same reason: the cabinet is on that side now, so the drawer has
            to go back into it that way.
          */}
          <div
            className={cn(
              "absolute inset-y-0",
              railOnRight ? "left-0" : "right-0"
            )}
            style={{ width: railWidth }}
          >
            {folderRail}
          </div>
        </div>
      ) : null}
      {/* Between the rail and the pane, like the one between the list and
          the reader. Only while the rail is all the way out: half way
          through a slide there is no edge to take hold of. */}
      {railShowing && !hideList ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("resizeFolders")}
          aria-valuenow={Math.round(railWidth)}
          aria-valuemin={FOLDER_RAIL_MIN_WIDTH}
          aria-valuemax={FOLDER_RAIL_MAX_WIDTH}
          title={t("dragToResizeFolders")}
          // On the right, the rail grows as the pointer goes left.
          onPointerDown={(e) => startRailResize(e, { invertDrag: railOnRight })}
          /*
            It takes hold of the seam without taking any of it.

            Four pixels of column between the rail and the list is four
            pixels the list cannot paint, and the bar down the side of the
            open thread stopped short of the rail because of it. The strip
            lies over the list's first four pixels instead — negative margin
            to give the width back, `relative` so it stays above the list and
            keeps the drag, and transparent so what it lies over shows
            through.
          */
          className={cn(
            "relative z-10 w-1 shrink-0 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-[var(--mail-chrome-border)] active:bg-[var(--mail-chrome-border)]",
            railOnRight ? "-ml-1" : "-mr-1"
          )}
          style={{ order: 2 }}
        />
      ) : null}
      <div
        className={cn(
          // What shows through the transparent resize gutter, so it has to
          // be what is on both sides of it. That was white while the reader
          // was white; with the reader on cream it was a white stripe down
          // the join. The list's own border-r is what stops the cream
          // bleeding past the list — not a change of color here.
          "flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--mail-thread)]",
          listVertical ? "flex-col" : "flex-row"
        )}
        // Before the rail when the rail is on the right; after it otherwise.
        style={{ order: railOnRight ? 1 : 3 }}
      >
      {/* ------------------------------------------------ thread list */}
      {!hideList ? (
      <div
        className={cn(
          // Explicit border colour + side (listBorderClass) so the divider
          // between list and reader stays visible against cream chrome.
          "flex overflow-hidden border-[var(--mail-chrome-border)]",
          // Split: pane behind the gutter so chrome can't bleed past the
          // controls column's right border into the thread list.
          listSplit ? "bg-[var(--mail-pane)]" : "bg-[var(--mail-chrome)]",
          listBorderClass,
          // Top/bottom, or full-screen: controls | thread list side-by-side.
          listSplit ? "min-h-0 w-full flex-row" : "min-w-0 flex-col",
          listExpanded ? "min-h-0 min-w-0 flex-1" : "shrink-0"
        )}
        style={{
          order: listFirst ? 1 : 3,
          ...(listExpanded
            ? undefined
            : listVertical
              ? { height: listHeight }
              : { width: listWidth }),
          opacity: listNearSnap ? 0.45 : 1,
          transition: listNearSnap ? undefined : "opacity 120ms ease",
        }}
      >
        {listNarrow ? (
          <div className="flex shrink-0 flex-col items-center gap-0.5 border-b border-[var(--mail-chrome-border)] px-1 py-2">
            <button
              type="button"
              title={t("newEmail")}
              aria-label={t("newEmail")}
              className={chromeIconBtn}
              onClick={() => startCompose()}
            >
              <SquarePen className="h-4 w-4" />
            </button>
            <div
              className="my-1 h-px w-6 bg-[var(--mail-chrome-border)]"
              aria-hidden
            />
            <button
              type="button"
              title={t("syncInbox")}
              aria-label={t("syncInbox")}
              className={chromeIconBtn}
              onClick={syncNow}
            >
              <SyncIcon className="h-4 w-4" spinning={refreshing || syncTurn} />
            </button>
            {foldersMenu(true)}
            {activeFolder ? (
              <button
                type="button"
                title={`Back to inbox (from ${activeFolder.name})`}
                aria-label={`Back to inbox from ${activeFolder.name}`}
                className={chromeIconBtn}
                onClick={() => setActiveFolder(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : (
        <div
          className={cn(
            // Always a column flex so the New email control is a flex item
            // (avoids a ~3px inline-flex whitespace offset in block layout).
            "flex flex-col px-5",
            listSplit
              ? "shrink-0 overflow-y-auto border-r border-[var(--mail-chrome-border)] bg-[var(--mail-chrome)] pb-3 pt-2"
              : "pb-1 pt-2"
          )}
          style={listSplit ? { width: splitChromeWidth } : undefined}
        >
          {/* h-11 + pt-2 on the column match ThreadPane's action strip so
              New email / Sync share a midline with Reply / Archive / ….
              Settings + density live in the title bar. */}
          {/* mb-1: the tab row under this brings its own mt-3, so the gap
              here was two spacings stacked and read as a gap twice over. */}
          <div className="-ml-[4px] mb-1 flex h-11 items-center gap-1">
            <Button
              type="button"
              title={t("newEmail")}
              aria-label={t("newEmail")}
              variant={chromeDark ? "default" : "outline"}
              className={cn(
                // flex overrides Button's inline-flex so it sits flush in the row.
                // h-9 matches ThreadAction; keep padding inside that height.
                "flex h-9 max-w-[9rem] flex-1 gap-1.5 rounded-xl px-3 py-0 text-sm font-semibold shadow-none",
                chromeDark && "bg-white text-stone-800 hover:bg-white/90"
              )}
              onPointerDown={beginNativeWindowDragOnMove}
              onClick={() => startCompose()}
            >
              <SquarePen className="h-4 w-4" />
              {listWidth < 250 ? t("newShort") : t("newEmail")}
            </Button>
            <button
              type="button"
              title={t("syncInbox")}
              aria-label={t("syncInbox")}
              onPointerDown={beginNativeWindowDragOnMove}
              onClick={syncNow}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium",
                chromeDark
                  ? "text-[var(--mail-chrome-muted)] hover:bg-[var(--mail-chrome-hover)] hover:text-[var(--mail-chrome-fg)]"
                  : "text-stone-500 hover:bg-stone-200/70 hover:text-stone-800"
              )}
            >
              <SyncIcon className="h-4 w-4" spinning={refreshing || syncTurn} />
              {t("sync")}
            </button>
            <button
              type="button"
              title={listExpanded ? t("restoreListSize") : t("expandList")}
              aria-label={
                listExpanded ? t("restoreListSize") : t("expandList")
              }
              aria-pressed={listExpanded}
              className={cn(
                chromeIconBtn,
                "ml-auto flex h-8 w-8 shrink-0 items-center justify-center p-0"
              )}
              onClick={toggleListExpanded}
              onDoubleClick={(e) => {
                if (isInteractiveDoubleClickTarget(e.target)) return;
                toggleListExpanded();
              }}
            >
              {listExpanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
          </div>

          {autoReplies.some((a) => autoReplyActive(a)) ? (
            <button
              type="button"
              onClick={() => {
                setAutoReplyAccount(
                  autoReplies.find((a) => autoReplyActive(a))?.account ?? null
                );
                setAutoReplyOpen(true);
              }}
              className="mt-2 flex w-full items-center gap-1.5 rounded-lg border border-amber-300/30 bg-amber-400/15 px-2.5 py-1.5 text-left text-xs text-amber-100 hover:bg-amber-400/25"
            >
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {t("outOfOfficeReplyOn")}{" "}
                {autoReplies
                  .filter((a) => autoReplyActive(a))
                  .map(
                    (a) =>
                      formatAccountChipLabel(a.account, accountLabels) +
                      (a.endTime !== null
                        ? ` ${t("outOfOfficeUntil", {
                            date: new Date(a.endTime - 1).toLocaleDateString(
                              currentMailLocale(),
                              { day: "numeric", month: "short" }
                            ),
                          })}`
                        : "")
                  )
                  .join(", ")}
              </span>
            </button>
          ) : null}

          {/* Keep All / In CRM / … in the left controls column when expanded. */}
          {!listVertical ? listTabsOrFolder : null}
        </div>
        )}

        {listSplit ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("resizeControls")}
            aria-valuenow={Math.round(splitChromeWidth)}
            aria-valuemin={
              listExpanded && !listVertical
                ? MIN_LIST_WIDTH
                : MIN_CONTROLS_WIDTH
            }
            aria-valuemax={
              listExpanded && !listVertical ? MAX_LIST_ARIA : MAX_CONTROLS_WIDTH
            }
            title={t("dragToResize")}
            onPointerDown={startSplitChromeResize}
            // Sit on the pane side of the border (no -ml overlap) so chrome
            // never paints past the controls column edge.
            className="w-2 shrink-0 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-stone-200/50 active:bg-stone-200/70"
          />
        ) : null}

        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
            // Split layout: chrome controls | white mail list.
            listSplit && "bg-[var(--mail-pane)]"
          )}
        >
          {listVertical && !listNarrow ? (
            <div className="shrink-0 px-5 pt-3">{listTabsOrFolder}</div>
          ) : null}

        <div className="relative min-h-0 flex-1">
        <div
          ref={listScrollRef}
          className={cn(
            "h-full min-h-0 overflow-y-auto overscroll-none",
            listExpanded ? "pb-4" : "pb-6"
          )}
        >
          {/*
            While a search is actually running, whatever is already on screen.
            It used to appear only when the list was empty, which is the one
            time a reader does not need telling — with rows from the last
            query still showing, a new one looks like nothing is happening.

            `refreshing`, not `loadingList`: a search typed over rows already
            on screen keeps those rows and never sets loadingList at all, so
            the banner missed exactly the common case — the reader saw a
            plausible list, no sign anything was still out, and then a slow
            mailbox's answer landed in one late lump as if from nowhere.
            `refreshing` holds until the last mailbox has answered.

            A search is not a page loading: it is every mailbox being asked on
            its own, over the network, by its own provider. That is why it
            takes as long as it does and why rows land in bursts.
          */}
          {debouncedSearch && (loadingList || refreshing) && !listNarrow ? (
            /*
              Chrome colors, not white. This was written for a list that sat
              on the navy chrome, and on the cream one it was white text on
              near-white: a blank band above the results, with the spinner
              invisible in it too. What it looked like was a search that had
              lost its earlier rows and left a hole where they had been.
            */
            <div className="border-b border-[var(--mail-chrome-border)] px-5 pb-2 pt-3">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--mail-chrome-muted)]">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                {searchingMailboxCount === 1
                  ? t("searchingMailbox")
                  : t("searchingMailboxes", {
                      count: searchingMailboxCount,
                    })}
              </p>
              <p className="pt-0.5 text-[11px] leading-snug text-[var(--mail-chrome-faint)]">
                {t("searchingHint")}
              </p>
            </div>
          ) : null}
          {draftsView ? (
            <MailDraftsList
              rows={drafts}
              loading={draftsLoading}
              onOpen={(row) => {
                // A reply opens its thread, where the composer picks the
                // draft up — ours from IndexedDB, the provider's from the
                // thread itself. A new message has no thread worth reading,
                // so it opens straight into a composer on its own key.
                if (row.threadId && !isStandaloneDraft(row)) {
                  setSelectedPersonKey(null);
                  setSelected({
                    account: row.account,
                    threadId: row.threadId,
                    inCrm: false,
                  });
                  return;
                }
                if (row.origin === "here") {
                  startCompose({
                    to: row.to,
                    subject: row.subject,
                    continuedFromLabel: "",
                    draftKey: row.id,
                  });
                  return;
                }
                // A provider draft that is not a reply still belongs to a
                // thread of its own; opening it shows an empty thread with
                // the draft in the composer.
                if (row.threadId) {
                  setSelectedPersonKey(null);
                  setSelected({
                    account: row.account,
                    threadId: row.threadId,
                    inCrm: false,
                  });
                }
              }}
            />
          ) : loadingList &&
          accountEmails.length > 0 &&
          !threads.length &&
          !pinnedThreads.length ? (
            <MailListLoading
              provider={mailProviderNames}
              onNavy={chromeDark}
              narrow={listNarrow}
            />
          ) : listError && !threads.length && !pinnedThreads.length ? (
            <p
              className={cn(
                "py-6 text-sm text-red-300",
                listNarrow ? "px-1 text-center text-[10px] leading-tight" : "px-5"
              )}
              title={listError}
            >
              {listNarrow ? "Error" : listError}
            </p>
          ) : !accountEmails.length ? (
            listNarrow ? (
              <p
                className="px-1 py-6 text-center text-[10px] leading-tight text-[var(--mail-chrome-muted)]"
                title={t("connectFromSettings")}
              >
                {t("connect")}
              </p>
            ) : (
            <div className="px-5 py-8">
              <p className="text-sm font-medium text-[var(--mail-chrome-fg)]">
                {t("connectToStart")}
              </p>
              <p className="mt-1 text-sm text-[var(--mail-chrome-muted)]">
                {t("connectIntro")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm" className="gap-1.5">
                  <a
                    href={gmailOauthHref()}
                    onClick={(event) => {
                      // The href is the fallback for a page whose script never
                      // ran. When it did, the host decides what connect means.
                      event.preventDefault();
                      connect("gmail");
                    }}
                  >
                    {connecting === "gmail" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("openingProvider", { provider: "Gmail" })}
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        {t("connectProvider", { provider: "Gmail" })}
                      </>
                    )}
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-[var(--mail-chrome-chip-border)] bg-transparent text-[var(--mail-chrome-fg)] hover:bg-[var(--mail-chrome-hover)] hover:text-[var(--mail-chrome-fg)]"
                >
                  <a
                    href={outlookOauthHref()}
                    onClick={(event) => {
                      // The href is the fallback for a page whose script never
                      // ran. When it did, the host decides what connect means.
                      event.preventDefault();
                      connect("outlook");
                    }}
                  >
                    {connecting === "outlook" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("openingProvider", { provider: "Outlook" })}
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        {t("connectProvider", { provider: "Outlook" })}
                      </>
                    )}
                  </a>
                </Button>
              </div>
            </div>
            )
          ) : !searchedVisible.length && !pinnedThreads.length ? (
            <p
              className={cn(
                "py-6 text-sm text-[var(--mail-chrome-muted)]",
                listNarrow ? "px-1 text-center text-[10px] leading-tight" : "px-5"
              )}
              title={
                debouncedSearch
                  ? `No results for “${debouncedSearch}”.`
                  : activeFolder
                    ? `No mail in ${activeFolder.name}.`
                    : undefined
              }
            >
              {listNarrow
                ? "Empty"
                : debouncedSearch
                  ? `No results for “${debouncedSearch}”.`
                  : activeFolder
                    ? // The breadcrumb above names the folder, so naming it
                      // again here is the same sentence twice — and it was
                      // the long form, the whole path, under a header that
                      // had just spelt it out one part at a time.
                      "No mail in here."
                    : activeCustomList
                      ? `No mail from people in “${activeCustomList.name}”.`
                      : tab === "people"
                        ? mailUsesCrmPeople()
                          ? "No mail from CRM contacts right now."
                          : "No mail from your contacts right now."
                        : tab === "sent"
                          ? "No sent mail found."
                          : tab === "trash"
                            ? "Nothing in Trash."
                            : tab === "junk"
                              ? "Nothing in Junk."
                              : tab === "snoozed"
                            ? "Nothing snoozed — enjoy the quiet."
                            : tab === "all"
                              ? "Inbox zero — enjoy the quiet."
                              : "Nothing else — enjoy the quiet."}
            </p>
          ) : viewMode === "people" && tab !== "snoozed" && tab !== "sent" ? (
            <div className="pt-2">
              <div>
                {!personRows.length ? (
                  <p
                    className={cn(
                      "py-6 text-sm text-[var(--mail-chrome-muted)]",
                      listNarrow
                        ? "px-1 text-center text-[10px] leading-tight"
                        : "px-5"
                    )}
                  >
                    {/* Waiting is `pendingTokens`, not `refreshing` — the
                        latter is also true for a background poll, which would
                        call a finished search "Looking…" forever. */}
                    {listNarrow
                      ? search.trim()
                        ? pendingTokens.length
                          ? "…"
                          : "None"
                        : "Empty"
                      : search.trim()
                        ? pendingTokens.length
                          ? `Looking for “${search.trim()}”…`
                          : `No people matching “${search.trim()}”.`
                        : mailUsesCrmPeople()
                          ? "No mail from CRM contacts right now."
                          : "No mail from your contacts right now."}
                  </p>
                ) : null}
                {personRows.map((row) => {
                  const newest = row.threads[0];
                  const personHasDraft = row.threads.some((t) =>
                    draftKeys.has(threadDraftKey(t.account, t.threadId))
                  );
                  const personTitle = [
                    row.name,
                    newest.subject || newest.snippet,
                    personHasDraft ? t("draft") : null,
                    row.unread ? t("unread") : null,
                  ]
                    .filter(Boolean)
                    .join(" — ");
                  return (
                    <div
                      key={row.key}
                      className={cn(
                        "group flex w-full items-center transition-colors",
                        listNarrow
                          ? "justify-center px-1 py-1.5"
                          : listDensity === "compact"
                            ? "px-5 py-1.5"
                            : "px-5 py-2.5",
                        selectedPersonKey === row.key
                          ? "bg-[var(--mail-chrome-selected)]"
                          : "hover:bg-[var(--mail-chrome-hover)]"
                      )}
                    >
                    <button
                      type="button"
                      title={listNarrow ? personTitle : undefined}
                      aria-label={listNarrow ? personTitle : undefined}
                      onClick={() => openPerson(row)}
                      className={cn(
                        "flex min-w-0 flex-1 items-center text-left",
                        listNarrow
                          ? "justify-center"
                          : listDensity === "compact"
                            ? "gap-2.5"
                            : "gap-3"
                      )}
                    >
                      <PersonAvatar
                        row={row}
                        onNavy={chromeDark}
                        className={
                          listNarrow
                            ? "h-9 w-9"
                            : listDensity === "compact"
                              ? "h-7 w-7"
                              : "h-9 w-9"
                        }
                      />
                      {listNarrow ? null : (
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 truncate text-sm font-semibold text-[var(--mail-chrome-fg)]">
                              {row.name}
                            </span>
                            {personHasDraft ? <DraftBadge /> : null}
                            {listDensity === "compact" &&
                            row.threads.length > 1 ? (
                              <span
                                className="shrink-0 rounded-full bg-[var(--mail-chrome-selected)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--mail-chrome-muted)]"
                                title={`${row.threads.length} threads`}
                              >
                                {row.threads.length}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-xs text-[var(--mail-chrome-faint)] group-hover:invisible">
                            {rowTime(row.lastAt, {
                              withYear: Boolean(debouncedSearch),
                            })}
                          </span>
                        </span>
                        {listDensity === "compact" ? null : (
                          <span className="mt-0.5 flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate text-xs text-[var(--mail-chrome-muted)]">
                              {newest.snippet || newest.subject}
                            </span>
                            {row.threads.length > 1 ? (
                              <span
                                className="shrink-0 rounded-full bg-[var(--mail-chrome-selected)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--mail-chrome-muted)]"
                                title={`${row.threads.length} threads`}
                              >
                                {row.threads.length}
                              </span>
                            ) : null}
                          </span>
                        )}
                      </span>
                      )}
                    </button>
                    {listNarrow ? null : (
                      <PersonRowActions
                        row={row}
                        pinned={isMailPersonPinned(row.key)}
                        onNavy={chromeDark}
                        onTogglePin={() => togglePersonPin(row)}
                        onArchive={() => void archivePerson(row)}
                        onToggleRead={() =>
                          void toggleRead(row.threads, row.name)
                        }
                      />
                    )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              {showPinnedBand && pinnedThreads.length ? (
                  <div className="relative">
                    {/* No rule under the band. The teal bar down its side
                        already marks where it ends, and the heading over the
                        list below says the same thing again. */}
                    <div
                      aria-hidden
                      className="absolute bottom-0 left-0 top-0 w-0.5 bg-teal-400"
                    />
                    {listNarrow ? (
                      <div
                        className="flex justify-center pb-0.5 pt-2"
                        title={t("pinned")}
                      >
                        <Pin
                          className="h-3 w-3 text-[var(--mail-chrome-faint)]"
                          aria-label={t("pinned")}
                        />
                      </div>
                    ) : (
                      <p className="flex items-center gap-1.5 px-5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--mail-chrome-faint)]">
                        {/* Inherits, so it stays the colour of the word it
                            sits beside rather than picking its own. */}
                        <Pin className="h-3 w-3" aria-hidden />
                        {t("pinned")}
                      </p>
                    )}
                    <div className="max-h-[18rem] overflow-y-auto overscroll-contain">
                      {pinnedThreads.map((t) => (
                        <ThreadListRow
                          key={`pin|${threadKey(t)}`}
                          thread={t}
                          selected={
                            selected != null &&
                            threadKey(selected) === threadKey(t)
                          }
                          withYear={Boolean(debouncedSearch)}
                          pinned
                          onNavy={chromeDark}
                          density={listDensity}
                          narrow={listNarrow}
                          onOpen={() => openThread(t)}
                          onTogglePin={() => togglePin(t)}
                          onToggleRead={() => void toggleRead([t], "it")}
                          onSnooze={(untilIso) => void snooze(t, untilIso)}
                          onCancelSnooze={
                            t.snoozedUntil ? () => void unsnooze(t) : undefined
                          }
                          // Not in Trash: there is nothing to archive out of
                          // it and nothing left to delete.
                          onArchive={
                            tab === "trash" ? undefined : () => void archive(t)
                          }
                          onTrash={
                            tab === "trash" ? undefined : () => void trash(t)
                          }
                          dragKind="pin"
                        />
                      ))}
                    </div>
                  </div>
              ) : null}
              <div
                onDragOver={(e) => {
                  // Accept drops from the pinned band to unpin.
                  if (
                    e.dataTransfer.types.includes("application/x-redd-mail-pin")
                  ) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={(e) => {
                  const raw = e.dataTransfer.getData(
                    "application/x-redd-mail-pin"
                  );
                  if (!raw) return;
                  e.preventDefault();
                  try {
                    const { account, threadId } = JSON.parse(raw) as {
                      account: string;
                      threadId: string;
                    };
                    capturePinFlip(`${account}|${threadId}`);
                    unpinMailThread(account, threadId);
                    toast("Unpinned");
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {heldMessages.length && !listNarrow ? (
                  <div>
                    <p className="px-5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--mail-chrome-faint)]">
                      Scheduled · {heldMessages.length}
                    </p>
                    {heldMessages.map((held) => (
                      <button
                        key={`${held.account}|${held.id}`}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-3 px-5 py-2 text-left",
                          chromeDark ? "hover:bg-white/5" : "hover:bg-[#f4f1ec]"
                        )}
                        onClick={() =>
                          setSelected({
                            account: held.account,
                            threadId: held.threadId,
                            inCrm: true,
                          })
                        }
                      >
                        <Clock
                          className="h-3.5 w-3.5 shrink-0 text-teal-700/75"
                          aria-hidden
                        />
                        <span
                          className={cn(
                            "max-w-[38%] shrink-0 truncate text-sm font-semibold",
                            chromeDark ? "text-white" : "text-stone-900"
                          )}
                        >
                          {held.toName}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-sm",
                            chromeDark ? "text-white/45" : "text-[#908985]"
                          )}
                        >
                          {held.subject || "(no subject)"}
                        </span>
                        {/* The time is the row's point, so it is the one
                            thing in it wearing a colour. */}
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-teal-700/90">
                          {formatSnoozeWakeLabel(held.sendAt)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {groups.map((group) => (
                    <div key={group.label || "results"}>
                      {group.label && !listNarrow ? (
                        <p className="px-5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--mail-chrome-faint)]">
                          {t(group.label as MailStringKey)}
                        </p>
                      ) : (
                        <div className={listNarrow ? "pt-0.5" : "pt-2"} />
                      )}
                      {group.items.map((t) => (
                        <ThreadListRow
                          key={threadKey(t)}
                          thread={t}
                          selected={
                            selected != null &&
                            threadKey(selected) === threadKey(t)
                          }
                          withYear={Boolean(debouncedSearch)}
                          pinned={pinKeySet.has(threadKey(t))}
                          onNavy={chromeDark}
                          density={listDensity}
                          narrow={listNarrow}
                          onOpen={() => openThread(t)}
                          onTogglePin={() => togglePin(t)}
                          onToggleRead={() => void toggleRead([t], "it")}
                          onSnooze={(untilIso) => void snooze(t, untilIso)}
                          onCancelSnooze={
                            t.snoozedUntil ? () => void unsnooze(t) : undefined
                          }
                          onArchive={
                            tab === "trash" ? undefined : () => void archive(t)
                          }
                          onTrash={
                            tab === "trash" ? undefined : () => void trash(t)
                          }
                          dragKind="folder"
                        />
                      ))}
                    </div>
                  ))}
              </div>
            </>
          )}
          {/* Results in hand, and more of them behind the button below. A
              search that has answered still looks finished, so say it is not. */}
          {debouncedSearch && listCursor && !loadingList && !listNarrow ? (
            <p className="px-5 pt-3 text-[11px] leading-snug text-[var(--mail-chrome-faint)]">
              {t("firstMatches")}
            </p>
          ) : null}
          {listCursor && !loadingList ? (
            <div
              className={cn("pb-2 pt-3", listNarrow ? "px-1" : "px-5")}
            >
              <button
                type="button"
                disabled={loadingMore}
                title={t("loadMore")}
                aria-label={loadingMore ? t("loadingMore") : t("loadMore")}
                onClick={() => void loadMoreThreads()}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-md py-2 text-xs font-medium text-[var(--mail-chrome-muted)] transition-colors hover:bg-[var(--mail-chrome-hover)] hover:text-[var(--mail-chrome-fg)] disabled:opacity-60",
                  listNarrow && "px-0"
                )}
              >
                {loadingMore ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : listNarrow ? (
                  <Plus className="h-3.5 w-3.5" />
                ) : null}
                {listNarrow ? null : loadingMore ? t("loading") : t("loadMore")}
              </button>
            </div>
          ) : null}
        </div>
        {/* Soft fade so rows ease into the list surface at the edge. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t to-transparent",
            listSplit
              ? "from-[var(--mail-pane)]"
              : "from-[var(--mail-fade-from)]"
          )}
        />
        </div>
        </div>
      </div>
      ) : null}

      {/* Drag handle for resizing the thread list. */}
      {!hideList && !listExpanded ? (
      <div
        role="separator"
        aria-orientation={listVertical ? "horizontal" : "vertical"}
        aria-valuenow={Math.round(listVertical ? listHeight : listWidth)}
        aria-valuemin={
          detailOpen
            ? 0
            : listVertical
              ? MIN_LIST_HEIGHT
              : NARROW_LIST_WIDTH
        }
        aria-valuemax={MAX_LIST_ARIA}
        title={
          listNarrow
            ? "Drag out or double-click to expand list"
            : listVertical
              ? detailOpen
                ? "Drag to resize — pull small to hide"
                : t("dragToResize")
              : detailOpen
                ? "Drag to resize — narrow for avatars, smaller to hide"
                : "Drag to resize — narrow for avatar rail"
        }
        onPointerDown={listVertical ? startListHeightResize : startListResize}
        onDoubleClick={(e) => {
          if (listVertical || !listNarrow) return;
          e.preventDefault();
          expandListFromNarrow();
        }}
        className={cn(
          // Transparent: parent chrome cream shows through, so the action
          // band meets the list without a white notch. List keeps border-r.
          "shrink-0 touch-none bg-transparent transition-colors hover:bg-[var(--mail-chrome-hover)] active:bg-white/20",
          listVertical
            ? "h-2 w-full cursor-row-resize"
            : "w-2 cursor-col-resize"
        )}
        style={{ order: 2 }}
      />
      ) : null}

      {/* ------------------------------------------------ reading pane */}
      {!listExpanded ? (
      <div
        // No overflow clip here — the action band must paint over the resize
        // gutter to the list border. Message scrolling is on ThreadPane.
        //
        // The reader's cream, not the pane's white: everything in here is the
        // reader, and the two that draw a message — ThreadPane and the
        // composer — already paint this same color over the top. What it
        // changes is the states that draw nothing much: the resting picture,
        // the wait for a first inbox, the note that no mailbox is connected.
        // Those were the one place the old white still showed through.
        className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--mail-thread)]"
        style={{ order: listFirst ? 3 : 1 }}
      >
        {composing ? (
          <ComposeView
            accounts={accountEmails}
            zoom={zoom}
            onZoomAdjust={adjustZoom}
            focusMode={listCollapsed}
            onToggleFocus={() => setListCollapsed((v) => !v)}
            onClose={closeCompose}
            onSent={scheduleSentRefreshForAccount}
            onUndoSend={(draftKey) =>
              startCompose({
                to: [],
                subject: "",
                continuedFromLabel: "",
                draftKey,
              })
            }
            seed={composeSeed}
          />
        ) : selected ? (
          <>
            {viewMode === "people" && selectedPerson ? (
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex items-center gap-1.5 border-b border-stone-200 px-8 py-2 text-left text-xs text-stone-500 hover:bg-stone-50 hover:text-stone-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                All threads with {selectedPerson.name}
              </button>
            ) : null}
            <ThreadPane
              key={`${threadKey(selected)}|${selected.focusMessageId ?? ""}`}
              account={selected.account}
              accounts={accountEmails}
              threadId={selected.threadId}
              focusMessageId={selected.focusMessageId}
              zoom={zoom}
              onZoomAdjust={adjustZoom}
              focusMode={listCollapsed}
              onToggleFocus={() => setListCollapsed((v) => !v)}
              onArchive={() => void archive(selected)}
              onTrash={() => void trash(selected)}
              inTrash={tab === "trash"}
              onRestore={() => void restoreFromTrash(selected)}
              inJunk={tab === "junk"}
              onJunk={() => void setThreadJunk(selected, true)}
              onNotJunk={() => void setThreadJunk(selected, false)}
              onMoveToFolder={(folderName, create) =>
                moveToFolder(selected, folderName, create)
              }
              folders={folders}
              onSnooze={(untilIso) => void snooze(selected, untilIso)}
              onCancelSnooze={
                selectedRow?.snoozedUntil
                  ? () => void unsnooze(selected)
                  : undefined
              }
              snoozedUntil={
                threads.find((t) => threadKey(t) === threadKey(selected))
                  ?.snoozedUntil
              }
              unread={Boolean(selectedRow?.unread)}
              onToggleUnread={() => {
                // The same rule as the quick action on the row: read becomes
                // unread, unread becomes read. A thread opened from somewhere
                // the list does not hold — a search hit, a deep link — has no
                // row to read a state off, and marking it unread is the only
                // move that makes sense there.
                if (selectedRow) void toggleRead([selectedRow], "it");
                else void markUnread(selected);
              }}
              onTogglePin={() => {
                // A pin is kept by the list row's summary. A thread opened
                // from a search hit or a deep link has no row here, so
                // there is nothing to pin it as; say so rather than nothing.
                if (selectedRow) togglePin(selectedRow);
                else toast("Open it from the list to pin it");
              }}
              forwardMessageId={
                pendingForward &&
                pendingForward.account === selected.account &&
                pendingForward.threadId === selected.threadId
                  ? pendingForward.messageId
                  : undefined
              }
              onForwardStarted={() => setPendingForward(null)}
              refreshToken={
                threads.find((t) => threadKey(t) === threadKey(selected))
                  ?.lastAt
              }
              messageCount={
                threads.find((t) => threadKey(t) === threadKey(selected))
                  ?.messageCount
              }
              inCrm={selected.inCrm}
              showAddToCrm={mailUsesCrmPeople() && !selected.inCrm}
              counterpartName={
                threads.find((t) => threadKey(t) === threadKey(selected))
                  ?.fromName ?? ""
              }
              counterpartEmail={
                threads.find((t) => threadKey(t) === threadKey(selected))
                  ?.fromEmail ?? ""
              }
              onSent={scheduleSentRefreshForAccount}
              onChatPromoted={(chat) => {
                setThreads((current) => {
                  const next = current.map((t) =>
                    threadKey(t) === threadKey(selected)
                      ? { ...t, chat }
                      : t
                  );
                  patchCachedThreads(viewerId, listCacheKey, next);
                  return next;
                });
              }}
              onChatThreadChanged={(nextThreadId, chat, focusMessageId) => {
                const prev = selected;
                setThreads((current) => {
                  const next = current.map((t) => {
                    if (
                      t.account === prev.account &&
                      t.threadId === prev.threadId
                    ) {
                      return {
                        ...t,
                        threadId: nextThreadId,
                        chat,
                        subject: chat.subject,
                      };
                    }
                    return t;
                  });
                  // Drop a duplicate row if the new part id was already listed.
                  const seen = new Set<string>();
                  const deduped = next.filter((t) => {
                    const k = threadKey(t);
                    if (seen.has(k)) return false;
                    seen.add(k);
                    return true;
                  });
                  patchCachedThreads(viewerId, listCacheKey, deduped);
                  return deduped;
                });
                // The pane is keyed by thread and focus, so setting the
                // focus is what reopens it at that message. Cleared when
                // there is none: a seam opens its part at the newest
                // message, and a stale focus would drag it elsewhere.
                setSelected((current) =>
                  current
                    ? { ...current, threadId: nextThreadId, focusMessageId }
                    : current
                );
              }}
              onCrmChanged={() => {
                // Optimistically move this thread into In CRM before the list reload.
                setThreads((current) => {
                  const next = current.map((t) =>
                    threadKey(t) === threadKey(selected)
                      ? { ...t, tab: "people" as const }
                      : t
                  );
                  patchCachedThreads(viewerId, listCacheKey, next);
                  return next;
                });
                setSelected((current) =>
                  current ? { ...current, inCrm: true } : current
                );
                setTab("people");
                void loadThreads();
              }}
            />
          </>
        ) : viewMode === "people" && selectedPerson ? (
          <PersonPane row={selectedPerson} onOpenThread={openThread} />
        ) : !accountEmails.length ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium text-stone-600">
              {t("noMailboxConnected")}
            </p>
            <p className="max-w-sm text-sm text-stone-400">
              {t("noMailboxHint")}
            </p>
          </div>
        ) : loadingList && !threads.length && !pinnedThreads.length ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
            role="status"
            aria-busy="true"
            aria-live="polite"
          >
            <Loader2
              className="h-5 w-5 animate-spin text-stone-400"
              aria-hidden
            />
            <div>
              <p className="text-sm font-medium text-stone-600">
                {t("loadingInbox")}
              </p>
              <p className="mt-1 text-sm text-stone-400">
                {t("loadingInboxHint")}
              </p>
            </div>
          </div>
        ) : (
          <MailRestPanel />
        )}
      </div>
      ) : null}
      </div>
      </div>

      <AutoReplyDialog
        open={autoReplyOpen}
        initialAccount={autoReplyAccount}
        onClose={() => setAutoReplyOpen(false)}
        onSaved={storeAutoReply}
      />
      <ContactSourcesDialogHost />
      <MacContactsAskCard
        trigger={macAskTrigger}
        onGranted={() =>
          window.dispatchEvent(new CustomEvent(CONTACTS_CHANGED_EVENT))
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Person pane (People view: all threads with one correspondent)
// ---------------------------------------------------------------------------

function PersonPane({
  row,
  onOpenThread,
}: {
  row: PersonRow;
  onOpenThread: (t: MailThreadSummary) => void;
}) {
  const draftKeys = useThreadDraftKeys();
  const newest = row.threads[0];
  // Strip self: list payloads can still list a personal alias as external.
  const groupNames = (newest.externalParticipants ?? [])
    .filter(
      (p) =>
        p.email &&
        !isOwnPersonalAddress(p.email) &&
        normalizeEmail(p.email) !== normalizeEmail(newest.account)
    )
    .map((p) => p.name.split(" ")[0] || p.email)
    .join(", ");
  const subtitle = [
    row.isGroup ? groupNames : row.email,
    row.crmName,
    `${row.threads.length} open thread${row.threads.length === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mail-thread-surface min-h-0 flex-1 overflow-y-auto bg-[var(--mail-thread)]">
      <div className="mx-auto w-full max-w-2xl px-8 py-8">
        <div className="flex items-center gap-4">
          <PersonAvatar row={row} className="h-12 w-12 text-base" />
          <div className="min-w-0">
            <h2 className="truncate font-serif text-2xl font-bold text-stone-900">
              {row.name}
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          {row.threads.map((t) => {
            const hasDraft = draftKeys.has(
              threadDraftKey(t.account, t.threadId)
            );
            return (
              <button
                key={threadKey(t)}
                type="button"
                onClick={() => onOpenThread(t)}
                className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-left transition-shadow hover:border-stone-300 hover:shadow-sm"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-stone-900">
                    {t.unread ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" />
                    ) : null}
                    <span className="truncate">{t.subject}</span>
                    {hasDraft ? <DraftBadge /> : null}
                  </p>
                  <p className="shrink-0 text-xs text-stone-400">
                    {shortDate(t.lastAt)}
                  </p>
                </div>
                <p className="mt-1 truncate text-xs text-stone-500">
                  {t.messageCount} message{t.messageCount === 1 ? "" : "s"} ·{" "}
                  {t.snippet}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread pane
// ---------------------------------------------------------------------------




























