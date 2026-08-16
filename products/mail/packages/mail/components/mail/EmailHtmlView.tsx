"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Copy, ExternalLink, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { findLinksInText } from "@/lib/linkify-urls";
import {
  MAIL_IMAGE_CSP_SOURCE,
  rewriteRemoteImagesThroughProxy,
} from "@/lib/mail/image-proxy";
import { openExternalUrl } from "@/lib/native-shell";
import { requestMailComposeTo } from "@/lib/mail/compose-to";
import { mailSay, useMailT } from "@/lib/mail/i18n";
import {
  mailLinkMenuModel,
  type MailLinkMenuModel,
} from "@/lib/mail/link-menu";
import {
  MAIL_LINK_BRIDGE_CSP_HASH,
  MAIL_LINK_BRIDGE_JS,
} from "@/lib/mail/link-bridge";

/**
 * Renders untrusted email HTML safely.
 *
 * - The HTML is sanitized against an element and attribute blocklist. Scripts,
 *   embeds, forms, event handlers and javascript: URLs cannot survive it.
 * - It is shown in an iframe, which keeps the sender's CSS and layout away
 *   from the app.
 * - A CSP <meta> inside that frame stops code from running. `default-src
 *   'none'` refuses everything, and `script-src` names the sha256 of one
 *   script: the link bridge below.
 * - The same CSP refuses every network fetch — tracking pixels, remote CSS
 *   backgrounds — until the reader asks for images.
 *
 * The sandbox attribute is not what stops code here, and this comment said
 * for a while that it was. The frame needs `allow-scripts` for the link
 * bridge, and `allow-same-origin` so the height can be measured from
 * `contentDocument`. Those two together leave the frame same-origin with this
 * page, which is also what lets find-in-thread read it. So the hash in
 * `script-src` is the control that keeps anything the sanitizer missed from
 * running. `MAIL_LINK_BRIDGE_JS` and its hash live in `lib/mail/link-bridge`,
 * where a suite checks that they still agree: a drift between them disables
 * the bridge, and it is the pin that would have moved.
 */

const BLOCKED_ELEMENTS = new Set([
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "textarea",
  "select",
  "button",
  "video",
  "audio",
  "source",
  "track",
  "template",
  "noscript",
  "dialog",
]);

const UNSAFE_URL_RE = /^\s*(javascript|vbscript|data:text\/html)/i;

