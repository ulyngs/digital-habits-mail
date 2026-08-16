"use client";

/**
 * The app-wide size, as a React value, and the one place it is applied.
 *
 * Separate from `ui-scale.ts` because that one is read by a test, and a
 * test cannot import React.
 */

import * as React from "react";

import {
  MAIL_UI_SCALE_EVENT,
  readUiScale,
  writeUiScale,
} from "@/lib/mail/ui-scale";

let cached: number | null = null;

export function useUiScale(): [number, (value: number) => void] {
  const scale = React.useSyncExternalStore(
    (onChange) => {
      const listener = () => {
        cached = null;
        onChange();
      };
      window.addEventListener(MAIL_UI_SCALE_EVENT, listener);
      window.addEventListener("storage", listener);
      return () => {
        window.removeEventListener(MAIL_UI_SCALE_EVENT, listener);
        window.removeEventListener("storage", listener);
      };
    },
    () => (cached ??= readUiScale()),
    // The server draws at 100%: localStorage is the reader's machine, and
    // a first paint at the wrong size then jumping is worse than a beat.
    () => 1
  );
  return [scale, writeUiScale];
}

/**
 * Draw the whole app at the reader's size.
 *
 * On the document, not on `.mail-shell`: every menu in this app is a Radix
 * portal hung on `<body>`, outside the shell — the same reason
 * MailPopoverContent has to copy the shell class over to reach them with
 * the theme. A size set on the shell would leave every menu at 100%, and
 * leave Radix measuring a trigger in one scale and placing a menu in
 * another. The document is the one element above both.
 *
 * Cleared on the way out, so the planner keeps its own size when the mail
 * page is not the page being read.
 */
export function useApplyUiScale(scale: number): void {
  React.useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.zoom;
    root.style.zoom = scale === 1 ? "" : String(scale);
    return () => {
      root.style.zoom = previous;
    };
  }, [scale]);
}
