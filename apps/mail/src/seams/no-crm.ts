/**
 * The team layer, which this product does not have.
 *
 * `crm-gate.ts` names the planner CRM modules inside dynamic imports. It checks
 * the product flavor before it loads them, so a public build never calls these.
 * The bundler still has to resolve the names, and this is what it resolves to.
 *
 * Every export throws. Reaching one means the flavor check was skipped, and a
 * loud failure beats a silent empty contact list.
 *
 * **The signatures must match the real modules, even though the bodies throw.**
 * This module stands in for them at build time, so a mismatch is a crash that
 * the typecheck would otherwise not see: the planner is checked against the
 * real ones, and only this build is checked against these.
 */

import type { ContactIndex, CrmRecordRef } from "@/lib/crm-contact-index";

function unavailable(name: string): never {
  throw new Error(`${name} is planner CRM, which this build does not have`);
}

/** What the mail core reads off a suggestion. The real ones carry more. */
type RecipientSuggestion = {
  email: string;
  name: string;
  recordName: string;
};

export function buildContactIndex(): Promise<ContactIndex> {
  unavailable("buildContactIndex");
}

export function buildContactDomainIndex(): Map<string, CrmRecordRef[]> {
  unavailable("buildContactDomainIndex");
}

export function crmLogoUrlFor(
  _email: string,
  _contacts: ContactIndex,
  _domainContacts?: Map<string, CrmRecordRef[]>
): string | undefined {
  unavailable("crmLogoUrlFor");
}

export function listCrmRecipientSuggestions(): Promise<RecipientSuggestion[]> {
  unavailable("listCrmRecipientSuggestions");
}

export function listTeamRecipientSuggestions(): Promise<RecipientSuggestion[]> {
  unavailable("listTeamRecipientSuggestions");
}

export function countCrmContactEmails(): Promise<number> {
  unavailable("countCrmContactEmails");
}