/** True when the HTML references remote images (worth offering a toggle). */
export function htmlHasRemoteImages(html: string): boolean {
  return /<img[^>]+src\s*=\s*["']?https?:/i.test(html) || /url\(\s*["']?https?:/i.test(html);
}

/** Carries a mail link URL on a <span> so HTML5 parse cannot strip it. */
const MAIL_HREF_ATTR = "data-dh-href";

/**
 * Turn every <a href> into <span data-dh-href> before DOMParser runs.
 *
 * HTML5 forbids <a> wrapping a <table> (common in LinkedIn / marketing CTAs).
 * The parser hoists the table out and leaves an empty <a> — the visible
 * "View message" button then has no link. Spans may wrap tables, so the URL
 * survives; the iframe click handler opens data-dh-href via openExternalUrl.
 */
export function softenAnchorsForParse(html: string): string {
  const tagRe = /<\/a\s*>|<a\b([^>]*)>/gi;
  let out = "";
  let last = 0;
  for (const match of html.matchAll(tagRe)) {
    const index = match.index ?? 0;
    out += html.slice(last, index);
    if (/^<\/a/i.test(match[0])) {
      out += "</span>";
    } else {
      const attrs = match[1] ?? "";
      const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(
        attrs
      );
      const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "";
      let rest = attrs.replace(
        /\s*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
        ""
      );
      rest = rest.replace(
        /\s*\bdata-dh-href\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i,
        ""
      );
      const escaped = href
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
      out += `<span ${MAIL_HREF_ATTR}="${escaped}"${rest}>`;
    }
    last = index + match[0].length;
  }
  out += html.slice(last);
  return out;
}

/** @deprecated Use softenAnchorsForParse — kept for any older imports. */
export function demoteNestedAnchors(html: string): string {
  return softenAnchorsForParse(html);
}

/**
 * Realm-safe Element check. Parent-page `instanceof Element` is false for
 * iframe nodes (separate JS globals). Prefer nodeType — works across realms
 * even when `view` is missing.
 */
function asElement(node: EventTarget | null): Element | null {
  if (!node || typeof (node as Node).nodeType !== "number") return null;
  if ((node as Node).nodeType !== 1) return null;
  return node as Element;
}

/** postMessage payload from the srcdoc click bridge. */
const MAIL_OPEN_MSG_SOURCE = "dh-mail";
const MAIL_OPEN_MSG_TYPE = "open-url";


/**
 * Follow a link from a message.
 *
 * An address opens our own composer, not whatever mail client the machine
 * would otherwise start. This app is the mail client.
 */
async function followMailLink(target: string): Promise<void> {
  if (/^mailto:/i.test(target)) {
    // A mailto can carry ?subject=… and more. Only the address is taken.
    const address = target.slice("mailto:".length).split("?")[0];
    requestMailComposeTo(decodeURIComponent(address));
    return;
  }
  const ok = await openExternalUrl(target);
  if (!ok) toast.error(mailSay("couldNotOpenLink"));
}

/**
 * Resolve what a link points at: an http(s) URL, or a `mailto:` address.
 *
 * Works on an <a href> and on a softened mail link span alike.
 */
function linkTargetFromEl(el: Element): string | null {
  const raw = (
    el.getAttribute("href") ||
    el.getAttribute(MAIL_HREF_ATTR) ||
    ""
  ).trim();
  if (!raw || raw.startsWith("#")) return null;
  if (/^mailto:/i.test(raw)) return raw;
  // about:srcdoc is a useless base for relative URLs — use the parent origin.
  const base =
    !el.baseURI || el.baseURI === "about:srcdoc"
      ? window.location.href
      : el.baseURI;
  try {
    const abs = new URL(raw, base).href;
    if (/^https?:/i.test(abs)) return abs;
  } catch {
    /* ignore invalid */
  }
  if (el.tagName === "A") {
    const href = (el as HTMLAnchorElement).href;
    return href && /^https?:/i.test(href) ? href : null;
  }
  return null;
}

/** Whitespace, including the hard space a mail client leaves behind. */
function isBlankText(value: string): boolean {
  return !value.replace(/[\s\u00a0\u200b\ufeff]+/g, "");
}

/** Elements that show something without holding any text. */
const DRAWS_WITHOUT_TEXT =
  "img,picture,video,iframe,hr,svg,canvas,object,embed,input,button,textarea,select";

/**
 * A style that paints a box of its own: a rule, a band of colour, a height.
 *
 * The tail matters — a divider is nearly always `border-top`, never `border`,
 * and reading only the plain property took those dividers away.
 */
const PAINTS_A_BOX = /(background|border|height|padding)[a-z-]*\s*:/i;

/** True when this element draws something even with nothing inside it. */
function paintsABox(el: Element): boolean {
  if (PAINTS_A_BOX.test(el.getAttribute("style") ?? "")) return true;
  return el.hasAttribute("bgcolor") || el.hasAttribute("background");
}

/**
 * True when taking this node away would change nothing on screen.
 *
 * Anything that paints is kept, even with no text in it: a divider is a
 * border on an empty div, and a band of colour is a background on one.
 */
function drawsNothing(node: Node): boolean {
  if (node.nodeType === node.TEXT_NODE) return isBlankText(node.nodeValue ?? "");
  if (node.nodeType === node.COMMENT_NODE) return true;
  if (node.nodeType !== node.ELEMENT_NODE) return false;
  const el = node as Element;
  if (el.tagName === "BR") return true;
  if (el.matches(DRAWS_WITHOUT_TEXT)) return false;
  if (el.querySelector(DRAWS_WITHOUT_TEXT)) return false;
  if (!isBlankText(el.textContent ?? "")) return false;
  return !paintsABox(el);
}

/** How far down the first/last child chain the edges are followed. */
const TRIM_MAX_DEPTH = 8;

/**
 * Take the spacing off the very top and the very bottom of a message.
 *
 * A paragraph's margin is a line of space. Between two paragraphs that is the
 * sender writing; at the two edges it stands against our own padding, and the
 * message ends in a hole.
 *
 * This is done to the elements and not in the stylesheet on purpose. A rule
 * can only name a fixed number of levels, and the last paragraph of a message
 * is routinely a `p` inside a `td` inside a `table` inside a wrapper — while
 * `body > *:last-child` is the link bridge's own script tag, which is added
 * after this and carries no spacing to take off.
 */
function collapseEdgeSpacing(
  el: Element,
  edge: "margin-top" | "margin-bottom",
  depth = 0
): void {
  const style = el.getAttribute("style") ?? "";
  el.setAttribute("style", `${style};${edge}:0`);
  const next =
    edge === "margin-top" ? el.firstElementChild : el.lastElementChild;
  if (!next || depth >= TRIM_MAX_DEPTH) return;
  collapseEdgeSpacing(next, edge, depth + 1);
}

/**
 * Take the empty rows off the start and the end of a message.
 *
 * A mail client leaves them behind — the blank lines under a signature are
 * the usual ones — and they are inside the sender's own layout, so the frame
 * is measured around them and the bubble ends in a hole. Only the two edges
 * are touched: a blank line between two paragraphs is the sender writing,
 * and it stays.
 *
 * The edges are followed down the first and last child, because a message is
 * nearly always wrapped in a div or a table and the blank rows sit inside it.
 */
function trimLeadingBlanks(el: Element, depth = 0): void {
  let node = el.firstChild;
  while (node && drawsNothing(node)) {
    const next = node.nextSibling;
    node.parentNode?.removeChild(node);
    node = next;
  }
  const first = el.firstElementChild;
  if (!first || depth >= TRIM_MAX_DEPTH) return;
  // Not into something that paints. Its cells can be empty and it still
  // draws — emptying a coloured row is how the colour goes away.
  if (paintsABox(first)) return;
  trimLeadingBlanks(first, depth + 1);
}

function trimTrailingBlanks(el: Element, depth = 0): void {
  let node = el.lastChild;
  while (node && drawsNothing(node)) {
    const previous = node.previousSibling;
    node.parentNode?.removeChild(node);
    node = previous;
  }
  const last = el.lastElementChild;
  if (!last || depth >= TRIM_MAX_DEPTH) return;
  if (paintsABox(last)) return;
  trimTrailingBlanks(last, depth + 1);
}

/** Strip anything executable/interactive from untrusted email HTML. */
export function sanitizeEmailHtml(
  html: string,
  inlineImages?: Record<string, string>
): string {
  const doc = new DOMParser().parseFromString(
    softenAnchorsForParse(html),
    "text/html"
  );

  const all = doc.querySelectorAll("*");
  for (const el of all) {
    if (BLOCKED_ELEMENTS.has(el.tagName.toLowerCase())) {
      el.remove();
      continue;
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      } else if (
        (name === "href" ||
          name === MAIL_HREF_ATTR ||
          name === "src" ||
          name === "srcset" ||
          name === "xlink:href") &&
        UNSAFE_URL_RE.test(attr.value)
      ) {
        el.removeAttribute(attr.name);
      }
    }
  }

  // Legacy demote left href on <span>; normalize to data-dh-href.
  for (const el of doc.querySelectorAll("[href]")) {
    if (el.tagName === "A") continue;
    const href = el.getAttribute("href");
    if (!href) continue;
    if (!el.getAttribute(MAIL_HREF_ATTR)) {
      el.setAttribute(MAIL_HREF_ATTR, href);
    }
    el.removeAttribute("href");
  }

  for (const el of doc.querySelectorAll(`[${MAIL_HREF_ATTR}]`)) {
    if (!el.getAttribute("role")) el.setAttribute("role", "link");
  }

  // Our own sends are wrapped at 12pt so recipients' clients (Outlook et al.)
  // show them at their default reading size — but in our viewer that renders
  // larger than the 14px iframe default used for unstyled incoming mail.
  // Normalize the wrapper (div) and quoted-history blocks (pre) back to 14px
  // on display so own bubbles match incoming ones. Old app versions already
  // sent a 14px wrapper, which now needs no rewrite.
  for (const el of doc.querySelectorAll(
    'div[style*="font-size:12pt"], pre[style*="font-size:12pt"]'
  )) {
    const style = el.getAttribute("style") ?? "";
    if (
      style.includes("font-family:Helvetica,Arial,sans-serif") &&
      (style.includes("line-height:1.6") ||
        style.includes("white-space:pre-wrap"))
    ) {
      el.setAttribute("style", style.replace("font-size:12pt", "font-size:14px"));
    }
  }

  // Inline cid: attachments — substitute the data: URI the server resolved
  // from the message, or drop the img when the attachment wasn't available.
  for (const img of doc.querySelectorAll("img")) {
    // `originalsrc` as well as `src`. Outlook keeps the content id there and
    // puts a blob URL of its own in `src` — one that means nothing outside
    // its own web client, and that we would otherwise render as a broken
    // picture rather than the one that came with the message.
    const src = img.getAttribute("src") ?? "";
    const cidMatch =
      /^\s*cid:(.+)$/i.exec(src) ??
      /^\s*cid:(.+)$/i.exec(img.getAttribute("originalsrc") ?? "");
    if (!cidMatch) continue;
    const mapped = inlineImages?.[decodeURIComponent(cidMatch[1]).trim()];
    if (mapped) img.setAttribute("src", mapped);
    else img.remove();
  }

  for (const img of doc.querySelectorAll("img")) dropHeightOnSizedImage(img);

  // Outlook (and most clients) turn bare https://… text into links; do the
  // same so HTML parts that never wrapped the URL in <a> stay clickable.
  if (doc.body) linkifyBareLinksInRoot(doc.body, doc);

  for (const a of doc.querySelectorAll("a")) {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noreferrer noopener");
  }

  // Last, so that a picture dropped above for having no attachment behind it
  // leaves a row that goes with it.
  if (doc.body) {
    trimLeadingBlanks(doc.body);
    trimTrailingBlanks(doc.body);
    if (doc.body.firstElementChild) {
      collapseEdgeSpacing(doc.body.firstElementChild, "margin-top");
    }
    if (doc.body.lastElementChild) {
      collapseEdgeSpacing(doc.body.lastElementChild, "margin-bottom");
    }
  }

  return doc.body?.innerHTML ?? "";
}

