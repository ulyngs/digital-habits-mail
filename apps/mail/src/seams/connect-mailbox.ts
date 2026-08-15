/**
 * Starting a mailbox sign-in, for a build with no server.
 *
 * The planner sends the user to an OAuth route that holds a client secret. This
 * product runs the flow itself, with PKCE and the system browser, and writes
 * the token to the keychain. See `./connect-mailbox`.
 *
 * The interface calls the same two functions either way.
 */

import { toast } from "sonner";

import type { MailConnectSeam } from "@/lib/mail/host/contracts";

import { connectMailbox } from "../connect-mailbox";
import { useMailRouter } from "./mail-router";

/**
 * There is no address to send anyone to, and no page load to survive. The
 * interface uses this as an `href` fallback and stops the click before it
 * navigates, so this value is never followed.
 */
export const mailConnectHref: MailConnectSeam["mailConnectHref"] = () => "#";

/** True while a sign-in is waiting on the browser, so two cannot overlap. */
let running = false;

export const startMailConnect: MailConnectSeam["startMailConnect"] = async (
  provider,
  email
) => {
  if (running) return;
  running = true;
  const label = provider === "outlook" ? "Microsoft" : "Google";
  const waiting = toast.loading(`Finish signing in with ${label}…`);
  try {
    const connected = await connectMailbox(provider, email);
    toast.success(`Connected ${connected.email}`, { id: waiting });
    // The mailbox list belongs to App, which reads it from the store.
    useMailRouter().refresh();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Couldn't connect", {
      id: waiting,
    });
  } finally {
    running = false;
  }
};
