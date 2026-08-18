/**
 * Which way a reply goes.
 *
 * The bug this guards: a thread between two of the reader's own mailboxes.
 * Mail from their Gmail to their Outlook, read in the Outlook mailbox,
 * counted as sent-by-us because Gmail is also theirs — so the reply was
 * addressed to the Outlook mailbox it was already sitting in, and writing
 * back to yourself was the only thing the box would let you do.
 */

import assert from "node:assert/strict";

import { setOwnMailIdentity } from "@/lib/own-addresses";
import { sentFromThisMailbox } from "@/lib/mail/reply-target";
import { check, suite } from "./harness.mjs";

const OUTLOOK = "vera.vinter@vaerksted.example";
const GMAIL = "vera.vinter@mail.example";
const ALIAS = "vera@atelier.example";
const OTHER = "kanin@kunsthal.example";

suite(async () => {
  // Every one of these is the reader's; the account being read is OUTLOOK.
  setOwnMailIdentity({ addresses: [OUTLOOK, GMAIL, ALIAS], domains: [] });

  const sent = (input) =>
    sentFromThisMailbox({ to: [], cc: [], account: OUTLOOK, ...input });

  // ---- Somebody else ------------------------------------------------------
  check(
    "mail from another person is incoming — the reply goes back to them",
    sent({ from: OTHER, to: [OUTLOOK] }) === false
  );

  // ---- This mailbox -------------------------------------------------------
  check(
    "mail from this mailbox is outgoing — the reply goes to who it was sent to",
    sent({ from: OUTLOOK, to: [OTHER] }) === true
  );
  // Cc-ing yourself puts a copy back in your own inbox. It is still a message
  // you sent, and the reply belongs to the person you sent it to.
  check(
    "cc-ing yourself does not turn your own message into an incoming one",
    sent({ from: OUTLOOK, to: [OTHER], cc: [OUTLOOK] }) === true
  );

  // ---- The bug: a thread between two of your own mailboxes ----------------
  check(
    "mail from your other mailbox, delivered here, is incoming",
    sent({ from: GMAIL, to: [OUTLOOK] }) === false,
    "the reply must go back to the Gmail address, not to this mailbox"
  );
  check(
    "delivered here by Cc counts the same",
    sent({ from: GMAIL, to: [OTHER], cc: [OUTLOOK] }) === false
  );

  // ---- An alias this mailbox sends as -------------------------------------
  // Sent under another of the reader's addresses and never addressed here:
  // outgoing, so the reply goes to the person it was written to.
  check(
    "mail sent under an alias, not addressed here, is still outgoing",
    sent({ from: ALIAS, to: [OTHER] }) === true
  );

  // ---- Edges --------------------------------------------------------------
  check("no sender is not something to reply away from", sent({ from: "" }) === false);
  check(
    "case and dots do not make it a different mailbox",
    sent({ from: "Vera.Vinter@Vaerksted.Example", to: [OTHER] }) === true
  );

  // A mailbox that is not the reader's at all, from a stranger, addressed
  // elsewhere: still incoming. Nothing here says otherwise.
  check(
    "a stranger writing to a list is incoming",
    sent({ from: OTHER, to: ["list@kunsthal.example"] }) === false
  );
});