/**
 * Below this, a picture's size is doing a job other than showing a picture.
 *
 * A one-pixel spacer stretched to hold a table open is the usual one, and its
 * height is the whole point of it. Nothing that small is a photograph.
 */
const SIZED_IMAGE_MIN_WIDTH = 200;

/** A length in plain pixels: `800`, `800px`. Anything else is not one. */
function pixelLength(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/.exec(value);
  return match ? Number(match[1]) : null;
}

/**
 * A picture keeps its shape when the pane makes it narrower.
 *
 * `max-width:100%` shrinks a wide image to fit the pane, but a height the
 * sender wrote does not shrink with it, so the picture is squashed — by a
 * different amount at every pane width, which is why it changes as the window
 * is resized. Dropping the height lets `height:auto` scale it with the width.
 *
 * Only where a real width was declared. A width in per cent counts too: it
 * already scales, and a fixed height beside it distorts in the same way.
 */
function dropHeightOnSizedImage(img: Element): void {
  const styleWidth = (img as HTMLElement).style?.width ?? "";
  const scales = styleWidth.trim().endsWith("%");
  const width =
    pixelLength(img.getAttribute("width")) ?? pixelLength(styleWidth);
  if (!scales && (width == null || width < SIZED_IMAGE_MIN_WIDTH)) return;
  img.removeAttribute("height");
  (img as HTMLElement).style?.removeProperty("height");
  if (!(img as HTMLElement).getAttribute("style")) {
    img.removeAttribute("style");
  }
}

