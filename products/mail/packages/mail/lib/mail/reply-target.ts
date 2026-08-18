/**
 * Which way a reply goes.
 *
 * Reply to a message somebody sent you and it goes back to them. Reply to
 * one you sent, and it goes to whoever you addressed it to — not to
 * yourself. So the question is only ever: did this message go out from the
 * mailbox I am reading it in?
 *
 * "From an address of mine" is not the same question, and answering that one
 * instead is what broke a thread between two of the reader's own mailboxes.
 * Mail sent from their Gmail to their Outlook, read in the Outlook mailbox,
 * counted as sent-by-us because Gmail is theirs — so the reply was addressed
 * to the Outlook mailbox it was already sitting in, and writing back to
 * yourself was the only thing you could do.
 *
 * No React and no network in here, so a test can read it.
 */

import { isOwnPersonalAddress, normalizeEmail } from "@/lib/own-addresses";

/**
 * True when the reply should go to the message's recipients rather than to
 * its sender — that is, when this mailbox is the one that sent it.
 *
 * Three cases, in order:
 *
 * 1. It came from this very mailbox. Outgoing, whoever else it reached —
 *    which is what keeps cc-ing yourself working: the copy that lands back
 *    in your inbox is still a message you sent, and the reply belongs to the
 *    person you sent it to.
 * 2. It was delivered here — this mailbox is in To or Cc. Incoming, even
 *    from another address of your own. This is the thread-with-yourself
 *    case, and the sender is a real place to reply to.
 * 3. Neither: it is from an address of yours and was not addressed here, so
 *    it went out under an alias this mailbox sends as. Outgoing.
 */
export function sentFromThisMailbox(input: {
  from: string;
  account: string;
  to: readonly string[];
  cc: readonly string[];
}): boolean {
  const from = normalizeEmail(input.from ?? "");
  if (!from) return false;
  const account = normalizeEmail(input.account);
  if (from === account) return true;

  const deliveredHere = [...input.to, ...input.cc].some(
    (address) => normalizeEmail(address ?? "") === account
  );
  if (deliveredHere) return false;

  return isOwnPersonalAddress(from);
}
