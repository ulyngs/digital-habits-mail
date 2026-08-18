"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  SettingsDialog,
  settingsPrimaryButton,
  settingsSecondaryButton,
} from "@/components/mail/settings-ui";
import { mailApiJson } from "@/lib/mail/api";
import { mailUsesCrmPeople } from "@/lib/mail/product-flavor";
import { showPlannerRecord } from "@/lib/native-shell";
import { mailSay, useMailT } from "@/lib/mail/i18n";
import { cn } from "@/lib/utils";

/**
 * The AI's proposals for a thread, for the reader to keep, change or drop.
 *
 * The model proposed calls to the same tools an agent has — a dated note,
 * a status move, a next step, a new contact, a new record, a meeting — and
 * nothing has happened yet. Each is a row: a checkbox, the record it is
 * for, and the fields, all editable. Apply runs the checked ones through
 * the planner, audited as the reader; a meeting sends real invitations, so
 * it starts unchecked.
 */

export type CrmCandidate = {
  source: string;
  recordId: string;
  recordName: string;
  via: "participant" | "body" | "domain" | "model";
  match: string;
  confidence: "high" | "medium" | "low";
  logoUrl?: string;
};

export type CrmProposal = {
  id: string;
  tool:
    | "log_interaction"
    | "advance_status"
    | "set_next_step"
    | "add_contact"
    | "set_logo"
    | "create_record"
    | "update_record"
    | "create_meeting";
  input: Record<string, unknown>;
  why: string;
};

export type CrmProposeResult = {
  candidates: CrmCandidate[];
  proposals: CrmProposal[];
  statusOptions: Record<string, string[]>;
  /** Every organisation the CRM knows, when a proposal names one. */
  organisations?: { name: string; logo?: string }[];
  dropped: { tool: string; error: string }[];
  note?: string;
  error?: string;
  debug?: {
    messages: { own: boolean; from: string; chars: number; sentToModel: number }[];
    candidates: number;
    modelAnswer: string;
  };
};

type Row = { proposal: CrmProposal; checked: boolean; input: Record<string, unknown> };

const TOOL_LABEL: Record<CrmProposal["tool"], string> = {
  log_interaction: "Note",
  advance_status: "Status",
  set_next_step: "Next step",
  add_contact: "Add contact",
  set_logo: "Logo",
  create_record: "New record",
  update_record: "Fill in",
  create_meeting: "Meeting invitation",
};

/**
 * An image URL with the image beside it, so the reader sees what the logo
 * will be before it is stored. Clearing the URL is "no logo".
 */
function LogoField({ url, onChange }: { url: string; onChange: (url: string) => void }) {
  const t = useMailT();
  const [broken, setBroken] = React.useState(false);
  const [site, setSite] = React.useState("");
  const [looking, setLooking] = React.useState(false);
  const [lookNote, setLookNote] = React.useState<string | null>(null);
  React.useEffect(() => setBroken(false), [url]);

  // "Not this one — look on cocoda.ch": the planner looks for a logo on
  // that site and the URL here becomes it. Nothing is stored yet.
  const look = async () => {
    const wanted = site.trim();
    if (!wanted || looking) return;
    setLooking(true);
    setLookNote(null);
    try {
      const answer = await mailApiJson<{ imageUrl: string | null; note?: string }>(
        "/api/mail/crm-find-logo",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site: wanted }) }
      );
      if (answer.imageUrl) {
        onChange(answer.imageUrl);
        setSite("");
      } else {
        setLookNote(answer.note ?? `Nothing found on ${wanted}.`);
      }
    } catch (err) {
      setLookNote(err instanceof Error ? err.message : "Couldn't look.");
    } finally {
      setLooking(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-stone-200 bg-white">
          {url && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              className="max-h-full max-w-full object-contain"
              onError={() => setBroken(true)}
            />
          ) : (
            <span className="text-[10px] text-stone-400">{url ? "?" : "none"}</span>
          )}
        </span>
        <input
          className={inputClass}
          placeholder={t("imageUrl")}
          value={url}
          onChange={(e) => onChange(e.target.value)}
        />
        {url ? (
          <button
            type="button"
            className="px-1 text-stone-400 hover:text-stone-700"
            aria-label={t("noLogo")}
            onClick={() => onChange("")}
          >
            ×
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-2 pl-12 text-xs text-stone-500">
        <span className="shrink-0">{t("wrongOneLookOn")}</span>
        <input
          className={cn(inputClass, "h-7 text-xs")}
          placeholder="the organisation's website, e.g. cocoda.ch"
          value={site}
          onChange={(e) => setSite(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void look();
            }
          }}
        />
        <button
          type="button"
          className="shrink-0 rounded border border-stone-200 px-2 py-0.5 text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          disabled={!site.trim() || looking}
          onClick={() => void look()}
        >
          {looking ? "Looking…" : "Look"}
        </button>
      </div>
      {lookNote ? <div className="pl-12 text-xs text-stone-500">{lookNote}</div> : null}
    </div>
  );
}

