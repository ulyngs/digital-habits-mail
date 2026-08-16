"use client";

import { rowTime } from "@/lib/mail/date-format";
import { useMailT } from "@/lib/mail/i18n";
import type { MailDraftRow } from "@/lib/mail/types";
import { isNativeShell } from "@/lib/native-shell";
import { cn } from "@/lib/utils";

/**
 * What to call the place our own drafts are kept.
 *
 * "Here" is true and says nothing: a reader wants to know which machine has
 * it, because that is the one they have to be at to finish it. In the desktop
 * app that is the machine they are looking at, so it is named — "My Mac", and
 * "My PC" wherever the app is a Windows one.
 *
 * In the browser it stays "Here", because there it means the planner's own
 * store and not this computer. Naming the machine there would be a lie about
 * where the draft is.
 */
function localOrigin(): { label: string; where: string } {
  if (typeof navigator === "undefined" || !isNativeShell()) {
    return { label: "Here", where: "in this app" };
  }
  const hinted = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData?.platform;
  const said = `${hinted ?? ""} ${navigator.userAgent}`.toLowerCase();
  if (said.includes("mac")) return { label: "My Mac", where: "on this Mac" };
  if (said.includes("win")) return { label: "My PC", where: "on this PC" };
  return { label: "This device", where: "on this device" };
}

const ORIGIN_LABELS: Record<MailDraftRow["origin"], string> = {
  here: "Here",
  gmail: "Gmail",
  outlook: "Outlook",
};

/**
 * Ours is the odd one out, so it is the one that looks different.
 *
 * Different, not alarming. It was red, which in a mail client means a thing
 * has gone wrong — and a draft kept on this machine is a choice working as
 * intended. Teal is the colour this app uses for its own doing.
 */
const ORIGIN_STYLES: Record<MailDraftRow["origin"], string> = {
  here: "bg-teal-50 text-teal-800",
  gmail: "bg-stone-200/70 text-stone-700",
  outlook: "bg-stone-200/70 text-stone-700",
};

function DraftOriginBadge({ origin }: { origin: MailDraftRow["origin"] }) {
  const local = localOrigin();
  const label = origin === "here" ? local.label : ORIGIN_LABELS[origin];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none",
        ORIGIN_STYLES[origin]
      )}
      title={
        origin === "here"
          ? `Kept ${local.where} only — it is not in Gmail or Outlook`
          : `Kept in ${ORIGIN_LABELS[origin]}`
      }
    >
      {label}
    </span>
  );
}

export function MailDraftsList({
  rows,
  loading,
  onOpen,
}: {
  rows: MailDraftRow[];
  loading: boolean;
  onOpen: (row: MailDraftRow) => void;
}) {
  const t = useMailT();
  if (!rows.length) {
    return (
      <p className="px-5 py-8 text-sm text-[var(--mail-chrome-muted)]">
        {loading ? t("lookingForDrafts") : t("nothingUnsent")}
      </p>
    );
  }

  return (
    <ul className="py-1">
      {rows.map((row) => {
        const recipients = row.to.join(", ");
        // A reply draft has no subject; say who it is to instead.
        const title =
          row.subject || (recipients ? `To ${recipients}` : "(no recipient)");
        return (
          <li key={`${row.origin}:${row.id}`}>
            <button
              type="button"
              onClick={() => onOpen(row)}
              className="flex w-full flex-col gap-0.5 px-5 py-2 text-left hover:bg-[var(--mail-chrome-hover)]"
            >
              <span className="flex w-full items-center gap-2">
                <DraftOriginBadge origin={row.origin} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--mail-chrome-fg)]">
                  {title}
                </span>
                <span className="shrink-0 text-xs text-[var(--mail-chrome-faint)]">
                  {row.updatedAt ? rowTime(row.updatedAt) : ""}
                </span>
              </span>
              {row.subject && recipients ? (
                <span className="truncate text-xs text-[var(--mail-chrome-muted)]">
                  To {recipients}
                </span>
              ) : null}
              {row.snippet ? (
                <span className="truncate text-xs text-[var(--mail-chrome-faint)]">
                  {row.snippet}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
