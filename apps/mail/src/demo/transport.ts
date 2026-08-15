/**
 * The app, answering itself. For screenshots.
 *
 * Every call the interface makes goes through one transport — that is the
 * whole of the seam this needs. Demo mode swaps the real one, which reaches
 * Gmail and Graph, for this, which reaches `demo/data.ts`. Not a line of the
 * interface knows the difference, so a picture taken here is a picture of
 * the app as it ships.
 *
 * Nothing signs in and nothing is stored: the mailbox is invented, and the
 * app never touches the keychain or the database in this mode. Switch it on
 * with `pnpm app:dev:demo`, or by adding `?demo=1` in the browser.
 *
 * Paths this does not know about answer `{ success: true }` with an empty
 * body. That is deliberate: the interface asks for a dozen optional things
 * (scheduled sends, chat parts, contact sources) and a screenshot needs none
 * of them, but it must not fall over for want of an answer.
 */

import {
  DEMO_ACCOUNT,
  DEMO_NAME,
  DEMO_SECOND_ACCOUNT,
  demoContacts,
  demoImage,
  demoPdf,
  demoThreadDetail,
  demoThreads,
} from "./data";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function accountRows(email: string) {
  return [
    {
      email,
      clerkUserId: "demo",
      historyId: null,
      lastSyncedAt: new Date().toISOString(),
      lastSyncError: null,
      inMailTab: true,
    },
  ];
}

/** The bytes behind an attachment: drawn or written here, never shipped. */
function attachmentBody(filename: string, mimeType: string): Response {
  if (mimeType === "application/pdf" || /\.pdf$/i.test(filename)) {
    // A fresh buffer, because a Response wants one it owns.
    return new Response(demoPdf(filename.replace(/\.pdf$/i, "")).slice().buffer, {
      status: 200,
      headers: { "content-type": "application/pdf" },
    });
  }
  const seed = [...filename].reduce((n, c) => n + c.charCodeAt(0), 0);
  const png = demoImage(seed);
  if (!png) return new Response("", { status: 404 });
  return new Response(png.slice().buffer, {
    status: 200,
    headers: { "content-type": "image/png" },
  });
}

export async function handleDemoMailApi(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = new URL(path, "http://demo.invalid");
  const q = url.searchParams;
  const threads = demoThreads();

  switch (url.pathname) {
    case "/api/mail/threads": {
      const rows = threads.map((t) => t.summary);
      const search = (q.get("q") ?? "").trim().toLowerCase();
      const found = search
        ? rows.filter((r) =>
            `${r.subject} ${r.fromName} ${r.snippet}`
              .toLowerCase()
              .includes(search)
          )
        : rows;
      return json({ success: true, threads: found, nextCursor: null });
    }

    case "/api/mail/thread": {
      const thread = demoThreadDetail(q.get("id") ?? "");
      if (!thread) return json({ error: "No such thread" });
      return json({ success: true, thread });
    }

    case "/api/mail/attachment": {
      return attachmentBody(
        q.get("filename") ?? "file",
        q.get("mimeType") ?? ""
      );
    }

    case "/api/gmail/accounts":
      return json({
        success: true,
        accounts: accountRows(DEMO_ACCOUNT),
        configError: null,
      });

    case "/api/outlook/accounts":
      return json({
        success: true,
        accounts: accountRows(DEMO_SECOND_ACCOUNT),
        configError: null,
      });

    case "/api/mail/folders":
      return json({
        success: true,
        folders: [
          { account: DEMO_ACCOUNT, name: "Exhibitions", count: 12 },
          { account: DEMO_ACCOUNT, name: "Suppliers", count: 5 },
          { account: DEMO_ACCOUNT, name: "Receipts", count: 31 },
        ],
      });

    case "/api/mail/contacts":
      return json({ success: true, contacts: demoContacts() });

    case "/api/mail/signature":
      return json({
        success: true,
        settings: {
          signature: `${DEMO_NAME}<br>Vinter Værksted`,
          includeByDefault: true,
        },
      });

    case "/api/mail/sender-name":
      return json({ success: true, settings: { name: DEMO_NAME } });

    // A send in demo mode goes nowhere, and says so plainly rather than
    // pretending: a screenshot of a sent message is not worth a surprise.
    case "/api/mail/send":
      return json({ error: "Demo mode — nothing is sent" });

    default:
      break;
  }

  // Everything else: enough of an answer to keep the interface upright.
  const empty: Record<string, unknown> = { success: true };
  if (url.pathname.includes("contact-lists")) empty.lists = [];
  if (url.pathname.includes("contact-sources")) empty.sources = [];
  if (url.pathname.includes("autoreply")) empty.autoReplies = [];
  if (url.pathname.includes("scheduled")) empty.messages = [];
  if (url.pathname.includes("snoozed")) empty.threads = [];
  if (url.pathname.includes("chat/parts")) empty.parts = [];
  if (url.pathname.includes("drafts")) empty.drafts = [];
  void init;
  return json(empty);
}
