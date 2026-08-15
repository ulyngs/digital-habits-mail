/**
 * First launch of the mail pane: bring over what the planner server held.
 *
 * The Planner Mac app kept mail state on the team Postgres until mail went
 * local. Snoozes, conversations, signatures, and the list of mailboxes are
 * this person's, and they should not vanish with the move. So, once, the
 * pane asks the planner for them (`/api/agent/mail/state-export`, over the
 * shell's device token) and hands them to the store
 * (`mail_import_snapshot`, `INSERT OR IGNORE` throughout).
 *
 * Tokens do not come across. Each mailbox arrives with none, and the
 * interface asks for it to be signed in again.
 *
 * Internal flavor only, and only in the desktop app. The public standalone
 * has no planner to ask. A miss — no session yet, network down — is not an
 * error: the next launch tries again, until it has happened once.
 */

import { mailStore } from "@/lib/mail/store";
import { mailUsesCrmPeople } from "@/lib/mail/product-flavor";

import { plannerJson, plannerSessionReady } from "./planner-api";

const DONE_KEY = "planner_state_imported_at";

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function invoke(): Invoke | null {
  const w = window as unknown as {
    __TAURI__?: { core?: { invoke?: Invoke } };
    __TAURI_INTERNALS__?: { invoke?: Invoke };
  };
  return w.__TAURI__?.core?.invoke ?? w.__TAURI_INTERNALS__?.invoke ?? null;
}

export type ImportReport = Record<string, number>;

/** Run the import if it has not run yet. Resolves to what was imported, or null. */
export async function importPlannerStateOnce(): Promise<ImportReport | null> {
  if (!mailUsesCrmPeople()) return null;
  const call = invoke();
  if (!call) return null;
  try {
    if (await mailStore().settings.get(DONE_KEY)) return null;
    // The shell gets its session from the planner page a moment after start.
    // Wait a little for it rather than give up on the first launch.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (await plannerSessionReady()) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!(await plannerSessionReady())) return null;
    const { state } = await plannerJson<{ state: unknown }>("/api/agent/mail/state-export");
    const report = await call<ImportReport>("mail_import_snapshot", { snapshot: state });
    await mailStore().settings.set(DONE_KEY, new Date().toISOString());
    console.info("[mail-pane] imported planner mail state:", report);
    return report;
  } catch (err) {
    console.warn("[mail-pane] planner state import skipped:", err);
    return null;
  }
}
