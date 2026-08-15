"use client";

import * as React from "react";

import { toolMediaClientSrc } from "@/lib/tool-media-url";

/**
 * S3 bucket policy allows reddfocus.org referrers but blocks localhost.
 * Stripping Referer lets local dev and redd-plan previews load public S3 objects.
 */
function needsNoReferrer(src: string | undefined): boolean {
  if (!src) return false;
  if (src.startsWith("/api/research/media/preview")) return false;
  return (
    src.includes("amazonaws.com") ||
    src.includes("redd-website-assets") ||
    src.includes("digital-focus-tools/") ||
    src.includes("institutions/images/")
  );
}

export function ExternalAssetImage({
  src,
  kind = "logo",
  referrerPolicy,
  onError,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & {
  kind?: "logo" | "screenshot";
}) {
  const [failed, setFailed] = React.useState(false);
  const displaySrc =
    typeof src === "string" ? (toolMediaClientSrc(src, null, kind) ?? src) : src;

  const policy =
    referrerPolicy ??
    (typeof displaySrc === "string" && needsNoReferrer(displaySrc) ? "no-referrer" : undefined);

  React.useEffect(() => {
    setFailed(false);
  }, [displaySrc]);

  if (!displaySrc || failed) return null;

  return (
    <img
      src={displaySrc}
      referrerPolicy={policy}
      {...props}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
