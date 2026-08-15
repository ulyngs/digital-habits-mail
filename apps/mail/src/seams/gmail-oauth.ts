/**
 * Token refresh for the standalone product.
 *
 * The mail core asks for an access token whenever it talks to Gmail. The
 * planner's version reads a client id and secret from the server environment,
 * which this build has neither of. It uses the app's own desktop client
 * instead, the same one that connected the mailbox.
 *
 * Only `refreshAccessToken` is needed. The rest of the planner's OAuth module
 * belongs to a flow that runs on a server.
 */

import { buildRefreshBody } from "@/lib/mail/pkce";

import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_TOKEN_ENDPOINT,
} from "../oauth-config";

/**
 * A fresh access token, from a stored refresh token.
 *
 * A refused refresh must say `invalid_grant`, because that is what the caller
 * matches on to mark a mailbox as needing to reconnect. Anything else looks
 * like a temporary fault and is retried forever.
 */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("VITE_GOOGLE_CLIENT_ID is not set");
  }
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: buildRefreshBody({
      clientId: GOOGLE_CLIENT_ID,
      refreshToken,
      clientSecret: GOOGLE_CLIENT_SECRET,
    }).toString(),
  });

  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || data.error) {
    const detail = data.error_description || data.error || "refresh failed";
    throw new Error(data.error ? `${data.error}: ${detail}` : detail);
  }
  if (!data.access_token) {
    throw new Error("Google returned no access token on refresh");
  }
  return data.access_token;
}
