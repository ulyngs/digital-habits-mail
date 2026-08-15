# Digital Habits: Mail

A minimalistic email client for people who find email overwhelming. Designed
with ADHD in mind. Developed by Centre for Digital Habits (digitalhabits.org;
lead developer is Dr Ulrik Lyngs, ulrik@digitalhabits.org), in collaboration
with computer scientists and human-computer interaction researchers at the
Universities of Oxford, Maastricht, Copenhagen, and Santa Clara (see [digitalhabits.org/story](https://digitalhabits.org/story)).

> **This is a snapshot of the latest release(s), not the development history.**
>
> The app is built in our private monorepo, as part of the project management
> tools we use daily in our team. We export major releases here whole, so one commit
> is one version rather than one change.
>
> It is published so the code can be read and checked. Issues are welcome; see
> the note on pull requests at the end.

![The inbox, with one message open and nothing else asking to be read](apps/mail/docs/screenshots/inbox.png)

## Why

We run workshops on digital distraction, and the same thing comes up in every
one: students have given up on email. There is too much of it, and it works
nothing like the messaging apps they use all day. For neurodiverse students it
is harder again.

Email is not going away, so this is an attempt at a less overwhelming way to
read it:

- **Threads read like a chat.** A conversation is laid out the way a messaging
  app lays one out, instead of as nested quoted replies.
- **One-click focus.** Any part of the app can be turned into a distraction-free full
  screen: only the thread you are reading, only the message you are writing,
  only the inbox.
- **Pop a conversation out.** A thread can be popped out into an oldschool chat window that
  stays on top of whatever else you are doing: just your conversation with
  that person or those people, with nothing else from the inbox in it. Reply
  from there, and put it back when you are done.
- **Group by person, or by thread.** In
  the by-person view, every new email from someone becomes another entry under
  them rather than a new thread, the way a messaging app does it, which removes
  most of the clutter.

![A thread laid out as a chat: each message a bubble, the quoted history folded away](apps/mail/docs/screenshots/conversation.png)

<p align="center">
  <em>A conversation of fourteen messages, read the way a chat is read. The
  quoted tail every client sends is folded behind the dots.</em>
</p>

<p align="center">
  <img src="apps/mail/docs/screenshots/conversation-popout.png" alt="One conversation in its own small window, laid out as a chat" width="360">
</p>

<p align="center">
  <em>A thread popped out on its own, staying above whatever else you are working in.</em>
</p>

## How it works

A macOS app that reads Gmail and Outlook directly from the machine it runs on.
Messages are kept in a local SQLite file and refresh tokens in the macOS
keychain; no server of ours sits in between.

Extracted from a private monorepo, so the directory layout is the monorepo's.
That is deliberate: `vite.config.ts`, `build-aliases.mjs` and `tsconfig.json`
are copied unmodified, so this builds the way the released app builds.

## Building

Needs Node 20, pnpm 9, and a Rust toolchain with Xcode command line tools.

```
pnpm install
pnpm --dir apps/mail app:standalone:dev     # run it
pnpm --dir apps/mail test                   # the suites
pnpm --dir apps/mail typecheck
cd apps/mail/src-tauri && cargo test --lib  # the store, OAuth, attachments
```

You will need your own OAuth clients — see `apps/mail/.env.example`. A Google
client of type "Desktop app", and a Microsoft Entra registration with a
"Mobile and desktop applications" platform on `http://localhost`. Both are
free, and neither has to be verified to sign in to your own mailbox.

## What is here

- `apps/mail` — the desktop app: the Tauri shell in `src-tauri`, and the seams
  in `src/seams` that make the mail interface run with no server behind it
- `products/mail/packages/mail` — the mail interface and the logic under it
- `packages/shared` — code that the monorepo this came from also uses elsewhere

## Licence

None yet. All rights reserved: you may read this and fork it on GitHub, and
nothing further is granted for now.

Not accepting pull requests yet, for the same reason — without licence terms
there is nothing to say what either of us may do with a contribution.
