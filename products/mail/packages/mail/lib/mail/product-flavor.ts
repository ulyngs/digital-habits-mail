/**
 * Mail product flavor: internal (DH team) vs public (App Store).
 *
 * - internal — planner Postgres CRM, org LLM keys (today’s packaged team .app)
 * - public — People pile = user’s address-book contacts; no org AI credits;
 *   mail-owned data belongs in local SQLite (migration pending; do not bake
 *   planner DB_* or org LLM keys into a public binary)
 *
 * Set NEXT_PUBLIC_MAIL_PRODUCT_FLAVOR (and MAIL_PRODUCT_FLAVOR for server-only
 * tooling) to "public". Unset / "internal" keeps current CRM behaviour — the
 * planner web app never sets this and stays on CRM.
 */

export type MailProductFlavor = "internal" | "public";

function rawFlavor(): string {
  return (
    process.env.NEXT_PUBLIC_MAIL_PRODUCT_FLAVOR?.trim() ||
    process.env.MAIL_PRODUCT_FLAVOR?.trim() ||
    "internal"
  ).toLowerCase();
}

export function getMailProductFlavor(): MailProductFlavor {
  return rawFlavor() === "public" ? "public" : "internal";
}

export function isPublicMailProduct(): boolean {
  return getMailProductFlavor() === "public";
}

/** People tab matches planner CRM (internal) vs the user’s contacts (public). */
export function mailUsesCrmPeople(): boolean {
  return !isPublicMailProduct();
}

/**
 * Org-keyed LLM features (autoreply draft, CRM AI, add-to-CRM drafting).
 * Public builds must not use Digital Habits API keys; BYOK can relax this later.
 */
export function mailOrgAiAllowed(): boolean {
  return !isPublicMailProduct();
}

export function mailPeopleTabLabel(): string {
  return mailUsesCrmPeople() ? "In CRM" : "In Contacts";
}

export function mailAddToPeopleActionLabel(): string {
  return mailUsesCrmPeople() ? "Add to CRM" : "Add to Contacts";
}

/** User-facing reason when a public build hits an org-AI route. */
export const MAIL_PUBLIC_AI_DISABLED_MESSAGE =
  "AI features aren’t available in this build. (Public Mail never uses Digital Habits API credits; bring-your-own-key support comes later.)";

/** User-facing reason when CRM write APIs are hit on a public build. */
export const MAIL_PUBLIC_CRM_DISABLED_MESSAGE =
  "CRM features aren’t available in this build. People are filed from your contacts instead.";
