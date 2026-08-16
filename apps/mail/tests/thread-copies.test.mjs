/**
 * One row for a mail that came to two of our mailboxes — and every copy
 * behind the row when the row is acted on.
 *
 * The bug this guards: delete the row, only its own copy went, the other
 * copy took its place on the next refresh, and the reader deleted again —
 * by which time the selection had moved on to the next conversation.
 */

import assert from "node:assert/strict";

import {
  dedupeThreadsByTip,
  everyCopy,
  threadKey,
} from "@/lib/mail/thread-copies";

const row = (account, threadId, tipId, lastAt, extra = {}) => ({
  account,
  threadId,
  tipId,
  lastAt,
  subject: "Kassevis af kataloger",
  fromName: "Sigrid Sten",
  fromEmail: "sigrid.sten@vaerksted.example",
  snippet: "",
  unread: false,
  ...extra,
});

/** The same message in two mailboxes is one row, and the row remembers the other. */
{
  const rows = dedupeThreadsByTip([
    row("ulrik@a.example", "t-a", "<m1@x>", "2026-08-16T10:00:00Z"),
    row("team@a.example", "t-b", "<m1@x>", "2026-08-16T10:00:00Z"),
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].alsoIn, [
    { account: "team@a.example", threadId: "t-b" },
  ]);
}

/** Different messages are different rows, and carry no copies. */
{
  const rows = dedupeThreadsByTip([
    row("ulrik@a.example", "t-a", "<m1@x>", "2026-08-16T10:00:00Z"),
    row("ulrik@a.example", "t-c", "<m2@x>", "2026-08-16T09:00:00Z"),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].alsoIn, undefined);
  assert.equal(rows[1].alsoIn, undefined);
}

/** Three mailboxes: the newest stands, both others are behind it. */
{
  const rows = dedupeThreadsByTip([
    row("c@a.example", "t-c", "<m1@x>", "2026-08-16T09:00:00Z"),
    row("a@a.example", "t-a", "<m1@x>", "2026-08-16T10:00:00Z"),
    row("b@a.example", "t-b", "<m1@x>", "2026-08-16T09:30:00Z"),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].account, "a@a.example");
  assert.deepEqual(
    rows[0].alsoIn.map(threadKey).sort(),
    ["b@a.example|t-b", "c@a.example|t-c"]
  );
}

/** Deduping again — a refresh over rows already deduped — does not double the copies. */
{
  const once = dedupeThreadsByTip([
    row("ulrik@a.example", "t-a", "<m1@x>", "2026-08-16T10:00:00Z"),
    row("team@a.example", "t-b", "<m1@x>", "2026-08-16T10:00:00Z"),
  ]);
  const twice = dedupeThreadsByTip([
    ...once,
    row("team@a.example", "t-b", "<m1@x>", "2026-08-16T10:00:00Z"),
  ]);
  assert.equal(twice.length, 1);
  assert.equal(twice[0].alsoIn.length, 1);
}

/** What an action on the row acts on: the row's own copy first, then the rest. */
{
  const rows = dedupeThreadsByTip([
    row("ulrik@a.example", "t-a", "<m1@x>", "2026-08-16T10:00:00Z"),
    row("team@a.example", "t-b", "<m1@x>", "2026-08-16T10:00:00Z"),
  ]);
  const copies = everyCopy({ account: "ulrik@a.example", threadId: "t-a" }, rows);
  assert.deepEqual(copies, [
    { account: "ulrik@a.example", threadId: "t-a" },
    { account: "team@a.example", threadId: "t-b" },
  ]);
}

/** A thread the list has never heard of acts on itself alone. */
assert.deepEqual(
  everyCopy({ account: "x@a.example", threadId: "t-x" }, []),
  [{ account: "x@a.example", threadId: "t-x" }]
);

/** An undo record carries its own copies: everyCopy over the record alone finds them. */
{
  const record = {
    ...row("ulrik@a.example", "t-a", "<m1@x>", "2026-08-16T10:00:00Z"),
    alsoIn: [{ account: "team@a.example", threadId: "t-b" }],
  };
  assert.equal(everyCopy(record, [record]).length, 2);
}