/** True when a text node sits inside an existing link (don't nest links). */
function isInsideAnchor(node: Node): boolean {
  let el = node.parentElement;
  while (el) {
    if (el.tagName === "A" || el.hasAttribute(MAIL_HREF_ATTR)) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Wrap bare links in text nodes with <a> elements: http(s) URLs, and email
 * addresses as `mailto:`.
 *
 * Plenty of senders write an address as text — "Dana Fisher
 * <dana@example.ac.uk>" — and every other mail client makes that clickable.
 * The click is answered by the bridge, which hands it to our composer.
 */
function linkifyBareLinksInRoot(root: HTMLElement, doc: Document) {
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? "";
    if (!text || isInsideAnchor(node)) continue;
    if (findLinksInText(text).length) targets.push(node as Text);
  }

  for (const textNode of targets) {
    const text = textNode.textContent ?? "";
    const matches = findLinksInText(text);
    if (!matches.length) continue;

    const frag = doc.createDocumentFragment();
    let last = 0;
    for (const { start, end, href } of matches) {
      if (start > last) frag.append(doc.createTextNode(text.slice(last, start)));
      const a = doc.createElement("a");
      a.setAttribute("href", href);
      a.textContent = text.slice(start, end);
      frag.append(a);
      last = end;
    }
    if (last < text.length) frag.append(doc.createTextNode(text.slice(last)));
    textNode.parentNode?.replaceChild(frag, textNode);
  }
}

/**
 * Elements that mark where a mail client appended the quoted history of
 * earlier messages. First match in document order wins.
 */
const QUOTE_CONTAINER_SELECTORS = [
  "#divRplyFwdMsg", // Outlook reply/forward header
  "#appendonsend",
  "#mail-editor-reference-message-container",
  ".gmail_quote_container",
  "div.gmail_quote",
  'blockquote[type="cite"]', // Apple Mail
  ".moz-cite-prefix", // Thunderbird
  ".yahoo_quoted",
];

const FROM_LABEL_RE = /^\s*(From|Fra|Von|Van|De)\s*:/i;
const SUBJECT_LABEL_RE = /\b(Subject|Emne|Betreff|Onderwerp|Objet|Asunto)\s*:/i;
const DIVIDER_TEXT_RE =
  /^-{2,}\s*(Original Message|Forwarded message|Oprindelig meddelelse|Videresendt meddelelse)\s*-{2,}/i;
/** Attribution line right above a quote ("On 24 Jul 2026 … wrote:"). */
const WROTE_LINE_RE = /(wrote|skrev|schrieb|a écrit)\s*:?\s*$/i;

function findQuoteStart(doc: Document): Element | null {
  const candidates: Element[] = [];
  for (const selector of QUOTE_CONTAINER_SELECTORS) {
    const el = doc.querySelector(selector);
    if (el) candidates.push(el);
  }

  // Header block a client pasted as plain markup: an element whose text
  // starts with "From:" (any common language) and lists a Subject soon after,
  // or an explicit "-----Original Message-----" divider.
  for (const el of doc.body?.querySelectorAll("div, p") ?? []) {
    const text = (el.textContent ?? "").trim();
    if (!text) continue;
    if (
      DIVIDER_TEXT_RE.test(text) ||
      (FROM_LABEL_RE.test(text) && SUBJECT_LABEL_RE.test(text.slice(0, 800)))
    ) {
      candidates.push(el);
      break; // document order: the first hit is the outermost/earliest
    }
  }

  // "On … wrote:" attribution followed by a blockquote — our own replies
  // and clients that don't wrap the quote in gmail_quote. Always consider
  // these: a nested .gmail_quote inside the quoted history would otherwise
  // win and leave our outer quote visible.
  for (const quote of doc.body?.querySelectorAll("blockquote") ?? []) {
    const prev = quote.previousElementSibling;
    if (prev && WROTE_LINE_RE.test((prev.textContent ?? "").trim())) {
      candidates.push(prev);
      break;
    }
    const parent = quote.parentElement;
    if (parent && parent !== doc.body) {
      const first = (parent.firstElementChild?.textContent ?? "").trim();
      if (WROTE_LINE_RE.test(first)) {
        candidates.push(parent);
        break;
      }
    }
  }

  if (!candidates.length) return null;
  // Earliest in the document = outermost quote boundary.
  candidates.sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  );
  return candidates[0];
}

/**
 * Cut the quoted chain of earlier messages off an HTML reply (the rich-view
 * sibling of stripQuotedReplies). Returns the original when nothing would be
 * left, so a pure forward never renders as an empty bubble.
 */
export function stripQuotedHtml(html: string): {
  html: string;
  hadQuote: boolean;
} {
  if (typeof window === "undefined") return { html, hadQuote: false };

  const doc = new DOMParser().parseFromString(html, "text/html");
  const marker = findQuoteStart(doc);
  if (!marker || !doc.body) return { html, hadQuote: false };

  // Drop everything from the marker to the end of the document.
  let node: Node | null = marker;
  while (node && node !== doc.body) {
    while (node.nextSibling) node.nextSibling.remove();
    node = node.parentNode;
  }
  marker.remove();

  // Tidy what's now the tail: separator rules, empty blocks, and the
  // "On … wrote:" attribution line that introduced the quote.
  let last = doc.body.lastElementChild;
  while (last) {
    const text = (last.textContent ?? "").trim();
    const isNoise =
      last.tagName === "HR" ||
      (!text && !last.querySelector("img")) ||
      // Short attribution line only — never a wrapper holding the message.
      (text.length < 200 && WROTE_LINE_RE.test(text));
    if (!isNoise) break;
    const prev = last.previousElementSibling;
    last.remove();
    last = prev;
  }

  const remaining = doc.body.innerHTML;
  if (!(doc.body.textContent ?? "").trim() && !doc.body.querySelector("img")) {
    return { html, hadQuote: false };
  }
  return { html: remaining, hadQuote: true };
}

const PREVIEW_INLINE_TAGS = new Set([
  "b",
  "strong",
  "i",
  "em",
  "a",
  "u",
  "s",
  "strike",
  "code",
]);

/**
 * Compact HTML for collapsed-thread previews: keep bold/italic/links, flatten
 * the rest to text so line-clamp works without a full iframe.
 */
export function emailHtmlPreviewSnippet(html: string): string {
  if (typeof window === "undefined") return "";
  const { html: trimmed } = stripQuotedHtml(html);
  const doc = new DOMParser().parseFromString(
    sanitizeEmailHtml(trimmed),
    "text/html"
  );
  if (!doc.body) return "";

  for (const el of doc.body.querySelectorAll("img, svg, style, script, hr")) {
    el.remove();
  }
  for (const br of doc.body.querySelectorAll("br")) {
    br.replaceWith(doc.createTextNode(" "));
  }
  for (const block of doc.body.querySelectorAll(
    "div, p, li, tr, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th"
  )) {
    block.append(doc.createTextNode(" "));
  }

  // Unwrap everything that isn't a simple emphasis/link tag.
  for (const el of [...doc.body.querySelectorAll("*")].reverse()) {
    const tag = el.tagName.toLowerCase();
    const mailHref = el.getAttribute(MAIL_HREF_ATTR);
    if (mailHref && !UNSAFE_URL_RE.test(mailHref)) {
      const a = doc.createElement("a");
      a.setAttribute("href", mailHref);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noreferrer noopener");
      while (el.firstChild) a.appendChild(el.firstChild);
      el.replaceWith(a);
      continue;
    }
    if (PREVIEW_INLINE_TAGS.has(tag)) {
      if (tag === "a") {
        const href = el.getAttribute("href");
        for (const attr of [...el.attributes]) el.removeAttribute(attr.name);
        if (href && !UNSAFE_URL_RE.test(href)) {
          el.setAttribute("href", href);
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noreferrer noopener");
        }
      } else {
        for (const attr of [...el.attributes]) el.removeAttribute(attr.name);
      }
      continue;
    }
    while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el);
    el.remove();
  }

  return (doc.body.innerHTML || "").replace(/\s+/g, " ").trim();
}

