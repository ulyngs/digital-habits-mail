/**
 * People-pile classifier for public Mail.
 *
 * Exact address matches from the user's Google and Outlook address books. No
 * CRM, and no domain matching: this is the flavor that has no team layer.
 *
 * It reads through the store, so it works on both hosts. It used to query
 * Postgres directly, which the standalone product cannot do.
 */

import { mailStore } from "@/lib/mail/store";
import { listConnectedMailAccounts } from "@/lib/mail/providers";

import type { ContactIndex, CrmRecordRef } from "@/lib/crm-contact-index";

/** Address books only. Send history is a suggestion, not a known contact. */
const ADDRESS_BOOKS = new Set(["google", "outlook"]);

export async function buildPeopleContactIndex(
  ownerId: string
): Promise<ContactIndex> {
  const index: ContactIndex = new Map();
  try {
    const accounts = await listConnectedMailAccounts(ownerId);
    if (!accounts.length) return index;
    const contacts = await mailStore().contactSources.listVisible(
      accounts.map((a) => a.email)
    );
    // The store returns Google before Outlook, so the first row for an address
    // wins and the rest are duplicates of it.
    for (const contact of contacts) {
      if (!ADDRESS_BOOKS.has(contact.source)) continue;
      const email = contact.email.trim().toLowerCase();
      if (!email || index.has(email)) continue;
      const ref: CrmRecordRef = {
        // Shape reuse for the inbox classifier; this flavor writes no CRM rows.
        source: "clients",
        recordId: `contact:${email}`,
        recordName: (contact.name || "").trim(),
        fields: {},
      };
      index.set(email, [ref]);
    }
  } catch (err) {
    console.error("[people-contacts] index failed:", err);
  }
  return index;
}
