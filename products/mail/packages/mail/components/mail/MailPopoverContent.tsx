"use client";

/**
 * Popover content that carries the mail theme.
 *
 * Radix puts popover content in a portal on `<body>`, outside `.mail-shell`.
 * The shell tokens therefore do not reach it, and a menu stayed light while
 * the rest of the app was dark. This copies the shell class and the resolved
 * theme onto the content, so the same tokens apply inside the portal.
 *
 * Use this instead of `PopoverContent` for every menu in the mail interface.
 */

import * as React from "react";

import { PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useMailColorMode } from "@/lib/mail/theme";

export const MailPopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverContent>,
  React.ComponentPropsWithoutRef<typeof PopoverContent>
>(({ className, ...props }, ref) => {
  const colorMode = useMailColorMode();
  return (
    <PopoverContent
      ref={ref}
      data-theme={colorMode}
      className={cn("mail-shell mail-popover", className)}
      {...props}
    />
  );
});
MailPopoverContent.displayName = "MailPopoverContent";