function buildSrcDoc(
  sanitized: string,
  allowImages: boolean,
  origin: string,
  imageMaxHeight?: number,
  bodyColor?: string
): string {
  // Remote images are rewritten to the same-origin proxy when allowed, so the
  // iframe never hits CORP/hotlink blocks on the sender's CDN. data: (cid)
  // images stay inlined and always allowed.
  const body = allowImages
    ? rewriteRemoteImagesThroughProxy(sanitized, origin)
    : sanitized;
  // allow-scripts is only for MAIL_LINK_BRIDGE_JS (hash-pinned). Email HTML is
  // sanitized and still cannot load remote scripts (default-src 'none').
  const imgSrc = allowImages
    ? `img-src ${MAIL_IMAGE_CSP_SOURCE} data:;`
    : "img-src data:;";
  const csp = `default-src 'none'; ${imgSrc} style-src 'unsafe-inline'; script-src '${MAIL_LINK_BRIDGE_CSP_HASH}'`;
  return [
    // data-dh-mail marks our document, so the reader can tell the new frame
    // from the one it replaces while srcDoc swaps.
    '<!doctype html><html data-dh-mail="1"><head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '<meta name="referrer" content="no-referrer">',
    '<base target="_blank">',
    "<style>",
    // Prefer auto height (thread pane scrolls). Keep overflow-y auto as a
    // fallback if measurement still undershoots a marketing footer.
    "html,body{margin:0;overflow-x:auto;overflow-y:auto}",
    `body{padding:12px 14px 20px;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${bodyColor ?? "#292524"};word-break:break-word;background:transparent}`,
    "img{max-width:100%;height:auto}",
    // A view with a ceiling of its own — the peek at the first message —
    // asks for a ceiling on the pictures too. A screenshot pasted into an
    // issue is a few hundred pixels wide and a thousand tall, and at full
    // height it is the whole of a short view with none of the words.
    ...(imageMaxHeight
      ? [`img{max-height:${imageMaxHeight}px;width:auto;object-fit:contain}`]
      : []),
    // Softened mail CTAs (see softenAnchorsForParse) — keep button styling.
    `[${MAIL_HREF_ATTR}]{cursor:pointer;color:inherit;text-decoration:inherit}`,
    // Reading in the dark. The caller has decided this message paints no
    // page of its own (see `wordsInTheDark`), so the colours it declares
    // for its words are all assumptions about a white one — ours included:
    // everything we send is wrapped by the server in `color:#222`. They are
    // overridden here, and a link keeps being a link by taking the theme's
    // own link colour instead of the sender's blue-on-white.
    ...(bodyColor
      ? [
          "p,div,span,td,th,li,ul,ol,blockquote,pre,h1,h2,h3,h4,h5,h6,strong,em,b,i,u,small,font{color:inherit!important}",
          `[${MAIL_HREF_ATTR}]{color:#6aa9ea!important}`,
        ]
      : []),
    "</style>",
    "</head><body>",
    body,
    `<script>${MAIL_LINK_BRIDGE_JS}</script>`,
    "</body></html>",
  ].join("");
}

/**
 * Frame height for auto-sized email iframes.
 * `body.getBoundingClientRect().height` alone drops trailing margins on
 * marketing footers (Outlook tables), which clips the last few pixels.
 */
function measureEmailFrameHeight(doc: Document): number {
  const body = doc.body;
  if (!body) return 0;
  const win = doc.defaultView;
  const bodyTop = body.getBoundingClientRect().top;
  let bottom = body.getBoundingClientRect().bottom;

  const include = (el: Element) => {
    const rect = el.getBoundingClientRect();
    const marginBottom = win
      ? parseFloat(win.getComputedStyle(el).marginBottom) || 0
      : 0;
    bottom = Math.max(bottom, rect.bottom + marginBottom);
  };

  for (const child of body.children) include(child);

  // Nested trailing margins (table > tbody > tr > td > …).
  let el: Element | null = body.lastElementChild;
  while (el) {
    include(el);
    el = el.lastElementChild;
  }

  // Slack for sub-pixels and collapsed margins so the footer never clips.
  return Math.max(0, Math.ceil(bottom - bodyTop + 6));
}

/** Window events that re-emit pinch gestures happening inside email iframes. */
export const MAIL_PINCH_WHEEL_EVENT = "mail-pinch-wheel";
export const MAIL_PINCH_SCALE_EVENT = "mail-pinch-scale";

/**
 * Pinches over the sandboxed iframe never reach the thread pane's listeners,
 * so forward them to the parent window (as raw wheel deltas / scale ratios)
 * for the mail zoom to consume. Listeners run in the parent context — the
 * iframe itself stays script-free.
 */
function attachPinchForwarding(doc: Document) {
  const wheelOpts: AddEventListenerOptions = { passive: false, capture: true };
  doc.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey) return; // plain scrolling, not a pinch
      e.preventDefault();
      window.dispatchEvent(
        new CustomEvent(MAIL_PINCH_WHEEL_EVENT, { detail: e.deltaY })
      );
    },
    wheelOpts
  );

  // WebKit (Safari, the Mac app's webview) reports pinches as gesture events.
  let lastScale = 1;
  const gestureOpts: AddEventListenerOptions = { capture: true, passive: false };
  doc.addEventListener(
    "gesturestart",
    ((e: Event) => {
      e.preventDefault();
      lastScale = (e as Event & { scale?: number }).scale ?? 1;
    }) as EventListener,
    gestureOpts
  );
  doc.addEventListener(
    "gesturechange",
    ((e: Event) => {
      e.preventDefault();
      const scale = (e as Event & { scale?: number }).scale ?? 1;
      if (lastScale > 0) {
        window.dispatchEvent(
          new CustomEvent(MAIL_PINCH_SCALE_EVENT, { detail: scale / lastScale })
        );
      }
      lastScale = scale;
    }) as EventListener,
    gestureOpts
  );
}

