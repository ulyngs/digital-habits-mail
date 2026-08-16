/**
 * Dragging a mailbox heading to a new place in the rail.
 *
 * One move — put this mailbox in front of that one — and the arrangement that
 * comes out of it, which is what the rail, the chips, and the settings panel
 * all read. Neither provider can hold it, so it is kept as a preference.
 */

import assert from "node:assert/strict";

import {
  moveAccountBefore,
  sortAccountsByOrder,
} from "@/lib/mail/account-order";

const LIST = ["a@example.com", "b@example.com", "c@example.com"];

/** Up: in front of the first one is the top of the list. */
assert.deepEqual(moveAccountBefore(LIST, "c@example.com", "a@example.com"), [
  "c@example.com",
  "a@example.com",
  "b@example.com",
]);

/** Into the middle. */
assert.deepEqual(moveAccountBefore(LIST, "a@example.com", "c@example.com"), [
  "b@example.com",
  "a@example.com",
  "c@example.com",
]);

/** Nothing in front of it: the end of the list. */
assert.deepEqual(moveAccountBefore(LIST, "a@example.com", null), [
  "b@example.com",
  "c@example.com",
  "a@example.com",
]);

/** A drop in front of itself is a drag that thought better of it. */
assert.deepEqual(moveAccountBefore(LIST, "b@example.com", "b@example.com"), LIST);

/** The address is matched the way mail matches one. */
assert.deepEqual(moveAccountBefore(LIST, "C@Example.com", " a@example.com "), [
  "c@example.com",
  "a@example.com",
  "b@example.com",
]);

/** A mailbox nobody has heard of moves nothing. */
assert.deepEqual(moveAccountBefore(LIST, "z@example.com", "a@example.com"), LIST);
assert.deepEqual(moveAccountBefore(LIST, "a@example.com", "z@example.com"), LIST);

/** The hidden mailboxes in a provider's list keep their places. */
{
  const full = ["a@example.com", "hidden@example.com", "b@example.com"];
  assert.deepEqual(moveAccountBefore(full, "b@example.com", "a@example.com"), [
    "b@example.com",
    "a@example.com",
    "hidden@example.com",
  ]);
}

// --- The reader's arrangement ------------------------------------------------

/** No arrangement: the list is left as the host gave it. */
assert.deepEqual(sortAccountsByOrder(LIST, []), LIST);

/** An arrangement, in full. */
assert.deepEqual(
  sortAccountsByOrder(LIST, ["c@example.com", "a@example.com", "b@example.com"]),
  ["c@example.com", "a@example.com", "b@example.com"]
);

/** The addresses are matched however they are cased. */
assert.deepEqual(
  sortAccountsByOrder(
    ["A@Example.com", "b@example.com"],
    ["b@example.com", "a@example.com"]
  ),
  ["b@example.com", "A@Example.com"]
);

/** Nothing known above it: a mailbox the arrangement never named stays put. */
assert.deepEqual(
  sortAccountsByOrder(["new@example.com", "b@example.com"], ["b@example.com"]),
  ["new@example.com", "b@example.com"]
);

/** A mailbox connected since the last drag follows the one it came after. */
assert.deepEqual(
  sortAccountsByOrder(
    ["a@example.com", "new@example.com", "b@example.com"],
    ["b@example.com", "a@example.com"]
  ),
  ["b@example.com", "a@example.com", "new@example.com"]
);

/** A mailbox in the arrangement that is no longer connected is passed over. */
assert.deepEqual(
  sortAccountsByOrder(
    ["a@example.com", "b@example.com"],
    ["gone@example.com", "b@example.com", "a@example.com"]
  ),
  ["b@example.com", "a@example.com"]
);

/** Two providers, interleaved: the arrangement is the reader's to make. */
assert.deepEqual(
  sortAccountsByOrder(
    ["g1@example.com", "g2@example.com", "o1@outlook.example"],
    ["g1@example.com", "o1@outlook.example", "g2@example.com"]
  ),
  ["g1@example.com", "o1@outlook.example", "g2@example.com"]
);
