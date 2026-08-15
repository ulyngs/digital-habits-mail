import "server-only";

import { getAccountRefreshToken } from "@/lib/gmail/accounts";
import { refreshAccessToken } from "@/lib/gmail/oauth";

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** After invalid_grant, skip Google for a while so polls do not spam logs. */
const authFailureCache = new Map<string, { detail: string; until: number }>();
const AUTH_FAILURE_TTL_MS = 10 * 60 * 1000;

export class GmailAuthError extends Error {
  readonly accountEmail: string;

  constructor(accountEmail: string, detail: string) {
    super(`Gmail for ${accountEmail} needs reconnect — ${detail}`);
    this.name = "GmailAuthError";
    this.accountEmail = accountEmail;
  }
}

function isInvalidGrant(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /invalid_grant/i.test(msg);
}

/** Clear a cached auth failure after the user reconnects. */
export function clearGmailAuthFailure(accountEmail: string): void {
  const key = accountEmail.trim().toLowerCase();
  authFailureCache.delete(key);
  tokenCache.delete(accountEmail);
  tokenCache.delete(key);
}

/** Cached Gmail access token for a connected account (tokens live ~60 min). */
export async function accessTokenFor(accountEmail: string): Promise<string> {
  const key = accountEmail.trim().toLowerCase();
  const failed = authFailureCache.get(key);
  if (failed && failed.until > Date.now()) {
    throw new GmailAuthError(accountEmail, failed.detail);
  }

  const cached = tokenCache.get(accountEmail) ?? tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const refreshToken = await getAccountRefreshToken(accountEmail);
  try {
    const token = await refreshAccessToken(refreshToken);
    authFailureCache.delete(key);
    const entry = {
      token,
      expiresAt: Date.now() + 50 * 60 * 1000,
    };
    tokenCache.set(accountEmail, entry);
    tokenCache.set(key, entry);
    return token;
  } catch (err) {
    if (isInvalidGrant(err)) {
      const detail = "Google token expired or revoked";
      authFailureCache.set(key, {
        detail,
        until: Date.now() + AUTH_FAILURE_TTL_MS,
      });
      console.warn(
        `[mail] ${accountEmail}: ${detail}. Reconnect the account in Mail → Accounts.`
      );
      throw new GmailAuthError(accountEmail, detail);
    }
    throw err;
  }
}
