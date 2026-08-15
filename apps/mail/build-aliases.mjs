import path from "node:path";

/**
 * The `@/*` aliases for the standalone build, in order.
 *
 * Matching is by prefix and the first hit wins, so the specific entries come
 * before the general ones.
 *
 * **Both the build and the tests read this list.** They have to: a test that
 * resolves a module differently from the build is checking a program that does
 * not ship. That is not hypothetical here — the typecheck and the bundler
 * disagreed about these very modules until August 2026, and the typecheck was
 * the one reading files nobody ran.
 *
 * The list mirrors the tsconfig path fallback, with the seams pointed at local
 * files. A missing entry shows up as a build failure naming the module, which
 * is the signal you want.
 */
export function mailAliases(appDir, { flavor = "public" } = {}) {
  const root = path.resolve(appDir, "../..");
  const mailPkg = path.resolve(root, "products/mail/packages/mail");
  const shared = path.resolve(root, "packages/shared");
  const seams = path.resolve(appDir, "src/seams");
  // The team layer. The public flavor never reaches it (the gate checks the
  // flavor first) and gets a module whose every export throws. The internal
  // flavor — the mail pane of the Planner Mac app — reaches it over the
  // planner API.
  const crm = path.resolve(seams, flavor === "internal" ? "planner-crm.ts" : "no-crm.ts");

  return [
    // The guard for Next's server/client split has nothing to guard here.
    { find: "server-only", replacement: path.resolve(seams, "server-only.ts") },
    // Nor is there a framework to load components with.
    { find: "next/dynamic", replacement: path.resolve(seams, "next-dynamic.tsx") },
    // Named inside crm-gate's dynamic imports.
    { find: "@/lib/plan/crm-contacts", replacement: crm },
    { find: "@/lib/team", replacement: crm },

    // Seams: what this product does differently from the planner.
    { find: "@/lib/mail-router", replacement: path.resolve(seams, "mail-router.ts") },
    { find: "@/lib/page-snapshot-cache", replacement: path.resolve(seams, "page-snapshot-cache.ts") },
    // Keeps Postgres out of the graph entirely.
    { find: "@/lib/mail/store/types", replacement: path.resolve(mailPkg, "lib/mail/store/types.ts") },
    { find: "@/lib/mail/store/tauri", replacement: path.resolve(mailPkg, "lib/mail/store/tauri/index.ts") },
    { find: "@/lib/mail/store", replacement: path.resolve(seams, "store.ts") },
    // Attachments are read through the transport and shown as blob URLs; a
    // raw <img src="/api/..."> has nothing to answer it here.
    { find: "@/lib/mail/attachment-source", replacement: path.resolve(seams, "attachment-source.ts") },
    // Text out of a PDF, with pdf.js in the webview, for the AI's context.
    { find: "@/lib/mail/attachment-text", replacement: path.resolve(seams, "attachment-text.ts") },
    // Remote images go to the shell's own scheme, not to a proxy route.
    { find: "@/lib/mail/image-proxy", replacement: path.resolve(seams, "image-proxy.ts") },

    // Token refresh uses this app's own public client, not a server's.
    { find: "@/lib/gmail/oauth", replacement: path.resolve(seams, "gmail-oauth.ts") },
    { find: "@/lib/outlook/oauth", replacement: path.resolve(seams, "outlook-oauth.ts") },
    // Signing in runs here, with PKCE, instead of on an OAuth route.
    { find: "@/lib/mail/connect-mailbox", replacement: path.resolve(seams, "connect-mailbox.ts") },

    // The desktop bridge is real here.
    { find: "@/lib/native-shell", replacement: path.resolve(appDir, "lib/native-shell.ts") },

    // The mail package owns these.
    { find: "@/components/mail", replacement: path.resolve(mailPkg, "components/mail") },
    { find: "@/mail.css", replacement: path.resolve(mailPkg, "mail.css") },
    { find: "@/styles", replacement: path.resolve(appDir, "styles") },
    { find: "@/lib/mail", replacement: path.resolve(mailPkg, "lib/mail") },
    { find: "@/lib/gmail", replacement: path.resolve(mailPkg, "lib/gmail") },
    { find: "@/lib/outlook", replacement: path.resolve(mailPkg, "lib/outlook") },
    { find: "@/lib/google", replacement: path.resolve(mailPkg, "lib/google") },

    // Everything else comes from the shared package.
    { find: "@/components", replacement: path.resolve(shared, "components") },
    { find: "@/lib", replacement: path.resolve(shared, "lib") },
    { find: "@", replacement: mailPkg },
  ];
}

/**
 * The same list as esbuild wants it: exact names mapped to files.
 *
 * esbuild matches an alias exactly, or as a path prefix followed by a slash,
 * which is what the bundler above does too. Insertion order is kept, so the
 * specific entries still come first.
 */
export function esbuildAliases(appDir, options) {
  return Object.fromEntries(
    mailAliases(appDir, options).map(({ find, replacement }) => [find, replacement])
  );
}
