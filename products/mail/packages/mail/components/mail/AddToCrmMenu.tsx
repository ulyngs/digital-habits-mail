"use client";

/**
 * Filing a sender into the CRM, from the thread view.
 *
 * Team layer only. A public build has no CRM, so the flavor check hides this
 * and the paths it calls are the ones the standalone deliberately does not
 * answer. See `@/lib/mail/product-flavor`.
 */

import * as React from "react";
import { Mic, MicOff, UserPlus } from "lucide-react";

import { THREAD_ACTION_CLASS } from "@/components/mail/thread-actions";
import { useSpeechDictation } from "@/components/mail/use-speech-dictation";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { MailPopoverContent } from "@/components/mail/MailPopoverContent";
import { mailAddToPeopleActionLabel } from "@/lib/mail/product-flavor";
import { cn } from "@/lib/utils";

type AddToCrmTarget = "clients" | "collaborations" | "facilitators";
const CRM_TARGETS: { id: AddToCrmTarget; label: string }[] = [
  { id: "clients", label: "Clients" },
  { id: "collaborations", label: "Collaborations" },
  { id: "facilitators", label: "Facilitators" },
];
/**
 * "Add to CRM": ask the AI to draft a new record from this thread.
 *
 * Nothing is written here. The menu hands the chosen tables and the note
 * to the proposal flow (`onPropose`), and the AI's draft — name, table,
 * status, first note, the people in the thread — comes back as a New
 * record row in the proposal dialog, to edit and apply. When the thread
 * turns out to be about a record that exists, the dialog says which, and
 * proposes what to change on it instead.
 */
export function AddToCrmMenu({
  attachmentCount = 0,
  onPropose,
}: {
  /** PDFs in the thread the AI could read, if the reader says so. */
  attachmentCount?: number;
  /** Run the proposal flow with this hint for the model. */
  onPropose: (hint: string, includeAttachments: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [readAttachments, setReadAttachments] = React.useState(false);
  const [targets, setTargets] = React.useState<Set<AddToCrmTarget>>(
    () => new Set(["clients"])
  );
  const [note, setNote] = React.useState("");
  const dictation = useSpeechDictation(note, setNote);

  const toggle = (id: AddToCrmTarget) => {
    setTargets((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = () => {
    if (!targets.size) return;
    dictation.stop();
    const tables = CRM_TARGETS.filter((t) => targets.has(t.id)).map((t) => t.id);
    const hint = [
      `Add a new record for the organisation or person this thread is about, in: ${tables.join(", ")}.`,
      `Propose create_record with what the thread says, unless a candidate record already is that organisation — then propose the changes to it instead.`,
      note.trim() ? `Context from the reader: ${note.trim()}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    setOpen(false);
    setNote("");
    onPropose(hint, readAttachments && attachmentCount > 0);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) dictation.stop();
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={mailAddToPeopleActionLabel()}
          title={mailAddToPeopleActionLabel()}
          className={THREAD_ACTION_CLASS}
        >
          <UserPlus />
        </Button>
      </PopoverTrigger>
      <MailPopoverContent align="start" className="w-72 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
          Add to
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          {CRM_TARGETS.map((t) => (
            <label
              key={t.id}
              className="flex cursor-pointer items-center gap-2 text-sm text-stone-800"
            >
              <input
                type="checkbox"
                checked={targets.has(t.id)}
                onChange={() => toggle(t.id)}
                className="h-3.5 w-3.5 accent-teal-700"
              />
              {t.label}
            </label>
          ))}
        </div>
        <div className="relative mt-3">
          <textarea
            value={note}
            onChange={(e) => {
              if (dictation.listening) dictation.stop();
              setNote(e.target.value);
            }}
            placeholder={
              dictation.listening
                ? "Listening…"
                : "Optional context for the AI (e.g. met at AMOSSHE, wants autumn course)…"
            }
            rows={3}
            className={cn(
              "w-full resize-y rounded-lg border bg-stone-50/50 py-2 pl-2.5 pr-10 text-sm outline-none placeholder:text-stone-400 focus:bg-white",
              dictation.listening
                ? "border-teal-400 focus:border-teal-500"
                : "border-stone-200 focus:border-stone-300"
            )}
          />
          {dictation.supported ? (
            <button
              type="button"
              className={cn(
                "absolute right-1.5 top-1.5 rounded-full p-1.5 transition-colors",
                dictation.listening
                  ? "bg-teal-700 text-white hover:bg-teal-800"
                  : "text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              )}
              aria-label={dictation.listening ? "Stop dictation" : "Dictate note"}
              title={dictation.listening ? "Stop dictation" : "Dictate"}
              onClick={() => dictation.toggle()}
            >
              {dictation.listening ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
          ) : null}
        </div>
        {attachmentCount > 0 ? (
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-stone-700">
            <input
              type="checkbox"
              checked={readAttachments}
              onChange={(e) => setReadAttachments(e.target.checked)}
              className="h-3.5 w-3.5 accent-teal-700"
            />
            Also read the {attachmentCount === 1 ? "attached PDF" : `${attachmentCount} attached PDFs`}
          </label>
        ) : null}
        <div className="mt-2 flex items-center justify-end gap-2">
          {dictation.listening ? (
            <span className="mr-auto text-[11px] text-muted-foreground">
              Listening — click the mic to stop
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="shrink-0 rounded-full bg-teal-700 px-4 text-sm text-white hover:bg-teal-800"
            disabled={!targets.size}
            onClick={submit}
          >
            Draft
          </Button>
        </div>
      </MailPopoverContent>
    </Popover>
  );
}
