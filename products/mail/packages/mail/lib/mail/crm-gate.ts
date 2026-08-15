/**
 * The one door between mail and the team layer.
 *
 * CRM belongs to the planner. The public product has no CRM, no team roster,
 * and no planner database. Mail therefore must never import that layer at the
 * top of a module: a static import puts it in the cold import graph of every
 * build, whether or not a line of it ever runs.
 *
 * Every access goes through here, and every load is dynamic and gated on
 * `mailUsesCrmPeople()`. A build without the team layer gets null, and each
 * caller degrades on its own terms.
 *
 * Type-only imports are safe anywhere. TypeScript erases them, so they add
 * nothing to the graph.
 */

import { mailUsesCrmPeople } from "@/lib/mail/product-flavor";

import type { ContactIndex, CrmRecordRef } from "@/lib/crm-contact-index";

type CrmContactsModule = typeof import("@/lib/plan/crm-contacts");
type TeamModule = typeof import("@/lib/team");

let crmContacts: CrmContactsModule | null = null;
let teamRoster: TeamModule | null = null;

/** The CRM contacts module, or null on a build without the team layer. */
export async function loadCrmContacts(): Promise<CrmContactsModule | null> {
  if (!mailUsesCrmPeople()) return null;
  if (!crmContacts) crmContacts = await import("@/lib/plan/crm-contacts");
  return crmContacts;
}

/** The team roster module, or null on a build without the team layer. */
export async function loadTeamRoster(): Promise<TeamModule | null> {
  if (!mailUsesCrmPeople()) return null;
  if (!teamRoster) teamRoster = await import("@/lib/team");
  return teamRoster;
}

/**
 * Logo for the CRM record a contact belongs to.
 *
 * Synchronous, because it runs for every row of a list. It answers undefined
 * until something loads the CRM module, which the classifier build does first.
 */
export function crmLogoUrlIfLoaded(
  email: string,
  contacts: ContactIndex,
  domains: Map<string, CrmRecordRef[]>
): string | undefined {
  return crmContacts?.crmLogoUrlFor(email, contacts, domains);
}

/** Drop the loaded modules. Used by the cache clears. */
export function resetCrmGate(): void {
  crmContacts = null;
  teamRoster = null;
}
