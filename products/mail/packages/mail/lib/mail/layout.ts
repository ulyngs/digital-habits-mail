/** Where the mail thread list sits relative to the reading pane. */

export type MailListPlacement = "left" | "right" | "top" | "bottom";

export const MAIL_LIST_PLACEMENT_KEY = "redd-plan-mail-list-placement";
export const MAIL_LIST_PLACEMENT_EVENT = "redd-plan-mail-list-placement";

const ALL: MailListPlacement[] = ["left", "right", "top", "bottom"];

export function isMailListPlacement(value: unknown): value is MailListPlacement {
  return typeof value === "string" && ALL.includes(value as MailListPlacement);
}

export function getMailListPlacement(): MailListPlacement {
  if (typeof window === "undefined") return "left";
  try {
    const stored = localStorage.getItem(MAIL_LIST_PLACEMENT_KEY);
    if (isMailListPlacement(stored)) return stored;
  } catch {
    /* private mode */
  }
  return "left";
}

export function setMailListPlacement(placement: MailListPlacement): void {
  try {
    localStorage.setItem(MAIL_LIST_PLACEMENT_KEY, placement);
  } catch {
    /* private mode */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(MAIL_LIST_PLACEMENT_EVENT, { detail: placement })
    );
  }
}
