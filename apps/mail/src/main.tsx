/**
 * Entry point for the standalone Mail app.
 *
 * No Next, no Clerk, no Postgres. The user interface comes from
 * products/mail/packages/mail, and every seam it needs is aliased in
 * vite.config.ts to something local. See `docs/mail-product-plan.md`.
 *
 * Two things can render here. The mail client is one; a popped-out thread is
 * the other, in its own always-on-top window. The planner serves those from
 * two routes, which this build has no server to do — so one document answers
 * both, and the query string says which. Rust builds that URL: see
 * `open_chat_popout` in src-tauri.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";

import { ChatPopout } from "@/components/mail/ChatPopout";
import { openMailAccountsMenu } from "@/components/mail/MailPage";
import { setMailApiTransport } from "@/lib/mail/api";
import {
  MAIL_COLOR_MODE_EVENT,
  readMailColorMode,
} from "@/lib/mail/theme";

import { App } from "./App";
import { WindowControls } from "./WindowControls";
import { importPlannerStateOnce } from "./import-planner-state";
import { isDemoMode } from "./demo/mode";
import { handleDemoMailApi } from "./demo/transport";
import { handleStandaloneMailApi } from "./standalone-api";

import "../styles/globals.css";
import "@/mail.css";
import "./standalone.css";

const params = new URLSearchParams(window.location.search);

/**
 * A mailbox that does not exist, for screenshots.
 *
 * `pnpm app:dev:demo` sets the flag at build time; `?demo=1` turns it on in
 * a browser. Nothing signs in and nothing is stored in this mode — see
 * `demo/transport.ts`.
 */
const demoMode = isDemoMode();

/**
 * Every API call goes to the core in this webview, not to a server.
 *
 * This runs in the popout window too, which is a webview of its own with its
 * own copy of every module. It reads the same SQLite file and the same
 * keychain, because those live in the app rather than in a page.
 */
setMailApiTransport(demoMode ? handleDemoMailApi : handleStandaloneMailApi);
const isPopout = params.get("popout") === "1";
const account = params.get("account") ?? "";
const threadId = params.get("thread") ?? "";

function Root() {
  // The window buttons on Windows sit over the title strip. Not in the
  // popout, which draws its own card and closes from it.
  if (!isPopout) {
    return (
      <>
        <App />
        <WindowControls />
      </>
    );
  }
  if (!account || !threadId) {
    return (
      <p className="p-6 text-sm text-stone-500">
        Missing thread reference — open this window from the mail client.
      </p>
    );
  }
  return (
    <ChatPopout
      account={account}
      threadId={threadId}
      personName={params.get("name") ?? ""}
      personEmail={params.get("email") ?? ""}
      subject={params.get("subject") ?? ""}
    />
  );
}

// The popout draws its own rounded card on a transparent window, so the page
// behind it must not paint one.
if (isPopout) document.documentElement.classList.add("dh-popout");

/**
 * Which system the window is on, for the chrome that differs.
 *
 * The Mac window has no system title bar: the traffic lights float over the
 * page, and the interface leaves room for them. The Windows window has no
 * system title bar either, and nothing at the left to leave room for, so the
 * strip is laid out from its own left edge and the window buttons are drawn
 * at the right. See `--mail-titlebar-left` in standalone.css and
 * WindowControls.tsx.
 *
 * `userAgentData` is the reading, not `userAgent`: the window is configured
 * with a Safari user agent string on every system, and this API is separate
 * from it. WKWebView does not implement it at all, so a missing answer is a
 * Mac — which is the default this only departs from.
 */
{
  const platform = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData?.platform;
  if (platform) document.documentElement.dataset.dhOs = platform.toLowerCase();
}

/**
 * The window behind the interface.
 *
 * `.mail-shell` fills the window, but the document under it paints first and
 * paints white. In dark mode that is a flash on start and a white edge while
 * the window resizes, so the theme goes on <html> as well. The interface owns
 * the setting — this only follows it.
 */
function applyWindowTheme() {
  document.documentElement.dataset.theme = readMailColorMode();
}
applyWindowTheme();
window.addEventListener(MAIL_COLOR_MODE_EVENT, applyWindowTheme);
window.addEventListener("storage", applyWindowTheme);
window
  .matchMedia?.("(prefers-color-scheme: dark)")
  .addEventListener("change", applyWindowTheme);

/**
 * Settings… in the app menu, and Cmd+Comma.
 *
 * The menu is native, so it cannot open a panel in the page. Rust sends this
 * event to the main window instead (see src-tauri/src/menu.rs), and the page
 * opens the same panel the title-bar button does. Not in the popout, which
 * has no such panel; Rust only sends it here.
 */
if (!isPopout) {
  const tauriEvent = (
    window as unknown as {
      __TAURI__?: {
        event?: {
          listen?: (name: string, handler: () => void) => Promise<() => void>;
        };
      };
    }
  ).__TAURI__?.event;
  void tauriEvent?.listen?.("open-settings", openMailAccountsMenu).catch(() => {});
}

/**
 * The mail pane's first launch takes over what the planner server held. It
 * runs before the interface reads the store, so a mailbox list or a snooze
 * that came across is there on the first paint. See import-planner-state.ts.
 * The popout skips it: the main pane has done it or will.
 */
if (!isPopout) await importPlannerStateOnce();

/**
 * Trackpad pinch. The shell catches it in AppKit — WKWebView swallows it —
 * and sends it here as a Tauri event; the interface listens for the DOM
 * event, so pass it on. See magnify.rs.
 */
{
  const tauriEvent = (
    window as unknown as {
      __TAURI__?: {
        event?: {
          listen?: (
            name: string,
            handler: (event: { payload: number }) => void
          ) => Promise<() => void>;
        };
      };
    }
  ).__TAURI__?.event;
  void tauriEvent?.listen?.("mail-pinch-scale", (event) => {
    window.dispatchEvent(new CustomEvent("mail-pinch-scale", { detail: event.payload }));
  }).catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
    <Toaster position="bottom-center" richColors closeButton />
  </React.StrictMode>
);
