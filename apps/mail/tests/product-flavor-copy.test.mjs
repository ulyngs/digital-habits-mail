/**
 * Nothing names the team layer without asking whether this build has one.
 *
 * The public build is the standalone Mail app. It has no CRM, no planner
 * database, and no org LLM keys, and `lib/mail/product-flavor` is the door
 * every one of those features is supposed to knock on.
 *
 * The door works. The failure it does not prevent is a call site that never
 * knocks: "Update CRM status? After sending, our LLM will update the notes."
 * shipped in a signed build because it was gated on the thread being with a
 * known contact, which is a different question. Nobody saw it until the app
 * was installed.
 *
 * So this reads the components as text and asks one thing of them: a file
 * that says CRM or LLM to a reader has to import the flavor gate. It cannot
 * tell whether the gate is used correctly — only that the file has had the
 * thought. That is the part that was missing.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { check, suite } from "./harness.mjs";

// From the working directory, not from this file: the harness compiles each
// test into a temp directory, so the file's own path leads nowhere.
const componentsDir = join(
  process.cwd(),
  "../../products/mail/packages/mail/components/mail"
);

/** Words that name the team layer to a reader. */
const TEAM_WORDS = /\b(CRM|LLM|Grok)\b/;

/**
 * Comments are where these words belong without a gate: they explain the
 * code to whoever reads it next, and nobody using the app ever sees them.
 */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

suite(async () => {
  const files = readdirSync(componentsDir).filter((f) => f.endsWith(".tsx"));
  check("there are components to read", files.length > 0, String(files.length));

  const ungated = [];
  for (const file of files) {
    const source = readFileSync(join(componentsDir, file), "utf8");
    const code = withoutComments(source);
    if (!TEAM_WORDS.test(code)) continue;
    if (source.includes("@/lib/mail/product-flavor")) continue;
    const line = code
      .split("\n")
      .find((l) => TEAM_WORDS.test(l))
      ?.trim();
    ungated.push(`${file}: ${line?.slice(0, 80) ?? ""}`);
  }

  check(
    "a component that names CRM or an LLM asks the product flavor first",
    ungated.length === 0,
    ungated.join(" | ")
  );
});
