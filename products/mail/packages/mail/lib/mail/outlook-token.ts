/**
 * Outlook access tokens, cached per mailbox.
 *
 * This sits below the inbox and folder modules so both can reach it without
 * importing each other.
 */

import "server-only";

import {
  getOutlookRefreshToken,
  updateOutlookRefreshToken,
} from "@/lib/outlook/accounts";
import { refreshMicrosoftAccessToken } from "@/lib/outlook/oauth";

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Forget a cached access token, after the mailbox is connected again.
 *
 * A revoked grant leaves a token here that still looks fresh for up to 45
 * minutes. Without this the reconnect appears to do nothing.
 */
export function clearOutlookAccessToken(accountEmail: string): void {
  tokenCache.delete(accountEmail);
  tokenCache.delete(accountEmail.trim().toLowerCase());
}

export async function outlookAccessTokenFor(
  accountEmail: string
): Promise<string> {
  const cached = tokenCache.get(accountEmail);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const stored = await getOutlookRefreshToken(accountEmail);
  const refreshed = await refreshMicrosoftAccessToken(stored.refreshToken);
  if (refreshed.refreshToken) {
    await updateOutlookRefreshToken(
      accountEmail,
      stored.clerkUserId,
      refreshed.refreshToken
    );
  }
  tokenCache.set(accountEmail, {
    token: refreshed.accessToken,
    expiresAt: Date.now() + 45 * 60 * 1000,
  });
  return refreshed.accessToken;
}
