import "server-only";

import {
  getCachedConnectedMailAccounts,
  invalidateConnectedMailAccountsCache,
  setCachedConnectedMailAccounts,
  type ConnectedMailAccount,
} from "@/lib/mail/connected-accounts-cache";
import { listGmailAccounts, type GmailAccount } from "@/lib/gmail/accounts";
import {
  hasOutlookAccount,
  listOutlookAccounts,
  type OutlookAccount,
} from "@/lib/outlook/accounts";
import { normalizeEmail } from "@/lib/own-addresses";
import { PlanError } from "@/lib/plan/errors";

export type MailProvider = "gmail" | "outlook";

export type { ConnectedMailAccount };
export { invalidateConnectedMailAccountsCache };

/**
 * Mailboxes the signed-in user connected (Mail UI / inbox / folders).
 * CRM sync continues to call listGmailAccounts() without a user filter.
 */
export async function listConnectedMailAccounts(
  clerkUserId: string
): Promise<ConnectedMailAccount[]> {
  const cached = getCachedConnectedMailAccounts(clerkUserId);
  if (cached) return cached;

  const [gmail, outlook] = await Promise.all([
    listGmailAccounts({ clerkUserId }),
    listOutlookAccounts({ clerkUserId }),
  ]);
  const out: ConnectedMailAccount[] = [
    ...gmail.map((a: GmailAccount) => ({
      email: a.email,
      provider: "gmail" as const,
      inMailTab: a.inMailTab,
      clerkUserId: a.clerkUserId,
    })),
    ...outlook.map((a: OutlookAccount) => ({
      email: a.email,
      provider: "outlook" as const,
      inMailTab: a.inMailTab,
      clerkUserId: a.clerkUserId,
    })),
  ];
  out.sort((a, b) => a.email.localeCompare(b.email));
  setCachedConnectedMailAccounts(clerkUserId, out);
  return out;
}

/** True when this local owner owns the connected mailbox row. */
export async function userOwnsMailAccount(
  email: string,
  clerkUserId: string
): Promise<boolean> {
  const key = normalizeEmail(email);
  const accounts = await listConnectedMailAccounts(clerkUserId);
  return accounts.some((a) => normalizeEmail(a.email) === key);
}

export async function assertUserOwnsMailAccount(
  email: string,
  clerkUserId: string
): Promise<void> {
  if (!(await userOwnsMailAccount(email, clerkUserId))) {
    throw new PlanError("Mail account not found", 404);
  }
}

export async function resolveMailProvider(
  email: string
): Promise<MailProvider> {
  const key = normalizeEmail(email);
  if (await hasOutlookAccount(key)) return "outlook";
  // Default Gmail — existing callers assume Gmail when the row exists there.
  return "gmail";
}
