/**
 * Sign the standalone app in to the planner. Internal flavor only.
 *
 * The team layer — the CRM, the org AI — is on the planner server, and the
 * app reaches it with a device token (see planner-api.ts). This is how the
 * app gets one: it binds the loopback listener it already has for OAuth,
 * opens the planner's device-login page in the browser with the port and a
 * state, and waits. Signed in there, the reader confirms; the page mints
 * the token and sends the browser back to the loopback with it as `code`.
 * The shell keeps the token in the keychain, so this happens once.
 *
 * The planner origin is compiled in: VITE_PLANNER_ORIGIN, default the live
 * site. A dev build against a local planner sets it to localhost:3470.
 */

import { createOauthState } from "@/lib/mail/pkce";
import { openExternalUrl } from "@/lib/native-shell";

import { plannerSessionReady } from "./planner-api";

export const PLANNER_ORIGIN = (
  (import.meta.env.VITE_PLANNER_ORIGIN as string | undefined) || "https://plan.digitalhabits.org"
).replace(/\/+$/, "");

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function invoke(): Invoke {
  const w = window as unknown as {
    __TAURI__?: { core?: { invoke?: Invoke } };
    __TAURI_INTERNALS__?: { invoke?: Invoke };
  };
  const fn = w.__TAURI__?.core?.invoke ?? w.__TAURI_INTERNALS__?.invoke;
  if (!fn) throw new Error("Signing in to the planner needs the desktop app");
  return fn;
}

/** Run the sign-in. Resolves when the shell holds a session. */
export async function signInToPlanner(): Promise<void> {
  const call = invoke();
  const port = await call<number>("oauth_bind");
  const state = createOauthState();
  const url = new URL("/mail/device-login", PLANNER_ORIGIN);
  url.searchParams.set("port", String(port));
  url.searchParams.set("state", state);
  const opened = await openExternalUrl(url.toString());
  if (!opened) throw new Error("Couldn't open the browser to sign in");
  const redirect = await call<{ code: string }>("oauth_await_redirect", {
    expectedState: state,
  });
  await call("planner_session_set", {
    origin: PLANNER_ORIGIN,
    token: redirect.code,
    persist: true,
  });
}

/** Forget the session: sign out of the planner (not of any mailbox). */
export async function signOutOfPlanner(): Promise<void> {
  await invoke()("planner_session_clear");
}

export { plannerSessionReady };
