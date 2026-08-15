/**
 * Shared shape for compose To/Cc/Bcc autocomplete suggestions.
 * Safe for client + server (no DB imports).
 */

export type MailContactSourceKind =
  | "crm"
  | "team"
  | "google"
  | "outlook"
  | "history"
  /** The Mac address book, read by the standalone Mac app. */
  | "mac"
  /** One of the reader's connected mailboxes (email yourself). */
  | "self";

export type MailContactSuggestion = {
  email: string;
  name: string;
  /** CRM organisation / record name when source is crm. */
  recordName: string;
  source: MailContactSourceKind;
  /** Provider mailbox for google/outlook (and history rows). */
  account?: string;
  lastEmailedAt?: string | null;
};

export type MailContactSourceSummary = {
  key: string;
  kind: MailContactSourceKind | "crm";
  label: string;
  enabled: boolean;
  /** Provider token predates contacts scope — sync cannot populate this source. */
  needsReconnect?: boolean;
};

/** Short provenance label for a typeahead row badge. */
export function contactSourceBadge(
  suggestion: Pick<MailContactSuggestion, "source">
): string {
  switch (suggestion.source) {
    case "crm":
      return "CRM";
    case "team":
      return "TEAM";
    case "google":
      return "GOOGLE";
    case "outlook":
      return "OUTLOOK";
    case "history":
      return "HISTORY";
    case "mac":
      return "CONTACTS";
    case "self":
      return "YOU";
  }
}

/**
 * When the reader last emailed this address, in words. Null if it is unknown.
 *
 * Short on purpose. It shares one line with the address, and the address is
 * the part that must stay readable. The clock icon and the HISTORY badge
 * already say the row came from old mail and not from a contact source.
 */
export function historyEmailedWhen(
  iso: string | null | undefined
): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const days = Math.max(0, Math.round((Date.now() - at) / (24 * 60 * 60 * 1000)));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

/** Where to fix this contact (external for providers; in-app for CRM/history). */
export function contactSourceEditHint(
  suggestion: Pick<MailContactSuggestion, "source">
): string {
  switch (suggestion.source) {
    case "crm":
      return "Edit in CRM";
    case "team":
      return "Edit on Org tab";
    case "google":
      return "Edit in Google Contacts";
    case "outlook":
      return "Edit in Outlook";
    case "history":
      return "From people you’ve emailed";
    case "mac":
      return "Edit in Contacts";
    case "self":
      return "Your connected mailbox";
  }
}
