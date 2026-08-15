/**
 * The shared look of the icon-only actions above a thread.
 *
 * A string rather than a component: these sit on buttons that differ in
 * everything except how they look.
 */

/** Shared look for the icon-only actions above a thread. */
export const THREAD_ACTION_CLASS =
  // shrink-0: these sit in a row that runs out of width before it runs out
  // of buttons, and a squashed circle is not a smaller button, it is a
  // broken one. What does not fit goes behind the ellipsis instead.
  "h-9 w-9 shrink-0 rounded-full text-[var(--mail-thread-muted)] hover:bg-[var(--mail-chrome-hover)] hover:text-[var(--mail-thread-fg)] [&_svg]:size-[19px]";
export const THREAD_ACTION_ACTIVE_CLASS =
  "bg-[var(--mail-chrome-selected)] text-[var(--mail-thread-fg)]";
