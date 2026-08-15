/**
 * The OAuth clients for the standalone Mail app.
 *
 * Google needs a client secret and Microsoft does not, which is the one real
 * difference between the two flows here. Both are public clients, and PKCE is
 * what protects both. See the note on the Google secret below.
 *
 * The Google client for the standalone Mail app.
 *
 * **Google requires a client secret here, and it is not a secret.** Google's
 * token endpoint refuses a desktop client without one, whatever PKCE does, and
 * Google's own documentation says the value is not treated as confidential for
 * installed apps. It cannot be: anyone can read it out of the binary.
 *
 * PKCE is what actually protects this flow. The secret is a required field, not
 * a defence. An intercepted authorization code is still worthless without the
 * verifier, which never leaves this process.
 *
 * It comes from the environment so it stays out of the repository. Put it in
 * `apps/mail/.env.local`, which git ignores:
 *
 *     VITE_GOOGLE_CLIENT_SECRET=...
 *
 * It still ships inside the built app. There is no way around that for a
 * desktop client, and no need: see above.
 *
 * The project is `digital-habits-mail` under digitalhabits.org, separate from
 * the planner's client so the consent screen says Mail rather than redd-plan.
 * The audience is External and the publishing status is Testing, so only the
 * test users on the consent screen can sign in, and Google expires their
 * refresh tokens after seven days. Both change when the app is verified.
 */

/**
 * From the environment, like the Microsoft one, and for the same reason: each
 * person who builds this app registers their own.
 *
 * A client id is not a secret, so publishing one costs nothing directly. What
 * it costs is everything attached to it — anyone building from source would
 * sign in against this project's Google client, consuming its quota and
 * carrying its verification status and its reputation. That is not a thing to
 * share by accident.
 */
export const GOOGLE_CLIENT_ID = import.meta.env
  .VITE_GOOGLE_CLIENT_ID as string | undefined;

export const GOOGLE_CLIENT_SECRET = import.meta.env
  .VITE_GOOGLE_CLIENT_SECRET as string | undefined;

export const GOOGLE_AUTH_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";

export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * What the app asks for. `gmail.modify` covers reading, archiving, and marking
 * read. `settings.basic` is the signature. `contacts.readonly` feeds the
 * address book contact sources.
 *
 * Every one is restricted or sensitive, which is why this stays in Testing
 * until the app is verified.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://www.googleapis.com/auth/contacts.readonly",
];

/**
 * Google returns a refresh token only when it is asked, and only the first time
 * unless consent is asked for again. Without one the app would need the browser
 * on every launch.
 */
export const GOOGLE_AUTH_EXTRA = {
  access_type: "offline",
  prompt: "consent",
};

/**
 * The Microsoft client.
 *
 * Registered in Microsoft Entra as a public client under "Mobile and desktop
 * applications", which is the platform that allows a loopback redirect and
 * takes no secret. The token endpoint refuses a secret from such a client, so
 * unlike Google there is nothing here to keep out of the repository — the
 * client id ships in the binary and is meant to.
 *
 * It still comes from the environment, because each person who builds this app
 * registers their own. Put it in `apps/mail/.env.local`:
 *
 *     VITE_MICROSOFT_CLIENT_ID=...
 *
 * Without it the Connect Outlook button stays disabled and says why, rather
 * than opening a browser at an error page.
 */
export const MICROSOFT_CLIENT_ID = import.meta.env
  .VITE_MICROSOFT_CLIENT_ID as string | undefined;

/** "common" accepts personal Outlook.com accounts and work or school ones. */
export const MICROSOFT_AUTH_ENDPOINT =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";

export const MICROSOFT_TOKEN_ENDPOINT =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";

/**
 * What the app asks Microsoft for. The same set the planner uses, so a mailbox
 * behaves the same on both hosts.
 *
 * `offline_access` is what earns a refresh token. `Mail.ReadWrite` covers
 * reading, archiving, and marking read; `Contacts.Read` feeds the address book.
 */
export const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "Contacts.Read",
  "MailboxSettings.ReadWrite",
];

/**
 * Microsoft returns a refresh token only when it is asked. Asking for consent
 * every time is what makes a reconnect actually re-grant.
 *
 * One value only: "select_account consent" is refused with AADSTS90023.
 */
export const MICROSOFT_AUTH_EXTRA = {
  prompt: "consent",
};

/**
 * Why a provider cannot be connected, or null when it can.
 *
 * The interface reads this to disable the connect button, which is better than
 * letting someone sign in and fail at the exchange.
 */
export function connectConfigError(
  provider: "gmail" | "outlook"
): string | null {
  if (provider === "gmail") {
    if (!GOOGLE_CLIENT_ID) {
      return "VITE_GOOGLE_CLIENT_ID is not set in apps/mail/.env.local";
    }
    return GOOGLE_CLIENT_SECRET
      ? null
      : "VITE_GOOGLE_CLIENT_SECRET is not set in apps/mail/.env.local";
  }
  return MICROSOFT_CLIENT_ID
    ? null
    : "VITE_MICROSOFT_CLIENT_ID is not set in apps/mail/.env.local";
}
