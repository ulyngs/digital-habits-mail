/**
 * Resolve digital-focus tool media URLs for display in redd-plan.
 *
 * Production DB rows may store:
 * - Legacy paths: /images/tool-logos/foo.png (static files on redd-next / reddfocus.org)
 * - Bare filenames: logo-redd2fa.png (imported from CSV)
 * - Full S3 URLs: https://redd-website-assets.s3.../digital-focus-tools/...
 * - S3 storage_key only: digital-focus-tools/logos/uuid-file.png
 */

const DEFAULT_WEBSITE_ORIGIN = "https://www.reddfocus.org";

const DEFAULT_S3_BUCKET = "redd-website-assets";

/** True when the URL already points at our S3 bucket (not a temporary external preview). */
export function isPlanHostedMediaUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const lower = url.toLowerCase();
  const bucket = (
    process.env.NEXT_PUBLIC_S3_ASSETS_BUCKET?.trim() ||
    process.env.S3_ASSETS_BUCKET?.trim() ||
    DEFAULT_S3_BUCKET
  ).toLowerCase();
  return (
    lower.includes(`${bucket}.s3.`) ||
    lower.includes("digital-focus-tools/logos/") ||
    lower.includes("digital-focus-tools/screenshots/")
  );
}

/** CSV/import used .png while redd-next public/ only has .svg for some ReDD logos. */
const LEGACY_LOGO_BASENAME_ALIASES: Record<string, string> = {
  "logo-redd2fa.png": "logo-redd2fa.svg",
  "logo-reddfocus.png": "logo-reddfocus.svg",
  "logo-reddtodo.png": "logo-reddtodo.svg",
  "logo-reddblock.png": "logo-reddblock-shield.svg",
};

export function getReddWebsiteOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_REDD_WEBSITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_REDD_ASSETS_ORIGIN?.trim() ||
    DEFAULT_WEBSITE_ORIGIN;
  return raw.replace(/\/$/, "");
}

function s3PublicUrlFromStorageKey(storageKey: string): string {
  const bucket =
    process.env.NEXT_PUBLIC_S3_ASSETS_BUCKET?.trim() || "redd-website-assets";
  const region =
    process.env.NEXT_PUBLIC_S3_REGION?.trim() ||
    process.env.NEXT_PUBLIC_AWS_REGION?.trim() ||
    "eu-north-1";
  const key = storageKey.replace(/^\/+/, "");
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

function normalizeLegacyMediaPath(
  value: string,
  kind: "logo" | "screenshot"
): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }

  const folder =
    kind === "logo" ? "images/tool-logos" : "images/tool-screenshots";
  return `/${folder}/${trimmed}`;
}

function applyLegacyLogoBasenameFix(path: string): string {
  const basename = path.split("/").pop() ?? path;
  const alias = LEGACY_LOGO_BASENAME_ALIASES[basename];
  if (!alias) return path;
  return path.replace(/[^/]+$/, alias);
}

function fixLegacyLogoInUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.includes("/images/tool-logos/")) return url;
    const nextPath = applyLegacyLogoBasenameFix(parsed.pathname);
    if (nextPath === parsed.pathname) return url;
    parsed.pathname = nextPath;
    return parsed.toString();
  } catch {
    return url;
  }
}

function isS3ObjectKey(path: string): boolean {
  return path.startsWith("digital-focus-tools/");
}

export function resolveToolMediaUrl(
  publicUrl: string | null | undefined,
  storageKey: string | null | undefined,
  kind: "logo" | "screenshot" = "logo"
): string | null {
  const preferred = publicUrl?.trim() || null;
  const fallback = storageKey?.trim() || null;

  // DB rows often keep a legacy site path in public_url while storage_key is the real S3 object.
  if (fallback && isS3ObjectKey(fallback)) {
    return s3PublicUrlFromStorageKey(fallback);
  }

  if (preferred?.startsWith("http://") || preferred?.startsWith("https://")) {
    if (preferred.includes("digital-focus-tools/")) {
      return preferred;
    }
    return kind === "logo" ? fixLegacyLogoInUrl(preferred) : preferred;
  }

  if (fallback?.startsWith("http://") || fallback?.startsWith("https://")) {
    if (fallback.includes("digital-focus-tools/")) {
      return fallback;
    }
    return kind === "logo" ? fixLegacyLogoInUrl(fallback) : fallback;
  }

  let path = preferred || fallback;
  if (!path) return null;

  if (isS3ObjectKey(path)) {
    return s3PublicUrlFromStorageKey(path);
  }

  if (!path.startsWith("/") && !path.startsWith("images/")) {
    path = normalizeLegacyMediaPath(path, kind);
  } else if (path.startsWith("images/")) {
    path = `/${path}`;
  }

  if (kind === "logo" && path.includes("/images/tool-logos/")) {
    path = applyLegacyLogoBasenameFix(path);
  }

  if (path.startsWith("/images/") || path.startsWith("/")) {
    return `${getReddWebsiteOrigin()}${path}`;
  }

  return path;
}

/**
 * URL safe for <img src> in the browser. External assistant previews are proxied
 * server-side (App Store CDN, og:image hosts, etc. often block hotlinking).
 */
export function toolMediaClientSrc(
  publicUrl: string | null | undefined,
  storageKey: string | null | undefined = null,
  kind: "logo" | "screenshot" = "logo"
): string | null {
  const resolved = resolveToolMediaUrl(publicUrl, storageKey, kind);
  if (!resolved) return null;

  if (resolved.startsWith("/api/research/media/preview")) {
    return resolved;
  }

  const isRemote =
    resolved.startsWith("https://") || resolved.startsWith("http://");
  if (isRemote && !isPlanHostedMediaUrl(resolved)) {
    return `/api/research/media/preview?url=${encodeURIComponent(resolved)}`;
  }

  return resolved;
}
