export type ConnectedMailAccount = {
  email: string;
  provider: "gmail" | "outlook";
  inMailTab: boolean;
  clerkUserId: string;
};

const TTL_MS = 30_000;

/** Per local owner — Mail UI must not share another user's mailbox list. */
const cacheByUser = new Map<
  string,
  { at: number; value: ConnectedMailAccount[] }
>();

export function getCachedConnectedMailAccounts(
  clerkUserId: string
): ConnectedMailAccount[] | null {
  const cache = cacheByUser.get(clerkUserId);
  if (!cache) return null;
  if (Date.now() - cache.at >= TTL_MS) {
    cacheByUser.delete(clerkUserId);
    return null;
  }
  return cache.value;
}

export function setCachedConnectedMailAccounts(
  clerkUserId: string,
  value: ConnectedMailAccount[]
): void {
  cacheByUser.set(clerkUserId, { at: Date.now(), value });
}

export function invalidateConnectedMailAccountsCache(
  clerkUserId?: string
): void {
  if (clerkUserId) {
    cacheByUser.delete(clerkUserId);
    return;
  }
  cacheByUser.clear();
}
