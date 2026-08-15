# Security and privacy

Digital Habits: Mail is a Mac app that reads your mail directly from Gmail or
Outlook. This page says what it asks for, where it keeps things, and what
leaves the machine — with the file to read for each, so none of it has to be
taken on trust.

It describes the **standalone app**, the one distributed as a `.dmg`.

## What leaves your machine

Your mail goes between your Mac and your provider, and nowhere else. There is
no server of ours in the path — nothing to run, nothing to breach, and no
copy of your mail anywhere we could read it.

The app talks to exactly two hosts:

| Host | What for | Where |
| --- | --- | --- |
| `gmail.googleapis.com` | Gmail | [`lib/gmail/api.ts`](/products/mail/packages/mail/lib/gmail/api.ts) |
| `graph.microsoft.com` | Outlook | [`lib/outlook/api.ts`](/products/mail/packages/mail/lib/outlook/api.ts) |

Sign-in additionally contacts Google's and Microsoft's own OAuth endpoints —
see [`oauth-config.ts`](/apps/mail/src/oauth-config.ts).

**There is no analytics, no crash reporting and no telemetry.** Nothing counts
what you do or reports it anywhere. You can check this: there is no analytics
SDK in the dependency list, and nothing in `apps/mail/src` or
`apps/mail/src-tauri/src` contacts any host but the two above.

## What it asks your provider for

### Google

| Scope | Why |
| --- | --- |
| `gmail.modify` | Read mail, and mark it read, archived, filed or deleted |
| `gmail.send` | Send the mail you write |
| `gmail.settings.basic` | Read and set your out-of-office reply, and read the name Gmail puts on your mail |
| `contacts.readonly` | Fill the address book, so a name completes to an address |

Not requested: `gmail.readonly` is too narrow to file or send; full-account or
Drive scopes are not asked for at all.

### Microsoft

`User.Read`, `Mail.ReadWrite`, `Mail.Send`, `Contacts.Read`,
`MailboxSettings.ReadWrite`, plus `openid`, `profile`, `email` and
`offline_access` for sign-in and refresh.

Both lists are in [`oauth-config.ts`](/apps/mail/src/oauth-config.ts), and that
is the only place they are set.

## Where things are kept

**Refresh tokens go in the macOS keychain**, not in the app's own files, under
the service `org.digitalhabits.mail` — see `KeychainVault` in
[`db.rs`](/products/mail/crates/mail-native/src/db.rs). A copy of the app's database is
worth nothing to anyone without the keychain as well.

**Mail is cached in a local SQLite file**, `mail.sqlite3`, in the app's data
directory (`database_path` in the same file). It holds what you have browsed,
searched or opened. Deleting the app's data directory removes it.

**Settings stay on the machine** — in `localStorage` for the interface, and in
the SQLite file for accounts.

## How sign-in works

The app opens your browser, you sign in with Google or Microsoft, and the
answer comes back to a loopback listener on `127.0.0.1` — see
[`oauth.rs`](/products/mail/crates/mail-native/src/oauth.rs) and
[`connect-mailbox.ts`](/apps/mail/src/connect-mailbox.ts).

**You never type your mail password into this app.** It never sees one.

The flow uses PKCE. The Google client secret is compiled into the app, which
Google documents as not confidential for an installed app — PKCE is the
protection, not the secret.

## Reading a message safely

HTML mail is rendered in a sandboxed iframe, so a sender's CSS and scripts
cannot reach the app around it — see
[`EmailHtmlView.tsx`](/products/mail/packages/mail/components/mail/EmailHtmlView.tsx).

**Remote images are blocked until you allow them**, per sender. An image
fetched from a sender's server tells them you opened their mail and roughly
where you are; blocking by default means opening a message tells the sender
nothing. Pictures carried inside the message are shown, because fetching those
tells nobody anything.

## Checking the app you install

Every release is signed with an Apple Developer ID and notarised by Apple —
both the app and the disk image, because Gatekeeper judges the image you open.
To check a copy before installing it:

```bash
spctl -a -vvv -t install "Digital Habits Mail_<version>_universal.dmg"
```

`accepted` and `source=Notarized Developer ID` mean it is the build we signed.

Each release also publishes the disk image's SHA-256 next to it, so you can
confirm the file you downloaded is the file we built:

```bash
shasum -a 256 "Digital Habits Mail_<version>_universal.dmg"
```

The version the app is running is in its **Help** menu, so a report can say
which build it came from.

## This repository

The code here is a snapshot of each release, exported whole from the private
repository the app is developed in. One commit is one version. Releases are
tagged, so `git diff v0.2.2 v0.2.3` shows everything that changed between two
builds.

## Reporting something

Please open an issue: <https://github.com/ulyngs/digital-habits-mail/issues>.
For anything you would rather not post in public, write to
team@digitalhabits.org.