/**
 * Keystrokes inside the iframe reach the app's shortcuts.
 *
 * The shortcut listeners live on the top window, and a click on the email
 * body gives the iframe's document the keyboard — after which every key
 * fires in here and the app hears nothing. WebKit is also reluctant to
 * hand focus back when the next click lands on something in the parent
 * that is not focusable, so the dead zone was bigger than the message.
 *
 * The keys are re-dispatched on the parent window as synthetic keyboard
 * events, the same bridge the pinch uses. A synthetic event cannot cancel
 * what the key does inside the iframe, and should not: copy, arrows and
 * text selection keep their meanings — the app's own guard ignores keys
 * typed into fields, and a field inside a message is left alone here too.
 */
function attachKeyForwarding(doc: Document) {
  doc.addEventListener(
    "keydown",
    (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) {
        return;
      }
      const consumed = !window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: e.key,
          code: e.code,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          repeat: e.repeat,
          cancelable: true,
        })
      );
      // The app took the key, so its default in here must not also run —
      // some shortcuts ride keys the webview has plans for (Cmd+R would
      // reload the whole app on top of opening the reply). dispatchEvent
      // runs the parent's listeners synchronously and reports whether one
      // of them called preventDefault, so the answer is already in hand.
      if (consumed) e.preventDefault();
    },
    { capture: true }
  );
}

/**
 * Meet / RSVP / etc. in invite HTML are normal <a> tags. Tauri's WebView
 * silently drops target=_blank navigations that originate inside an iframe,
 * and the shell's document-level click hook never sees iframe clicks — so
 * open http(s) links from the parent via the opener plugin (or window.open).
 */
function attachExternalLinkHandling(doc: Document) {
  // Backup when the in-frame bridge is blocked; WKWebView often skips this.
  doc.addEventListener(
    "click",
    (event) => {
      // composedPath survives nested SVG/table quirks better than closest alone.
      const path = event.composedPath();
      let el: Element | null = null;
      for (const node of path) {
        const candidate = asElement(node);
        if (!candidate) continue;
        if (candidate.tagName === "A" && candidate.hasAttribute("href")) {
          el = candidate;
          break;
        }
        if (candidate.hasAttribute(MAIL_HREF_ATTR)) {
          el = candidate;
          break;
        }
      }
      if (!el) {
        const target = asElement(event.target);
        el = target?.closest(`a[href], [${MAIL_HREF_ATTR}]`) ?? null;
      }
      if (!el) return;
      const target = linkTargetFromEl(el);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      void followMailLink(target);
    },
    true
  );
}

/** A right-click on a link, in the frame's own coordinates. */
type LinkMenuRequest = {
  target: string;
  /** Pointer position in the frame's viewport, before the frame's zoom. */
  frameX: number;
  frameY: number;
};

/**
 * The right-click menu on a link.
 *
 * Every link in the frame is a span (see `softenAnchorsForParse`), so the
 * browser's own menu treats it as text: Look Up, Translate, Search — and no
 * Copy Link, which is the one thing a reader right-clicks a link for. So the
 * frame takes the event over on links, and only there. Right-click on plain
 * text keeps the browser's menu, which is good and which nothing here would
 * improve on.
 *
 * A link inside a selection the reader made is treated as text too: they
 * selected it, so the selection is what they mean. That is decided on
 * mousedown, because WebKit selects the word under a right-click before it
 * fires `contextmenu`, and by then every link looks selected. The same
 * snapshot puts the selection back the way it was once the menu is ours, so
 * the word does not stay highlighted under it.
 */
function attachLinkContextMenu(
  doc: Document,
  onRequest: (request: LinkMenuRequest) => void,
  onDismiss: () => void
) {
  const linkFromEvent = (event: Event): Element | null => {
    for (const node of event.composedPath()) {
      const candidate = asElement(node);
      if (!candidate) continue;
      if (candidate.tagName === "A" && candidate.hasAttribute("href")) {
        return candidate;
      }
      if (candidate.hasAttribute(MAIL_HREF_ATTR)) return candidate;
    }
    const target = asElement(event.target);
    return target?.closest(`a[href], [${MAIL_HREF_ATTR}]`) ?? null;
  };

  let selectionBefore: Range[] = [];
  let linkWasSelected = false;

  doc.addEventListener(
    "mousedown",
    (event) => {
      // Any press closes a menu that is open; a right-click on a link opens
      // a new one a moment later, through `contextmenu`.
      onDismiss();
      const secondary =
        event.button === 2 || (event.button === 0 && event.ctrlKey);
      if (!secondary) return;
      const sel = doc.getSelection();
      selectionBefore = [];
      linkWasSelected = false;
      if (!sel || sel.isCollapsed) return;
      for (let i = 0; i < sel.rangeCount; i += 1) {
        selectionBefore.push(sel.getRangeAt(i).cloneRange());
      }
      const link = linkFromEvent(event);
      if (link) {
        linkWasSelected = selectionBefore.some((range) =>
          range.intersectsNode(link)
        );
      }
    },
    true
  );

  doc.addEventListener("scroll", onDismiss, true);
  doc.addEventListener("wheel", onDismiss, { capture: true, passive: true });

  doc.addEventListener(
    "contextmenu",
    (event) => {
      const link = linkFromEvent(event);
      if (!link || linkWasSelected) return;
      const target = linkTargetFromEl(link);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      // The word WebKit selected under the pointer goes back to whatever was
      // selected before, which is usually nothing.
      const sel = doc.getSelection();
      if (sel) {
        sel.removeAllRanges();
        for (const range of selectionBefore) sel.addRange(range);
      }
      onRequest({ target, frameX: event.clientX, frameY: event.clientY });
    },
    true
  );
}