/** How a candidate was found, said with what found it: "christian@… in the thread". */
function viaLabel(c: CrmCandidate): string {
  switch (c.via) {
    case "participant":
      return `${c.match} in the thread`;
    case "body":
      return `${c.match} in the text`;
    case "domain":
      return `${c.match} by its domain`;
    case "model":
      return `the AI read “${c.match}”`;
  }
}

/** A record as a chip: logo or initial, name, table. Same look as the planner's pickers. */
function RecordChip({ candidate, name, source }: { candidate?: CrmCandidate; name: string; source: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {candidate?.logoUrl ? (
        <img
          src={candidate.logoUrl}
          alt=""
          className="h-5 w-5 shrink-0 rounded object-contain"
          draggable={false}
        />
      ) : (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-stone-200 text-[10px] font-medium text-stone-600">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 truncate font-medium text-stone-900">{name}</span>
      <span className="shrink-0 text-xs text-stone-400">{source}</span>
    </span>
  );
}

/**
 * An organisation, picked from the ones we have or typed as a new one.
 *
 * The column is plain text — a facilitator's Organisation is a name, and
 * the crest beside it in the table is the client record's, found by that
 * name. So the box has to take anything, and it has to offer the names we
 * already hold, or the same organisation ends up in the CRM twice under
 * two spellings.
 *
 * The list appears while it is being typed in, filtered by what is there,
 * and a press outside puts it away. Nothing is chosen for the reader: what
 * they typed stands until they press one.
 */
function OrganisationField({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { name: string; logo?: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const boxRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", away);
    return () => window.removeEventListener("mousedown", away);
  }, [open]);

  const needle = value.trim().toLowerCase();
  const shown = (
    needle ? options.filter((o) => o.name.toLowerCase().includes(needle)) : options
  ).slice(0, 8);
  const exact = options.some((o) => o.name.toLowerCase() === needle);

  return (
    <div ref={boxRef} className="relative">
      <input
        className={inputClass}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open && shown.length ? (
        <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-md border border-stone-200 bg-white py-1 shadow-lg">
          {shown.map((o) => (
            <li key={o.name}>
              <button
                type="button"
                className="mail-menu-pick flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-stone-800"
                onClick={() => {
                  onChange(o.name);
                  setOpen(false);
                }}
              >
                {o.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={o.logo}
                    alt=""
                    className="h-4 w-4 shrink-0 rounded-sm object-contain"
                  />
                ) : (
                  <span className="h-4 w-4 shrink-0" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
              </button>
            </li>
          ))}
          {needle && !exact ? (
            <li className="px-2 py-1.5 text-xs text-stone-500">
              {`Or keep “${value.trim()}” as a new one.`}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";

/** The column that names an organisation, whichever table it is on. */
function namesAnOrganisation(column: string): boolean {
  return column.trim().toLowerCase() === "organisation";
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export function CrmProposalDialog({
  loading,
  stage,
  result,
  attachmentCount = 0,
  attachmentsIncluded = false,
  onIncludeAttachments,
  onClose,
  onApplied,
}: {
  loading: boolean;
  /** What is happening right now, when it is not the model: "Reading x.pdf…". */
  stage?: string;
  result: CrmProposeResult | null;
  /** PDFs in the thread the AI could read, if the reader says so. */
  attachmentCount?: number;
  /** True when this result already had them. */
  attachmentsIncluded?: boolean;
  /** Run again with the attachments' text. */
  onIncludeAttachments?: () => void;
  onClose: () => void;
  /** Called after Apply, with how many proposals went through. */
  onApplied: (applied: number) => void;
}) {
  const t = useMailT();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [applying, setApplying] = React.useState(false);

  // How long the model has been at it. A number that moves is the
  // difference between "working" and "stuck".
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [loading]);

  React.useEffect(() => {
    setRows(
      (result?.proposals ?? []).map((proposal) => ({
        proposal,
        // A meeting sends mail to other people. It waits for a deliberate tick.
        checked: proposal.tool !== "create_meeting",
        input: { ...proposal.input },
      }))
    );
  }, [result]);

  const setInput = (id: string, patch: Record<string, unknown>) =>
    setRows((prev) =>
      prev.map((r) => (r.proposal.id === id ? { ...r, input: { ...r.input, ...patch } } : r))
    );
  const setChecked = (id: string, checked: boolean) =>
    setRows((prev) => prev.map((r) => (r.proposal.id === id ? { ...r, checked } : r)));

  const candidates = result?.candidates ?? [];
  /** Sent only when a proposal names an organisation — see the picker. */
  const organisations = result?.organisations ?? [];
  const recordName = (id: unknown) =>
    candidates.find((c) => c.recordId === id)?.recordName ?? "(record)";

  const apply = async () => {
    const chosen = rows.filter((r) => r.checked);
    if (!chosen.length) return;
    setApplying(true);
    try {
      const json = await mailApiJson<{
        results: { id: string; tool: string; ok: boolean; error?: string }[];
      }>("/api/mail/crm-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposals: chosen.map((r) => ({
            id: r.proposal.id,
            tool: r.proposal.tool,
            input: r.input,
          })),
        }),
      });
      const failed = json.results.filter((r) => !r.ok);
      const applied = json.results.length - failed.length;
      if (applied) {
        // Every record the applied changes touched, by table: the ones the
        // proposals named and the ones a create made. View opens the table
        // with the most of them, showing those rows.
        const okIds = new Set(json.results.filter((r) => r.ok).map((r) => r.id));
        const bySource = new Map<string, string[]>();
        const touch = (source: string, recordId: string) => {
          if (!source || !recordId) return;
          const ids = bySource.get(source) ?? [];
          if (!ids.includes(recordId)) ids.push(recordId);
          bySource.set(source, ids);
        };
        for (const r of chosen) {
          if (okIds.has(r.proposal.id) && "recordId" in r.input) {
            touch(str(r.input.source), str(r.input.recordId));
          }
        }
        for (const r of json.results) {
          if (!r.ok || r.tool !== "create_record") continue;
          const made = (r as { result?: { record?: { source?: string; id?: string } } }).result?.record;
          if (made?.id) touch(str(made.source), made.id);
        }
        const [best] = [...bySource.entries()].sort((a, b) => b[1].length - a[1].length);
        const target = best ? { source: best[0], recordId: best[1].join(",") } : null;
        const others = bySource.size > 1 ? bySource.size - 1 : 0;
        toast.success(applied === 1 ? "CRM updated" : `CRM updated: ${applied} changes`, {
          ...(others ? { description: `Also in ${others} other table${others > 1 ? "s" : ""}.` } : {}),
          ...(target
            ? {
                action: {
                  label: "View",
                  onClick: () => {
                    void showPlannerRecord(target).then((shown) => {
                      if (!shown) toast.info(mailSay("openPlannerToSee"));
                    });
                  },
                },
              }
            : {}),
        });
      }
      for (const f of failed) {
        toast.error(`${TOOL_LABEL[f.tool as CrmProposal["tool"]] ?? f.tool}: ${f.error ?? "failed"}`);
      }
      onApplied(applied);
      if (!failed.length) onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't apply");
    } finally {
      setApplying(false);
    }
  };

  const recordPicker = (row: Row) => {
    if (!("recordId" in row.input)) return null;
    // One candidate: the subtitle names it, and every row is about it.
    // Saying it again on each row is noise.
    if (candidates.length < 2 && candidates[0]?.recordId === row.input.recordId) return null;
    const current = candidates.find((c) => c.recordId === row.input.recordId);
    const chip = (
      <RecordChip
        candidate={current}
        name={current?.recordName ?? recordName(row.input.recordId)}
        source={str(row.input.source)}
      />
    );
    // One candidate: nothing to pick. More: the chip is the trigger of a
    // native select laid over it, so it looks like the planner's pickers and
    // behaves like a menu.
    if (candidates.length < 2) return chip;
    return (
      <span className="relative inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 hover:bg-stone-100">
        {chip}
        <span aria-hidden className="text-stone-400">⇅</span>
        <select
          aria-label={t("record")}
          className="absolute inset-0 cursor-pointer opacity-0"
          value={str(row.input.recordId)}
          onChange={(e) => {
            const c = candidates.find((x) => x.recordId === e.target.value);
            setInput(row.proposal.id, {
              recordId: e.target.value,
              ...(c ? { source: c.source } : {}),
            });
          }}
        >
          {candidates.map((c) => (
            <option key={c.recordId} value={c.recordId}>
              {c.recordName} ({c.source})
            </option>
          ))}
        </select>
      </span>
    );
  };

  const fields = (row: Row) => {
    const { tool } = row.proposal;
    const id = row.proposal.id;
    switch (tool) {
      case "log_interaction":
        return (
          <textarea
            className={cn(inputClass, "min-h-[3.5rem]")}
            value={str(row.input.summary)}
            onChange={(e) => setInput(id, { summary: e.target.value })}
          />
        );
      case "set_next_step":
        return (
          <textarea
            className={cn(inputClass, "min-h-[3rem]")}
            value={str(row.input.nextStep)}
            onChange={(e) => setInput(id, { nextStep: e.target.value })}
          />
        );
      case "advance_status": {
        const options = result?.statusOptions[str(row.input.source)] ?? [];
        return (
          <select
            className={cn(inputClass, "w-auto")}
            value={str(row.input.toStatus)}
            onChange={(e) => setInput(id, { toStatus: e.target.value })}
          >
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {!options.includes(str(row.input.toStatus)) ? (
              <option value={str(row.input.toStatus)}>{str(row.input.toStatus)}</option>
            ) : null}
          </select>
        );
      }
      case "add_contact":
        return (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <input
              className={inputClass}
              placeholder={t("fieldName")}
              value={str(row.input.name)}
              onChange={(e) => setInput(id, { name: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder={t("fieldEmail")}
              value={str(row.input.email)}
              onChange={(e) => setInput(id, { email: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder={t("fieldTitle")}
              value={str(row.input.title)}
              onChange={(e) => setInput(id, { title: e.target.value })}
            />
          </div>
        );
      case "update_record": {
        // The same shape as a create, minus the parts a create alone can
        // set. Everything it would write is on show and editable: this is
        // the one proposal that can go over something already there, and
        // the reader is the one who decides that it should.
        const extra =
          row.input.fields && typeof row.input.fields === "object"
            ? Object.entries(row.input.fields as Record<string, unknown>)
            : [];
        const setField = (key: string, value: string) =>
          setInput(id, { fields: { ...(row.input.fields as object), [key]: value } });
        return (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {row.input.name !== undefined ? (
              <input
                className={inputClass}
                placeholder={t("fieldName")}
                value={str(row.input.name)}
                onChange={(e) => setInput(id, { name: e.target.value })}
              />
            ) : null}
            {extra.map(([key, value]) =>
              namesAnOrganisation(key) && organisations.length ? (
                <OrganisationField
                  key={key}
                  value={str(value)}
                  options={organisations}
                  onChange={(next) => setField(key, next)}
                />
              ) : (
                <input
                  key={key}
                  className={inputClass}
                  placeholder={key}
                  value={str(value)}
                  onChange={(e) => setField(key, e.target.value)}
                />
              )
            )}
          </div>
        );
      }
      case "set_logo":
        return (
          <LogoField
            url={str(row.input.imageUrl)}
            onChange={(url) => setInput(id, { imageUrl: url })}
          />
        );
      case "create_record": {
        // Everything the create writes is on show: a hidden field is a
        // write the reader never saw.
        const source = str(row.input.source);
        const options = result?.statusOptions[source] ?? [];
        const status = str(row.input.status);
        const contacts = Array.isArray(row.input.contacts)
          ? (row.input.contacts as { email?: string; name?: string; title?: string }[])
          : [];
        const extra =
          row.input.fields && typeof row.input.fields === "object"
            ? Object.entries(row.input.fields as Record<string, unknown>)
            : [];
        const setContact = (i: number, patch: Record<string, string>) => {
          const next = contacts.map((c, j) => (j === i ? { ...c, ...patch } : c));
          setInput(id, { contacts: next });
        };
        const removeContact = (i: number) =>
          setInput(id, { contacts: contacts.filter((_, j) => j !== i) });
        const setField = (key: string, value: string) =>
          setInput(id, { fields: { ...(row.input.fields as object), [key]: value } });
        return (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <input
              className={inputClass}
              placeholder={t("fieldName")}
              value={str(row.input.name)}
              onChange={(e) => setInput(id, { name: e.target.value })}
            />
            <select
              className={inputClass}
              value={source}
              onChange={(e) => setInput(id, { source: e.target.value })}
            >
              {["clients", "collaborations", "facilitators"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <span className="w-20 shrink-0">{t("status")}</span>
              <select
                className={cn(inputClass, "w-auto")}
                value={status}
                onChange={(e) => setInput(id, { status: e.target.value || undefined })}
              >
                <option value="">{t("noneDash")}</option>
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
                {status && !options.includes(status) ? <option value={status}>{status}</option> : null}
              </select>
            </label>
            {source !== "facilitators" ? (
              <label className="flex items-center gap-2 text-sm text-stone-600">
                <span className="w-20 shrink-0">{t("nextStep")}</span>
                <input
                  className={inputClass}
                  value={str(row.input.nextStep)}
                  onChange={(e) => setInput(id, { nextStep: e.target.value })}
                />
              </label>
            ) : null}
            {extra.map(([key, value]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-stone-600">
                <span className="w-20 shrink-0 truncate" title={key}>
                  {key}
                </span>
                {namesAnOrganisation(key) && organisations.length ? (
                  <span className="min-w-0 flex-1">
                    <OrganisationField
                      value={str(value)}
                      options={organisations}
                      onChange={(next) => setField(key, next)}
                    />
                  </span>
                ) : (
                  <input
                    className={inputClass}
                    value={str(value)}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                )}
              </label>
            ))}
            {row.input.note !== undefined ? (
              <textarea
                className={cn(inputClass, "sm:col-span-2")}
                value={str(row.input.note)}
                onChange={(e) => setInput(id, { note: e.target.value })}
              />
            ) : null}
            {row.input.logoUrl !== undefined ? (
              <div className="sm:col-span-2">
                <LogoField
                  url={str(row.input.logoUrl)}
                  onChange={(url) => setInput(id, { logoUrl: url || undefined })}
                />
              </div>
            ) : null}
            {contacts.length ? (
              <div className="sm:col-span-2 space-y-1">
                <div className="text-xs text-stone-500">{t("peopleOnRecord")}</div>
                {contacts.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5">
                    <input
                      className={inputClass}
                      placeholder={t("fieldName")}
                      value={str(c.name)}
                      onChange={(e) => setContact(i, { name: e.target.value })}
                    />
                    <input
                      className={inputClass}
                      placeholder={t("fieldEmail")}
                      value={str(c.email)}
                      onChange={(e) => setContact(i, { email: e.target.value })}
                    />
                    <input
                      className={inputClass}
                      placeholder={t("fieldTitle")}
                      value={str(c.title)}
                      onChange={(e) => setContact(i, { title: e.target.value })}
                    />
                    <button
                      type="button"
                      className="px-1 text-stone-400 hover:text-stone-700"
                      aria-label={t("removeThisPerson")}
                      onClick={() => removeContact(i)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      }
      case "create_meeting":
        return (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <input
              className={cn(inputClass, "sm:col-span-2")}
              placeholder={t("fieldTitle")}
              value={str(row.input.title)}
              onChange={(e) => setInput(id, { title: e.target.value })}
            />
            <input
              className={inputClass}
              type="datetime-local"
              value={str(row.input.start).slice(0, 16)}
              onChange={(e) => setInput(id, { start: e.target.value })}
            />
            <input
              className={inputClass}
              type="number"
              min={5}
              step={5}
              value={Number(row.input.durationMinutes ?? 30)}
              onChange={(e) => setInput(id, { durationMinutes: Number(e.target.value) })}
            />
            <input
              className={cn(inputClass, "sm:col-span-2")}
              placeholder={t("attendeesCommaSeparated")}
              value={
                Array.isArray(row.input.attendeeEmails)
                  ? (row.input.attendeeEmails as string[]).join(", ")
                  : ""
              }
              onChange={(e) =>
                setInput(id, {
                  attendeeEmails: e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                })
              }
            />
            <p className="text-xs text-amber-800 sm:col-span-2">
              {t("invitationOnApply")}
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  const chosen = rows.filter((r) => r.checked).length;

  // The team layer only. The public app never mounts this; if it did, it
  // would show nothing rather than offer a CRM it does not have.
  if (!mailUsesCrmPeople()) return null;

  return (
    <SettingsDialog
      title={t("updateCrmFromThread")}
      subtitle={
        loading && !result
          ? "Reading the thread and matching records…"
          : result?.error
            ? result.error
            : candidates.length
              ? (
                  <span className="flex flex-col gap-1">
                    {candidates.slice(0, 3).map((c) => (
                      <span key={c.recordId} className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                        <RecordChip candidate={c} name={c.recordName} source={c.source} />
                        <span className="text-stone-500">— {viaLabel(c)}</span>
                      </span>
                    ))}
                  </span>
                )
              : "No CRM record matches this thread."
      }
      onClose={onClose}
      width="w-[640px]"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className={settingsSecondaryButton} onClick={onClose}>
            {rows.length ? "Skip" : "Close"}
          </button>
          {rows.length ? (
            <button
              type="button"
              className={settingsPrimaryButton}
              disabled={applying || !chosen}
              onClick={() => void apply()}
            >
              {applying ? "Applying…" : chosen === 1 ? "Apply" : `Apply ${chosen}`}
            </button>
          ) : null}
        </div>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-2 py-6 text-sm text-stone-500">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {stage
              ? stage
              : result
                ? `Asking the AI what changed… ${elapsed}s`
                : "Reading the thread and matching records…"}
          </div>
          {result?.candidates.length ? (
            <p className="text-xs text-stone-400">
              Matched {result.candidates.length === 1 ? "one record" : `${result.candidates.length} records`}
              ; the model reads the thread against{" "}
              {result.candidates.length === 1 ? "its" : "their"} status and notes and proposes
              changes.
            </p>
          ) : null}
        </div>
      ) : !rows.length ? (
        <div className="py-4 text-sm text-stone-600">
          <p>{result?.note ?? result?.error ?? mailSay("nothingToPropose")}</p>
          {result?.debug ? (
            <details className="mt-3 text-xs text-stone-400">
              <summary className="cursor-pointer">{t("whatTheAiSaw")}</summary>
              <p className="mt-1">
                {result.debug.messages.length} message
                {result.debug.messages.length === 1 ? "" : "s"} ·{" "}
                {result.debug.messages
                  .map((m) => `${m.own ? "us" : m.from}: ${m.sentToModel}/${m.chars} chars`)
                  .join(" · ")}{" "}
                · {result.debug.candidates} candidate record
                {result.debug.candidates === 1 ? "" : "s"}
              </p>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-2">
                {result.debug.modelAnswer}
              </pre>
            </details>
          ) : null}
        </div>
      ) : (
        <ul className="-mx-1 divide-y divide-stone-100">
          {rows.map((row) => (
            <li
              key={row.proposal.id}
              className={cn("px-1 py-3", !row.checked && "opacity-60")}
            >
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 rounded border-stone-300 accent-teal-700"
                  checked={row.checked}
                  onChange={(e) => setChecked(row.proposal.id, e.target.checked)}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-stone-900">
                      {TOOL_LABEL[row.proposal.tool]}
                    </span>
                    {recordPicker(row)}
                  </span>
                  {fields(row)}
                  {row.proposal.why ? (
                    <span className="text-xs text-stone-500">{row.proposal.why}</span>
                  ) : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {!loading && attachmentCount > 0 && onIncludeAttachments ? (
        <p className="mt-3 text-xs text-stone-500">
          {attachmentsIncluded ? (
            <>Read with the {attachmentCount === 1 ? "attached PDF" : `${attachmentCount} attached PDFs`}.</>
          ) : (
            <>
              The thread has {attachmentCount === 1 ? "a PDF" : `${attachmentCount} PDFs`}.{" "}
              <button
                type="button"
                className="font-medium text-teal-700 underline-offset-2 hover:underline"
                onClick={onIncludeAttachments}
              >
                Read {attachmentCount === 1 ? "it" : "them"} too and ask again
              </button>{" "}
              — the text goes to the AI as background.
            </>
          )}
        </p>
      ) : null}
      {result?.dropped.length ? (
        <p className="mt-3 text-xs text-stone-400">
          {result.dropped.length} suggestion{result.dropped.length === 1 ? "" : "s"} did not pass
          the checks and {result.dropped.length === 1 ? "was" : "were"} left out.
        </p>
      ) : null}
    </SettingsDialog>
  );
}
