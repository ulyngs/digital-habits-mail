import { loadCachedMailThread } from "@/lib/mail/thread-cache";
import type { MailThreadDetail } from "@/lib/mail/types";
import {
  isNativeShell,
  notifyMailForward,
  notifyMailSent,
  openChatPopout,
} from "@/lib/native-shell";

/**
 * Cross-window "a popout sent mail" signal. Browsers get the localStorage
 * `storage` event (fires in every *other* same-origin window); the desktop
 * shells additionally broadcast a Tauri event, since WKWebView is unreliable
 * about cross-window storage events. MailPage listens to both.
 */
export const MAIL_POPOUT_SENT_KEY = "redd-plan-mail-popout-sent";

export function signalPopoutSend(account: string, threadId: string): void {
  try {
    window.localStorage.setItem(
      MAIL_POPOUT_SENT_KEY,
      JSON.stringify({ account, threadId, at: Date.now() })
    );
  } catch {}
  void notifyMailSent({ account, threadId }).catch(() => {});
}

/**
 * Cross-window "forward this message for me" request.
 *
 * The chat popout has no recipient picker and no subject line, so it cannot
 * forward anything itself. It asks the window that can. The same two channels
 * as the sent signal above: localStorage for browsers, a Tauri event for the
 * desktop shells, where cross-window storage events are unreliable.
 */
export const MAIL_FORWARD_REQUEST_KEY = "redd-plan-mail-forward-request";

export type MailForwardRequest = {
  account: string;
  threadId: string;
  messageId: string;
};

export function signalForwardRequest(request: MailForwardRequest): void {
  try {
    window.localStorage.setItem(
      MAIL_FORWARD_REQUEST_KEY,
      JSON.stringify({ ...request, at: Date.now() })
    );
  } catch {}
  void notifyMailForward(request).catch(() => {});
}

/** A request off either channel, or null when it is not one. */
export function readForwardRequest(raw: unknown): MailForwardRequest | null {
  const value =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })()
      : raw;
  if (!value || typeof value !== "object") return null;
  const r = value as Partial<MailForwardRequest>;
  if (!r.account || !r.threadId || !r.messageId) return null;
  return {
    account: r.account,
    threadId: r.threadId,
    messageId: r.messageId,
  };
}

export const CHAT_POPOUT_WIDTH = 380;
export const CHAT_POPOUT_EXPANDED_HEIGHT = 560;
export const CHAT_POPOUT_COLLAPSED_HEIGHT = 72;

/**
 * One-shot handoff of an already-loaded thread to the popout window via
 * localStorage (both windows share the origin), so popping out a thread
 * that's open in the reader paints instantly instead of showing "Loading…".
 * The popout deletes the key after reading and refetches in the background.
 */
const SEED_PREFIX = "redd-plan-chat-popout-seed:";
const SEED_TTL_MS = 60_000;

export function popoutSeedKey(account: string, threadId: string): string {
  return `${SEED_PREFIX}${account}|${threadId}`;
}

type PopoutSeed = {
  at: number;
  thread: MailThreadDetail;
  draft?: string;
  /** Where the caret was in that draft, counted from the start. */
  caret?: number;
};

/** The thread handed over, and the half-written reply handed over with it. */
export function readPopoutSeed(
  account: string,
  threadId: string
): { thread: MailThreadDetail; draft: string; caret: number | null } | null {
  try {
    const key = popoutSeedKey(account, threadId);
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    window.localStorage.removeItem(key);
    const seed = JSON.parse(raw) as PopoutSeed;
    if (!seed?.thread || Date.now() - seed.at > SEED_TTL_MS) return null;
    return {
      thread: seed.thread,
      draft: seed.draft ?? "",
      caret: seed.caret ?? null,
    };
  } catch {
    return null;
  }
}

/** Drop unread seeds (e.g. the popout was already open and never consumed it). */
function sweepStaleSeeds(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(SEED_PREFIX)) continue;
      try {
        const seed = JSON.parse(
          window.localStorage.getItem(key) ?? ""
        ) as PopoutSeed;
        if (!seed?.at || Date.now() - seed.at > SEED_TTL_MS) stale.push(key);
      } catch {
        stale.push(key);
      }
    }
    for (const key of stale) window.localStorage.removeItem(key);
  } catch {}
}

function writePopoutSeed(
  account: string,
  threadId: string,
  thread: MailThreadDetail,
  draft?: string,
  caret?: number | null
): void {
  sweepStaleSeeds();
  try {
    window.localStorage.setItem(
      popoutSeedKey(account, threadId),
      JSON.stringify({
        at: Date.now(),
        thread,
        ...(draft?.trim() ? { draft } : null),
        ...(draft?.trim() && caret != null ? { caret } : null),
      } satisfies PopoutSeed)
    );
  } catch {
    // Quota (huge inline images) — the popout just fetches instead.
  }
}

/**
 * Pop a thread out into a floating chat window from the mail client.
 * Desktop shells get a real always-on-top Tauri window; browsers get a
 * `window.open` popup (a separate OS window, though not always-on-top —
 * no cross-browser API offers that).
 */
export async function openMailChatPopout(input: {
  account: string;
  threadId: string;
  name: string;
  email: string;
  subject: string;
  /** Already-loaded thread detail (e.g. from the open reader) to hand over. */
  seedThread?: MailThreadDetail;
  /**
   * A reply already being written, as HTML — the same as both boxes hold.
   *
   * The window opens on it, so popping out mid-sentence carries the sentence
   * across instead of leaving it behind in a box the reader has walked away
   * from.
   */
  seedDraft?: string;
  /** Where the caret was in it, so the other box opens in the same place. */
  seedCaret?: number | null;
}): Promise<void> {
  const { seedThread, seedDraft, seedCaret, ...target } = input;
  const seed =
    seedThread ??
    (await loadCachedMailThread(input.account, input.threadId))?.thread;
  if (seed) {
    writePopoutSeed(input.account, input.threadId, seed, seedDraft, seedCaret);
  }
  if (isNativeShell()) {
    await openChatPopout(target);
    return;
  }
  const params = new URLSearchParams({
    account: input.account,
    thread: input.threadId,
    name: input.name,
    email: input.email,
    subject: input.subject,
  });
  // Stable name per thread so re-clicking reuses the window instead of
  // stacking duplicates.
  const windowName = `mail-chat-${input.account}-${input.threadId}`.replace(
    /[^\w-]/g,
    "_"
  );
  const left = Math.max(
    0,
    (window.screen?.availWidth ?? 1440) - CHAT_POPOUT_WIDTH - 24
  );
  const popup = window.open(
    `/mail-popout?${params.toString()}`,
    windowName,
    `popup=yes,width=${CHAT_POPOUT_WIDTH},height=${CHAT_POPOUT_EXPANDED_HEIGHT},left=${left},top=96`
  );
  if (!popup) {
    throw new Error("Popup blocked — allow popups for this site");
  }
  popup.focus();
}