/** Put text on the clipboard, one way or another. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through to the old way */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * The menu itself, in the page over the frame.
 *
 * Placed at the pointer and clamped to the window, like the folder menu in
 * the rail. The destination is the first row and is not a button: it is
 * there to be read. People right-click a link partly to see where it really
 * goes, and a mail client that softens every anchor owes them that.
 */
function LinkContextMenu({
  model,
  x,
  y,
  onDismiss,
}: {
  model: MailLinkMenuModel;
  x: number;
  y: number;
  onDismiss: () => void;
}) {
  const t = useMailT();
  const ref = React.useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = React.useState({ left: x, top: y });

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setPlaced({
      left: Math.max(8, Math.min(x, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - box.height - 8)),
    });
  }, [x, y]);

  React.useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      onDismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("blur", onDismiss);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("blur", onDismiss);
    };
  }, [onDismiss]);

  const OpenIcon = model.kind === "mailto" ? Mail : ExternalLink;
  const item =
    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-stone-800 hover:bg-stone-100";

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={t("link")}
      style={{ left: placed.left, top: placed.top }}
      /* Portalled, so its events travel up the React tree rather than the
         DOM: without this a click in here reaches the message view around
         it, whose double-click opens the thread in a window. */
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="mail-light-surface fixed z-50 w-max max-w-[min(28rem,calc(100vw-1rem))] rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
    >
      <div
        className="truncate px-3 pb-1.5 pt-1 text-xs text-stone-500"
        title={model.target}
      >
        {model.shown}
      </div>
      <div className="mb-1 border-t border-stone-200" />
      <button
        type="button"
        role="menuitem"
        autoFocus
        className={item}
        onClick={() => {
          onDismiss();
          void followMailLink(model.target);
        }}
      >
        <OpenIcon className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden />
        {model.openLabel}
      </button>
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={() => {
          onDismiss();
          void copyText(model.copyText).then((ok) => {
            if (ok) toast(model.kind === "mailto" ? "Address copied" : "Link copied");
            else toast.error(mailSay("couldNotCopy"));
          });
        }}
      >
        <Copy className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden />
        {model.copyLabel}
      </button>
    </div>,
    document.body
  );
}

/**
 * Double-clicks inside the sandboxed iframe never bubble to React parents.
 * WebKit/Tauri is also flaky with dblclick on srcdoc frames, so detect a
 * second click within a short window as well as the native dblclick event.
 */
function attachDoubleClickForwarding(
  doc: Document,
  onDoubleClick: () => void
) {
  let lastClickAt = 0;
  let lastFireAt = 0;
  const isLink = (event: Event) => {
    const target = asElement(event.target);
    const el = target?.closest(`a[href], [${MAIL_HREF_ATTR}]`) ?? null;
    return Boolean(el);
  };
  const fire = (event: Event) => {
    if (isLink(event)) return;
    const now = Date.now();
    // Click-pair detector and native dblclick often both fire — only once.
    if (now - lastFireAt < 400) return;
    lastFireAt = now;
    lastClickAt = 0;
    event.preventDefault();
    onDoubleClick();
  };
  doc.addEventListener(
    "click",
    (event) => {
      if (isLink(event)) {
        lastClickAt = 0;
        return;
      }
      const now = Date.now();
      if (now - lastClickAt < 400) {
        fire(event);
        return;
      }
      lastClickAt = now;
    },
    true
  );
  doc.addEventListener("dblclick", fire, true);
}

