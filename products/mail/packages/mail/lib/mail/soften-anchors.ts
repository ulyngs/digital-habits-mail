/**
 * Every link in an email becomes a span before the parser sees it.
 *
 * HTML5 forbids <a> wrapping a <table>, which marketing CTAs do constantly.
 * The parser hoists the table out and leaves an empty <a>, so the visible
 * "View message" button loses its link. A span may wrap a table, so the
 * address survives; the frame's click bridge opens it.
 *
 * No React and no DOM in here, so a test can read it.
 */

export const MAIL_HREF_ATTR = "data-dh-href";
/** A softened link the sender styled in no way at all — see below. */
export const MAIL_PLAIN_LINK_ATTR = "data-dh-plain";

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
      // Ours to set, not the sender's to claim: it decides how the link is
      // painted, and a button could otherwise ask to be painted as text.
      rest = rest.replace(
        /\s*\bdata-dh-plain\s*(?:=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/i,
        ""
      );
      const escaped = href
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
      /*
        A link the sender dressed themselves keeps what they gave it — that
        is what the softening is for, so a "View message" button stays a
        button. One they left alone has nothing at all once it is a span,
        and read as ordinary words: no colour, no underline, no sign that
        it goes anywhere. Those are marked here and painted like a link.

        Marked from the tag rather than in CSS because CSS cannot ask
        whether the sender said anything; `style` or `class` on the anchor
        is the nearest honest answer to that question.
      */
      const dressed = /(?:^|\s)(style|class)\s*=/i.test(rest);
      out += `<span ${MAIL_HREF_ATTR}="${escaped}"${
        dressed ? "" : ` ${MAIL_PLAIN_LINK_ATTR}=""`
      }${rest}>`;
    }
    last = index + match[0].length;
  }
  out += html.slice(last);
  return out;
}
