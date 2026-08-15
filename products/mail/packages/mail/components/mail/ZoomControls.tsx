"use client";

import * as React from "react";

import {
  MAX_ZOOM,
  MIN_ZOOM,
  nextZoomStop,
} from "@/components/mail/use-mail-layout";

export function ZoomControls({
  zoom,
  onAdjust,
}: {
  zoom: number;
  /**
   * Moves the zoom by an amount. Everything here works out the amount that
   * lands on the size it wants, so nothing new has to be threaded down
   * from the page that owns the number.
   */
  onAdjust: (delta: number) => void;
}) {
  const percent = Math.round(zoom * 100);
  /** Typing a size in. Null when the label is just a label. */
  const [typed, setTyped] = React.useState<string | null>(null);

  const commit = (text: string) => {
    setTyped(null);
    const wanted = Number.parseInt(text.replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(wanted)) return;
    // Clamped here as well as in the hook, so the delta is the one that
    // actually lands: asking for 900% and being given 200% would leave
    // the two disagreeing about where the zoom now is.
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, wanted / 100));
    onAdjust(next - zoom);
  };

  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-stone-200 bg-white px-1.5 py-1">
      <button
        type="button"
        aria-label="Smaller text"
        title="Smaller text"
        className="rounded-full px-1 text-[15px] leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40"
        disabled={zoom <= MIN_ZOOM}
        onClick={() => onAdjust(nextZoomStop(zoom, -1) - zoom)}
      >
        −
      </button>
      {/*
        The label is exactly as wide as the widest thing it can say, and no
        wider. A width guessed in rem is either slack at 100% or a pill that
        resizes at 90%, and it has to be guessed again whenever the font moves.
        So the widest label sizes the box and the real one sits on top of it.
        Zoom runs 50% to 200%, and tabular figures give every 4-character label
        the same width, so "100%" is as wide as the label ever gets.

        The box the size is typed into sits in that same cell, so the row
        does not change width when it opens.
      */}
      <span className="grid text-[11px] tabular-nums text-stone-400">
        <span className="invisible col-start-1 row-start-1" aria-hidden>
          100%
        </span>
        {typed === null ? (
          <button
            type="button"
            aria-label={`Text size ${percent}%. Click to type a size.`}
            title="Type a size"
            className="col-start-1 row-start-1 text-center hover:text-stone-700"
            onClick={() => setTyped(String(percent))}
          >
            {percent}%
          </button>
        ) : (
          <input
            // Numeric, but a text field: `number` brings its own stepper
            // and its own opinion about what is typed, in a box four
            // characters wide.
            type="text"
            inputMode="numeric"
            aria-label="Text size, per cent"
            autoFocus
            /*
              A box asks for room for twenty characters unless it is told
              otherwise, and the column here is as wide as the widest thing
              in it — so the box, not the label, was deciding, and the pill
              doubled in width the moment it opened. Asking for one
              character leaves the invisible label in charge of the width,
              and `w-full` fills whatever that comes to.
            */
            size={1}
            value={typed}
            className="col-start-1 row-start-1 w-full min-w-0 bg-transparent text-center tabular-nums text-stone-700 outline-none"
            onChange={(e) => setTyped(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            // Leaving the box is as much an answer as pressing Enter.
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit(typed);
              } else if (e.key === "Escape") {
                e.preventDefault();
                // Escape leaves the size alone, which is what it means
                // everywhere else in here.
                setTyped(null);
              }
            }}
          />
        )}
      </span>
      <button
        type="button"
        aria-label="Bigger text"
        title="Bigger text"
        className="rounded-full px-1 text-[15px] leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40"
        disabled={zoom >= MAX_ZOOM}
        onClick={() => onAdjust(nextZoomStop(zoom, 1) - zoom)}
      >
        +
      </button>
    </div>
  );
}
