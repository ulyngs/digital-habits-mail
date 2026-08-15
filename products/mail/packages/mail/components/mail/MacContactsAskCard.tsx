"use client";

/**
 * Mail's own question, asked before macOS asks its one.
 *
 * See `lib/mail/mac-contacts-ask` for why this exists rather than a direct
 * call to the system prompt. "Not now" is a real answer here and costs
 * nothing, which is what lets the offer be made at all.
 *
 * It appears once a mailbox is connected, because completing an address means
 * nothing before there is mail to write.
 */

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { mailApiJson as apiJson } from "@/lib/mail/api";
import {
  macAsksLeft,
  noteMacAsked,
  stopAskingForMacContacts,
} from "@/lib/mail/mac-contacts-ask";
import {
  macContactsAuthorization,
  macContactsRequestAccess,
} from "@/lib/native-shell";

export function MacContactsAskCard({
  /** Bump to consider asking again — a mailbox arrived, or a composer opened. */
  trigger,
  onGranted,
}: {
  trigger: number;
  onGranted: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [asking, setAsking] = React.useState(false);

  React.useEffect(() => {
    if (!trigger) return;
    let alive = true;
    void (async () => {
      if (!macAsksLeft()) return;
      // Only worth asking while macOS has no answer of its own. Once it has
      // one, the Contact sources panel is the only place that can change it.
      if ((await macContactsAuthorization()) !== "notDetermined") return;
      if (!alive) return;
      noteMacAsked();
      setOpen(true);
    })();
    return () => {
      alive = false;
    };
  }, [trigger]);

  if (!open) return null;

  const allow = async () => {
    setAsking(true);
    try {
      const status = await macContactsRequestAccess();
      if (status === "authorized" || status === "limited") {
        // macOS will not ask again, and now it does not need to.
        stopAskingForMacContacts();
        setOpen(false);
        // Read the book now. Saying yes and seeing nothing change reads as a
        // yes that did not take.
        try {
          await apiJson("/api/mail/contact-sources/sync", { method: "POST" });
        } catch (err) {
          console.warn("[mail] contact sync after allow failed:", err);
        }
        onGranted();
        return;
      }
      stopAskingForMacContacts();
      setOpen(false);
      toast.error("Allow Contacts in System Settings to turn this on later");
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-stone-900/30 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-stone-900">
          Complete addresses from Mac Contacts?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          Mail can suggest names and addresses from the Contacts app while you
          write. It reads them only. It never changes a contact, and nothing
          leaves this Mac.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={asking}
            onClick={() => {
              setOpen(false);
            }}
          >
            Not now
          </Button>
          <Button type="button" disabled={asking} onClick={() => void allow()}>
            {asking ? "Waiting for macOS…" : "Allow"}
          </Button>
        </div>
      </div>
    </div>
  );
}