export function EmailHtmlView({
  html,
  allowImages,
  inlineImages,
  zoom = 1,
  imageMaxHeight,
  bodyColor,
  onContentDoubleClick,
}: {
  html: string;
  allowImages: boolean;
  inlineImages?: Record<string, string>;
  /**
   * Tallest a picture may be, in frame pixels.
   *
   * For a view with a ceiling of its own, where a full-height screenshot
   * would fill it and leave no room for the message it came with. Unset in
   * the thread, where a picture is shown at the size it was sent.
   */
  imageMaxHeight?: number;
  /**
   * The color the words take when the HTML names none of its own.
   *
   * Unset means #292524, which is what a sender's mail assumes it is being
   * read on white. A message of your own on the dark theme passes a light
   * one instead: the composer names no colors, so there is nothing to argue
   * with, and the bubble under it can be dark. See `ownWordsInTheDark`.
   */
  bodyColor?: string;
  /**
   * Thread-pane zoom. CSS zoom on an ancestor never reaches an iframe's
   * document properly — WebKit scales the frame's rendered pixels (blurry,
   * and stale after zoom changes), Chromium leaves the content unscaled — so
   * the ancestor zoom is cancelled on the iframe element (zoom: 1/z) and
   * re-applied inside the document, where text re-lays-out crisply.
   */
  zoom?: number;
  /** Fired for dblclick on the email body (not on links). */
  onContentDoubleClick?: () => void;
}) {
  const t = useMailT();
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const onDblClickRef = React.useRef(onContentDoubleClick);
  onDblClickRef.current = onContentDoubleClick;
  const zoomRef = React.useRef(zoom);
  zoomRef.current = zoom;
  const [height, setHeight] = React.useState(140);
  const [linkMenu, setLinkMenu] = React.useState<{
    model: MailLinkMenuModel;
    x: number;
    y: number;
  } | null>(null);
  const dismissLinkMenu = React.useCallback(() => setLinkMenu(null), []);
  /** False until the first iframe paint — avoids an empty cut-off bubble. */
  const [ready, setReady] = React.useState(false);
  /** Only show the spinner if paint is slow — cache reopen should not flash it. */
  const [showPlaceholder, setShowPlaceholder] = React.useState(false);

  const srcDoc = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    return buildSrcDoc(
      sanitizeEmailHtml(html, inlineImages),
      allowImages,
      window.location.origin,
      imageMaxHeight,
      bodyColor
    );
  }, [html, allowImages, inlineImages, imageMaxHeight, bodyColor]);

  React.useEffect(() => {
    if (ready) {
      setShowPlaceholder(false);
      return;
    }
    const timer = window.setTimeout(() => setShowPlaceholder(true), 120);
    return () => window.clearTimeout(timer);
  }, [ready]);

  // In-frame bridge (see MAIL_LINK_BRIDGE_JS) — reliable under Tauri WKWebView.
  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as {
        source?: unknown;
        type?: unknown;
        url?: unknown;
      } | null;
      if (!data || data.source !== MAIL_OPEN_MSG_SOURCE) return;
      if (data.type !== MAIL_OPEN_MSG_TYPE) return;
      if (typeof data.url !== "string") return;
      if (!/^(https?:|mailto:)/i.test(data.url)) return;
      void followMailLink(data.url);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  /** Documents already wired up — a frame is set up once, however we reach it. */
  const initedDocsRef = React.useRef<WeakSet<Document>>(new WeakSet());
  const observerRef = React.useRef<ResizeObserver | null>(null);

  /** Returns true when this call did the setup. */
  const initDoc = React.useCallback((doc: Document): boolean => {
    if (!doc.body) return false;
    if (initedDocsRef.current.has(doc)) return false;
    initedDocsRef.current.add(doc);

    doc.body.style.zoom = String(zoomRef.current);
    const measure = () => {
      // Prefer content bounds (incl. trailing margins) over body.rect alone so
      // the frame keeps its height across content swaps (e.g. images toggle)
      // without clipping marketing footers.
      const next = measureEmailFrameHeight(doc);
      if (next > 0) setHeight(next);
    };
    measure();
    setReady(true);
    requestAnimationFrame(measure);
    // Late layout shifts (e.g. images arriving after the reveal) resize the frame.
    observerRef.current?.disconnect();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(doc.body);
      observer.observe(doc.documentElement);
      observerRef.current = observer;
    }
    for (const img of doc.images) {
      if (img.complete) continue;
      img.addEventListener("load", measure, { once: true });
      img.addEventListener("error", measure, { once: true });
    }
    attachPinchForwarding(doc);
    attachKeyForwarding(doc);
    // In-frame bridge owns link clicks when CSP allowed it to run.
    if (doc.documentElement.getAttribute("data-dh-bridge") !== "1") {
      attachExternalLinkHandling(doc);
    }
    attachDoubleClickForwarding(doc, () => onDblClickRef.current?.());
    attachLinkContextMenu(
      doc,
      ({ target, frameX, frameY }) => {
        const model = mailLinkMenuModel(target);
        const frame = iframeRef.current;
        if (!model || !frame) return;
        /**
         * A point in the frame, in the page's own pixels.
         *
         * Measured rather than worked out from the zoom. The frame is drawn
         * at 1/zoom, its body at zoom, and the whole stream sits in an
         * element at zoom again (see ThreadPane) — so the scale from frame
         * pixels to page pixels is some product of those, and reading the
         * zoom prop got it wrong by exactly that ancestor: at 80% the menu
         * opened a sixth of the frame below the pointer.
         *
         * The frame's rect is its size in page pixels and its own
         * `innerHeight` is that same box in frame pixels. The ratio is the
         * scale, whatever the zooms above it happen to be.
         */
        const box = frame.getBoundingClientRect();
        const view = frame.contentWindow;
        const scaleX =
          view && view.innerWidth > 0 ? box.width / view.innerWidth : 1;
        const scaleY =
          view && view.innerHeight > 0 ? box.height / view.innerHeight : 1;
        setLinkMenu({
          model,
          x: box.left + frameX * scaleX,
          y: box.top + frameY * scaleY,
        });
      },
      dismissLinkMenu
    );
    return true;
  }, [dismissLinkMenu]);

  const handleLoad = React.useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (doc) initDoc(doc);
  }, [initDoc]);

  React.useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  /**
   * Show the message as soon as the document parses. The iframe `load` event
   * waits for every remote image, which adds seconds to a marketing email —
   * the observer and the per-image handlers above correct the height when the
   * images land.
   */
  React.useEffect(() => {
    if (!srcDoc) return;
    const deadline = Date.now() + 15_000;
    let raf = 0;
    const poll = () => {
      const doc = iframeRef.current?.contentDocument;
      const parsed =
        doc?.body &&
        doc.readyState !== "loading" &&
        doc.documentElement.getAttribute("data-dh-mail") === "1";
      // A false return means this is still the frame we are replacing.
      if (parsed && initDoc(doc)) return;
      if (Date.now() > deadline) return;
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [srcDoc, initDoc]);

  // Zoom changes restyle the already-loaded document; measured rects include
  // zoom, so height follows.
  React.useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    doc.body.style.zoom = String(zoom);
    const next = measureEmailFrameHeight(doc);
    if (next > 0) setHeight(next);
  }, [zoom]);

  return (
    <div className="relative w-full" style={{ minHeight: ready ? undefined : 140 }}>
      {showPlaceholder && !ready ? (
        <div
          className="flex min-h-[140px] items-center justify-center gap-2 px-4 py-10 text-sm text-stone-500"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          {t("loadingMessage")}
        </div>
      ) : null}
      <iframe
        ref={iframeRef}
        title={t("emailContent")}
        srcDoc={srcDoc}
        sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        onLoad={handleLoad}
        className={
          ready
            ? "block w-full border-0 bg-transparent"
            : "pointer-events-none absolute inset-x-0 top-0 block w-full border-0 opacity-0"
        }
        style={{
          height: ready ? height : 140,
          colorScheme: "light",
          zoom: 1 / zoom,
        }}
      />
      {linkMenu ? (
        <LinkContextMenu
          model={linkMenu.model}
          x={linkMenu.x}
          y={linkMenu.y}
          onDismiss={dismissLinkMenu}
        />
      ) : null}
    </div>
  );
}
