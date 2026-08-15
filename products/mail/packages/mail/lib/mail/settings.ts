/**
 * Signature settings.
 *
 * The rules live here: the defaults, the JSON shape, and the fallback to the
 * older shared signature. The store moves strings only. See
 * `@/lib/mail/store/types`.
 */

import { mailStore } from "@/lib/mail/store";

const SIGNATURE_KEY = "mail_signature";

export type MailSignatureSettings = {
  /** Rich HTML; legacy signatures are plain text with [text](url) links. */
  signature: string;
  includeOnNew: boolean;
  includeOnReplies: boolean;
};

const SIGNATURE_DEFAULTS = {
  // The common convention: sign fresh mail, skip the boilerplate on replies.
  includeOnNew: true,
  includeOnReplies: false,
};

function signatureKey(account: string): string {
  return `${SIGNATURE_KEY}:${account.trim().toLowerCase()}`;
}

/** Pre-per-account signature, kept as the fallback for unmigrated accounts. */
async function getLegacySignature(): Promise<string> {
  return (await mailStore().settings.get(SIGNATURE_KEY)) ?? "";
}

export async function getMailSignatureSettings(
  account: string
): Promise<MailSignatureSettings> {
  const raw = await mailStore().settings.get(signatureKey(account));
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<MailSignatureSettings>;
      return {
        signature: parsed.signature ?? "",
        includeOnNew: parsed.includeOnNew ?? SIGNATURE_DEFAULTS.includeOnNew,
        includeOnReplies:
          parsed.includeOnReplies ?? SIGNATURE_DEFAULTS.includeOnReplies,
      };
    } catch {
      // Fall through to the legacy shared signature.
    }
  }
  return { signature: await getLegacySignature(), ...SIGNATURE_DEFAULTS };
}

export async function setMailSignatureSettings(
  account: string,
  settings: MailSignatureSettings
): Promise<void> {
  const value = JSON.stringify({
    signature: settings.signature.trim(),
    includeOnNew: settings.includeOnNew,
    includeOnReplies: settings.includeOnReplies,
  });
  await mailStore().settings.set(signatureKey(account), value);
}
