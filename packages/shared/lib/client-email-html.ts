function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Normalize Quill output for storage and comparison. */
export function normalizeEditorHtml(value: string) {
  return value.replace(/&nbsp;/g, " ");
}

export const EMAIL_PARAGRAPH_STYLE = "margin:0 0 12px 0;line-height:1.5";
export const EMAIL_COMPACT_PARAGRAPH_STYLE = "margin:0 0 4px 0;line-height:1.45";

const CANONICAL_EMAIL_INLINE_STYLES = [
  EMAIL_PARAGRAPH_STYLE,
  EMAIL_COMPACT_PARAGRAPH_STYLE,
];

function stripCanonicalEmailInlineStyles(html: string): string {
  let result = html;
  for (const style of CANONICAL_EMAIL_INLINE_STYLES) {
    const escaped = style.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\s*style="${escaped}"`, "gi"), "");
    result = result.replace(new RegExp(`\\s*style='${escaped}'`, "gi"), "");
  }
  return result;
}

function emailParagraph(inner: string, compact: boolean): string {
  const style = compact ? EMAIL_COMPACT_PARAGRAPH_STYLE : EMAIL_PARAGRAPH_STYLE;
  return `<p style="${style}">${inner || "<br>"}</p>`;
}

/** Convert plain-text email bodies (with blank-line paragraphs) for Quill / preview. */
export function plainTextToEditorHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return emailParagraph("<br>", false);

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const inner = escapeHtml(paragraph.trim()).replace(/\n/g, "<br>");
      const compact = paragraph.includes("\n");
      return emailParagraph(inner, compact);
    })
    .join("");
}

/** Lines that look like signature / address lines (short, no sentence end). */
function isCompactEmailLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 120) return false;
  return !/[.!?](?:\s|$)/.test(trimmed);
}

function paragraphHasInlineMarkup(el: HTMLElement): boolean {
  return /<(?:strong|em|b|i|u|a|span)\b/i.test(el.innerHTML);
}

/**
 * Quill often emits one `<p>` per line; merge runs of short lines into a single
 * paragraph with `<br>` so spacing matches plain-text signatures.
 */
export function coalesceQuillEmailParagraphs(html: string): string {
  if (!isLikelyHtml(html) || typeof document === "undefined") {
    return html;
  }

  const container = document.createElement("div");
  container.innerHTML = normalizeEditorHtml(html);

  const parts: string[] = [];
  let compactRun: string[] = [];

  const flushCompactRun = () => {
    if (!compactRun.length) return;
    if (compactRun.length === 1) {
      parts.push(emailParagraph(escapeHtml(compactRun[0]), false));
    } else {
      parts.push(
        emailParagraph(compactRun.map(escapeHtml).join("<br>"), true)
      );
    }
    compactRun = [];
  };

  for (const node of [...container.childNodes]) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (tag !== "P") {
      flushCompactRun();
      parts.push(el.outerHTML);
      continue;
    }

    const text = (el.textContent ?? "").trim();
    if (!text) {
      flushCompactRun();
      parts.push(emailParagraph("<br>", false));
      continue;
    }

    const innerBr = el.innerHTML.includes("<br");
    if (innerBr) {
      flushCompactRun();
      const style = el.getAttribute("style") ?? EMAIL_COMPACT_PARAGRAPH_STYLE;
      parts.push(`<p style="${style}">${el.innerHTML}</p>`);
      continue;
    }

    if (
      isCompactEmailLine(text) &&
      !paragraphHasInlineMarkup(el) &&
      !/\{\{\w+\}\}/.test(text)
    ) {
      compactRun.push(text);
      continue;
    }

    flushCompactRun();
    const style = el.getAttribute("style") ?? EMAIL_PARAGRAPH_STYLE;
    parts.push(`<p style="${style}">${el.innerHTML}</p>`);
  }

  flushCompactRun();
  const result = parts.join("");
  return result || html;
}

/** HTML loaded into the rich-text editor (do not re-coalesce stored HTML). */
export function templateBodyForEditor(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return emailParagraph("<br>", false);
  if (!isLikelyHtml(trimmed)) return plainTextToEditorHtml(trimmed);
  return normalizeEditorHtml(trimmed);
}

/** Normalize Quill output for storage and preview rendering. */
export function templateBodyFromEditor(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return "";
  if (!isLikelyHtml(trimmed)) return trimmed;
  return coalesceQuillEmailParagraphs(trimmed);
}

export function templateBodyContentEqual(
  stored: string,
  editorHtml: string
): boolean {
  return (
    normalizeEditorHtml(templateBodyFromEditor(editorHtml)) ===
    normalizeEditorHtml(templateBodyFromEditor(stored))
  );
}

/** Single HTML representation for rich-text editor and preview. */
export function bodyToEmailHtml(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return emailParagraph("<br>", false);
  if (!isLikelyHtml(trimmed)) {
    return plainTextToEditorHtml(trimmed);
  }
  return coalesceQuillEmailParagraphs(trimmed);
}

/** True when Quill output still matches the pre–rich-text snapshot (no real edits). */
export function editorHtmlMatchesSnapshot(
  snapshot: string,
  editorHtml: string
): boolean {
  const expected = bodyToEmailHtml(snapshot);
  return normalizeEditorHtml(bodyToEmailHtml(editorHtml)) === normalizeEditorHtml(expected);
}

/**
 * Lightweight HTML re-formatter: ensures each block-level element starts on its
 * own line without splitting `<p>content</p>` across multiple lines.
 */
export function prettyFormatHtml(html: string): string {
  let result = html.replace(
    /(?<!\n)(<(?:p|div|ul|ol|li|h[1-6]|table|tr|td|th|blockquote|hr|br)\b)/gi,
    "\n$1"
  );
  result = result.replace(
    /<\/(?:p|div|ul|ol|li|h[1-6]|table|tr|td|th|blockquote)>(?!\n)/gi,
    "$&\n"
  );

  result = result
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, arr) => line !== "" || (index > 0 && arr[index - 1] !== ""))
    .join("\n")
    .trim();

  return result;
}

export function isLikelyHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value.trim());
}

export function isFullHtmlDocument(value: string): boolean {
  return /<!DOCTYPE\s+html/i.test(value) || /<html[\s>]/i.test(value);
}

export function wrapEmailPreviewDocument(bodyHtml: string): string {
  if (isFullHtmlDocument(bodyHtml)) {
    return bodyHtml;
  }
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        font-family: Helvetica, Arial, sans-serif;
        font-size: 14px;
        line-height: 1.6;
        color: #222;
        margin: 16px;
      }
      p { margin: 0 0 12px 0; line-height: 1.5; }
      ul, ol { margin: 0 0 16px 18px; padding: 0; }
      li { margin: 0 0 8px 0; }
      a { color: #1d4ed8; text-decoration: underline; }
    </style>
  </head>
  <body>${bodyHtml}</body>
</html>`;
}

/** Plain-text fallback for mailto: links (most clients ignore HTML bodies). */
export function htmlToPlainText(html: string): string {
  const trimmed = html.trim();
  if (!isLikelyHtml(trimmed)) {
    return trimmed;
  }

  if (typeof document !== "undefined") {
    const doc = new DOMParser().parseFromString(trimmed, "text/html");
    const chunks: string[] = [];
    for (const node of [...doc.body.childNodes]) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as HTMLElement;
      if (el.tagName === "P") {
        const line = (el.innerHTML || "")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, "");
        chunks.push(line.trim());
      } else {
        chunks.push((el.textContent ?? "").trim());
      }
    }
    return chunks.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  return trimmed
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when the body has inline styles the rich text editor cannot round-trip. */
export function templateBodyHasInlineStyles(body: string): boolean {
  return /style\s*=/i.test(stripCanonicalEmailInlineStyles(body));
}
