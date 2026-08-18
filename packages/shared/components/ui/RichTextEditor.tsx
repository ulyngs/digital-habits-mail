"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef } from "react";
// Vendored without sourceMappingURL (package CSS 404s the .map under Next).
import "@/styles/quill.snow.css";
import "@/styles/quill.bubble.css";

/** The slice of Quill's API the editor handle needs. */
type QuillEditor = {
  getSelection: (focus?: boolean) => { index: number; length: number } | null;
  deleteText: (index: number, length: number, source?: string) => void;
  insertText: (index: number, text: string, source?: string) => void;
  insertEmbed: (
    index: number,
    type: string,
    value: unknown,
    source?: string
  ) => void;
  setSelection: (index: number, length?: number, source?: string) => void;
  getLength: () => number;
  getLeaf: (index: number) => [{ parent?: unknown } | null, number];
  focus: () => void;
  format: (name: string, value: unknown, source?: string) => void;
  getFormat: () => Record<string, unknown>;
};

type QuillRange = { index: number; length: number };

/**
 * Quill 2 maps both Enter and Shift+Enter to a new block. Register a BR embed
 * so Shift+Enter can insert a soft linebreak inside the current paragraph.
 */
let softBreakRegistered = false;

function registerSoftBreak(Quill: {
  import: (name: string) => unknown;
  // Quill's register has several overloads; keep this loose for the dynamic import.
  register: (...args: never[]) => void;
  imports?: Record<string, unknown>;
}) {
  if (softBreakRegistered || Quill.imports?.["formats/softbreak"]) {
    softBreakRegistered = true;
    return;
  }

  const Parchment = Quill.import("parchment") as {
    EmbedBlot: {
      // Prototype shape varies across Quill typings — only need a constructable base.
      new (...args: unknown[]): object;
      blotName?: string;
      tagName?: string;
      className?: string;
      value?: (node: HTMLElement) => unknown;
    };
  };

  class SoftBreakBlot extends Parchment.EmbedBlot {
    static blotName = "softbreak";
    static tagName = "BR";
    static className = "ql-softbreak";

    length() {
      return 1;
    }

    value() {
      return true;
    }

    static value() {
      return true;
    }
  }

  Quill.register(SoftBreakBlot as never);
  softBreakRegistered = true;
}

let inlineStylesRegistered = false;

/**
 * Font and size written as inline styles, not as class names.
 *
 * Quill ships `font` and `size` as classes — `ql-font-serif`, `ql-size-large`
 * — which say nothing without Quill's own stylesheet. A sent message carries
 * no stylesheet, so the receiving mail app would show the class and none of
 * the styling. These write the CSS property itself, which travels.
 *
 * Neither takes a whitelist. Browsers rewrite `font-family` and `font-size`
 * when they parse them, so a listed value can come back in a form that is no
 * longer on the list — and a reopened draft would quietly lose its styling.
 */
function registerInlineStyles(Quill: {
  import: (name: string) => unknown;
  register: (...args: never[]) => void;
}) {
  if (inlineStylesRegistered) return;

  const Parchment = Quill.import("parchment") as {
    Scope: { INLINE: unknown };
    StyleAttributor: new (
      attrName: string,
      keyName: string,
      options: { scope: unknown }
    ) => unknown;
  };

  const inline = { scope: Parchment.Scope.INLINE };
  Quill.register(
    new Parchment.StyleAttributor("font", "font-family", inline) as never,
    true as never
  );
  Quill.register(
    new Parchment.StyleAttributor("size", "font-size", inline) as never,
    true as never
  );
  inlineStylesRegistered = true;
}

/** Insert a soft linebreak; double-BR at block end so the caret can sit after it. */
function shiftEnterSoftBreak(
  this: { quill: QuillEditor },
  range: QuillRange
) {
  const quill = this.quill;
  if (range.length) {
    quill.deleteText(range.index, range.length, "user");
  }
  const [currentLeaf] = quill.getLeaf(range.index);
  const [nextLeaf] = quill.getLeaf(range.index + 1);
  quill.insertEmbed(range.index, "softbreak", true, "user");
  // Browsers ignore a trailing <br> at the end of a block — insert a second
  // so the break is visible and the caret has somewhere to land.
  if (
    nextLeaf == null ||
    (currentLeaf != null &&
      nextLeaf != null &&
      currentLeaf.parent !== nextLeaf.parent)
  ) {
    quill.insertEmbed(range.index, "softbreak", true, "user");
  }
  quill.setSelection(range.index + 1, 0, "silent");
  return false;
}

/** `this` inside a Quill toolbar handler. */
type ToolbarHandlerContext = {
  quill: QuillEditor & {
    getText: (index: number, length: number) => string;
    format: (name: string, value: unknown, source?: string) => void;
    theme?: {
      tooltip?: {
        edit: (mode: string, preview?: string) => void;
        root?: HTMLElement;
        textbox?: HTMLInputElement;
      };
    };
  };
};

/**
 * Already says how to reach it.
 *
 * `://` is required rather than a bare colon, because a scheme may contain
 * dots and `example.com:8443/path` is therefore a legal-looking one — it is
 * a host and a port, and treating it as a scheme left it without https.
 * `mailto:` and `tel:` are named, being the two that carry no authority.
 */
const HAS_SCHEME = /^(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|tel:)/i;

/**
 * `example.org`, `digitalhabits.org/demo`, `sub.example.co.uk/a?b=c`.
 *
 * Deliberately not the app's own link finder: that one only matches
 * addresses that already carry http:// or https://, because its job is to
 * find links inside a sentence, where a bare domain is too easy to imagine.
 * Here the writer has selected the text and asked for a link, so the guess
 * is invited — and it is only a guess: it fills the box, and they still
 * have to press Apply.
 */
const BARE_ADDRESS =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}(?::\d+)?(?:[/?#]\S*)?$/i;

/**
 * The address a selection is already offering, if it is offering one.
 *
 * Text like `digitalhabits.org/demo` is the address — retyping it with a
 * scheme on the front is work the writer has already done. The whole
 * selection has to be the link and nothing else, so a sentence that mentions
 * a domain still opens an empty box.
 */
function urlFromSelection(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return "";
  if (HAS_SCHEME.test(trimmed)) return trimmed;
  // An address is a person, not a site. Quill would link it as a relative
  // path, which goes nowhere.
  if (trimmed.includes("@")) return "";
  return BARE_ADDRESS.test(trimmed) ? `https://${trimmed}` : "";
}

/**
 * Replaces Quill's default link handler, which prefills the URL box with the
 * selected text as-is. Ours opens the box on the address that text means when
 * it means one, and empty otherwise, with the selection shown as a label
 * (rendered via CSS from `data-selection`).
 */
function linkToolbarHandler(this: ToolbarHandlerContext, value: boolean) {
  const quill = this.quill;
  if (!value) {
    quill.format("link", false, "user");
    return;
  }
  const range = quill.getSelection();
  if (!range || !range.length) return;
  const tooltip = quill.theme?.tooltip;
  if (!tooltip) return;

  const text = quill.getText(range.index, range.length).trim();
  tooltip.edit("link", urlFromSelection(text));
  const label = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  if (tooltip.root) {
    if (label) tooltip.root.setAttribute("data-selection", label);
    else tooltip.root.removeAttribute("data-selection");
  }
  if (tooltip.textbox) tooltip.textbox.placeholder = "https://…";
}

type ReactQuillInstance = { getEditor: () => QuillEditor };

export type RichTextEditorHandle = {
  /** Insert text at the cursor (replacing any selection) and refocus. */
  insertText: (text: string) => void;
  /**
   * Where the caret is, counted in characters from the start.
   *
   * For handing a half-written message from one box to another: what was
   * being written matters, and so does the place in it that was being
   * written. Null when the box does not have the caret.
   */
  getCaret: () => number | null;
  /** Put the caret back, clamped to what is actually there. */
  setCaret: (index: number) => void;
  /** Take the caret, leaving it where it last was. */
  focus: () => void;
  /**
   * Apply an inline format to the selection, or `false` to take it off.
   *
   * For controls that cannot live in the toolbar element itself. Quill binds
   * its own buttons at mount, from inside that element, so anything in a
   * popover — which is drawn elsewhere and only when it opens — has to reach
   * the editor this way instead.
   */
  format: (name: string, value: string | boolean) => void;
  /** The inline formats at the selection, for showing which one is on. */
  activeFormats: () => Record<string, unknown>;
};

/**
 * Warm up the lazily-loaded Quill chunk (e.g. when the mail page mounts) so
 * the editor mounts instantly when a composer opens, instead of flashing a
 * half-built card while the chunk downloads.
 */
export function preloadRichTextEditor(): void {
  void import("react-quill-new").then(({ Quill }) => {
    registerSoftBreak(Quill);
    registerInlineStyles(Quill);
  });
}

// next/dynamic doesn't forward refs, so thread the instance ref through a
// regular prop on a small wrapper component.
const ReactQuill = dynamic(
  async () => {
    const { default: RQ, Quill } = await import("react-quill-new");
    registerSoftBreak(Quill);
    registerInlineStyles(Quill);
    function ReactQuillWithRef({
      quillRef,
      ...props
    }: React.ComponentProps<typeof RQ> & {
      quillRef: React.MutableRefObject<ReactQuillInstance | null>;
    }) {
      return <RQ ref={quillRef as never} {...props} />;
    }
    return ReactQuillWithRef;
  },
  {
    ssr: false,
    // Quiet spacer roughly matching the mounted editor, so the composer card
    // doesn't flash a skeleton if the chunk isn't cached yet.
    loading: () => <div className="min-h-[100px] w-full" />,
  }
);

type RichTextEditorProps = {
  value?: string;
  /**
   * Uncontrolled mode: seeds the editor once and never resets it from props.
   * Use for live typing surfaces (e.g. mail compose) where feeding Quill's
   * output back as `value` would make it re-parse and drop trailing spaces.
   */
  defaultValue?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  /**
   * Id of a parent-rendered element to use as the Quill toolbar (must contain
   * `.ql-*` buttons and exist before the editor mounts). Lets the composer
   * place the formatting buttons in its own footer row.
   */
  toolbarId?: string;
  /**
   * Which toolbar the editor wears.
   *
   * "snow" is the bar above the box, which is right where there is room for
   * one. "bubble" has no bar at all: the controls appear over a selection,
   * for a window small enough that a permanent toolbar would be most of it.
   */
  variant?: "snow" | "bubble";
  /** Receives an imperative handle (e.g. for inserting emoji at the cursor). */
  handleRef?: React.MutableRefObject<RichTextEditorHandle | null>;
  /**
   * Enter sends, and starts no line.
   *
   * For a chat box, where Enter has always meant send and shift-Enter has
   * always meant a new line. Left unset, Enter does what it does in a mail
   * composer: it starts a paragraph.
   */
  onEnter?: () => void;
};

export function RichTextEditor({
  value,
  defaultValue,
  onChange,
  placeholder = "Write your message here...",
  className = "",
  minHeight = 100,
  toolbarId,
  variant = "snow",
  handleRef,
  onEnter,
}: RichTextEditorProps) {
  const quillRef = useRef<ReactQuillInstance | null>(null);

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      insertText: (text) => {
        const editor = quillRef.current?.getEditor();
        if (!editor) return;
        // getSelection(true) focuses the editor and restores the caret the
        // user left behind before clicking the toolbar.
        const range = editor.getSelection(true);
        const index = range?.index ?? Math.max(editor.getLength() - 1, 0);
        if (range?.length) editor.deleteText(index, range.length, "user");
        editor.insertText(index, text, "user");
        editor.setSelection(index + text.length, 0);
      },
      getCaret: () => {
        const editor = quillRef.current?.getEditor();
        // Not getSelection(true): asking would focus the box and give an
        // answer about a caret the reader never put there.
        return editor?.getSelection()?.index ?? null;
      },
      setCaret: (index) => {
        const editor = quillRef.current?.getEditor();
        if (!editor) return;
        // Quill counts a trailing newline of its own, so the last place a
        // caret can sit is one before the end.
        const last = Math.max(editor.getLength() - 1, 0);
        editor.setSelection(Math.max(0, Math.min(index, last)), 0);
      },
      focus: () => {
        quillRef.current?.getEditor()?.focus();
      },
      format: (name, value) => {
        const editor = quillRef.current?.getEditor();
        if (!editor) return;
        // The popover holds the focus while it is open. getSelection(true)
        // takes it back and restores the range the writer selected before
        // reaching for the menu, which is what the format is meant for.
        editor.getSelection(true);
        editor.format(name, value, "user");
      },
      activeFormats: () =>
        quillRef.current?.getEditor()?.getFormat() ?? {},
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef]);
  /*
   * Through a ref, never straight into `modules`.
   *
   * Quill is built from `modules` once; a new object rebuilds the editor and
   * loses the caret with it. A send handler is rebuilt on almost every
   * keystroke — it reads the draft — so binding it directly would rebuild
   * the box as fast as it could be typed in.
   */
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;

  const modules = useMemo(
    () => ({
      toolbar: {
        container: toolbarId
          ? `#${toolbarId}`
          : // The same set either way. Which toolbar a box wears is about
            // the room it has, not about what can be done in it — a
            // narrow box was offering four of the six and no way to reach
            // the other two.
            [
              ["bold", "italic", "underline"],
              [{ list: "ordered" }, { list: "bullet" }],
              ["link"],
            ],
        handlers: { link: linkToolbarHandler },
      },
      keyboard: {
        bindings: {
          softBreak: {
            key: "Enter",
            shiftKey: true,
            handler: shiftEnterSoftBreak,
          },
          // Returning false stops Quill's own Enter, so nothing is typed
          // into a box that is being emptied and sent. Without a handler
          // set, this hands straight back to Quill.
          send: {
            key: "Enter",
            shiftKey: false,
            handler: () => {
              const send = onEnterRef.current;
              if (!send) return true;
              send();
              return false;
            },
          },
        },
      },
    }),
    [toolbarId, variant]
  );

  const formats = [
    "bold",
    "italic",
    "underline",
    "list",
    "link",
    "softbreak",
    "strike",
    // Quill writes this one as <sub> and <sup>, which every mail app draws
    // without being told how — the same reason strike is safe to offer.
    "script",
    "font",
    "size",
    "color",
    "background",
  ];

  return (
    <div
      className={`rich-text-editor rich-text-editor-${variant} ${className}`}
      style={{ ["--editor-min-height" as string]: `${minHeight}px` }}
    >
      <ReactQuill
        quillRef={quillRef}
        theme={variant}
        {...(defaultValue !== undefined
          ? { defaultValue }
          : { value: value ?? "" })}
        onChange={(content, _delta, source, editor) => {
          // Quill emits source "api" when React updates the value prop. If we
          // propagate that, parent state changes → new value → another "api"
          // event → infinite loop and a frozen tab (Chrome "Page Unresponsive").
          if (source !== "user") return;
          onChange(editor.getHTML() || content);
        }}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
      />
      <style>{`
        .rich-text-editor .ql-container {
          min-height: var(--editor-min-height, 100px);
          font-size: 14px;
          font-family: Helvetica, Arial, sans-serif;
          border-bottom-left-radius: 0.375rem;
          border-bottom-right-radius: 0.375rem;
        }
        .rich-text-editor-snow .ql-toolbar {
          border-top-left-radius: 0.375rem;
          border-top-right-radius: 0.375rem;
          background: #faf8f5;
          padding: 4px 6px;
          display: flex;
          align-items: center;
        }
        .rich-text-editor-snow .ql-toolbar.ql-snow .ql-formats {
          margin-right: 8px;
          display: inline-flex;
          align-items: center;
        }
        .rich-text-editor-snow .ql-toolbar button {
          width: 22px;
          height: 20px;
          padding: 2px 3px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .rich-text-editor-snow .ql-toolbar button svg {
          width: 15px;
          height: 15px;
        }
        .rich-text-editor .ql-editor {
          min-height: var(--editor-min-height, 100px);
          font-family: Helvetica, Arial, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #222;
        }
        .rich-text-editor .ql-editor p {
          margin: 0 0 12px 0;
          line-height: 1.5;
        }
        .rich-text-editor .ql-editor ul,
        .rich-text-editor .ql-editor ol {
          margin: 0 0 16px 18px;
          padding: 0;
        }
        .rich-text-editor .ql-editor li {
          margin: 0 0 8px 0;
        }
        .rich-text-editor .ql-editor a {
          color: #1d4ed8;
          text-decoration: underline;
        }
        .rich-text-editor .ql-editor.ql-blank::before {
          font-style: normal;
          color: #9ca3af;
        }
        /* Link tooltip: a soft card instead of Quill's bare grey strip. */
        /* Our display: flex below would otherwise beat Quill's own hide rule. */
        .rich-text-editor .ql-snow .ql-tooltip.ql-hidden {
          display: none;
        }
        .rich-text-editor .ql-snow .ql-tooltip {
          left: 12px !important;
          right: auto !important;
          transform: none !important;
          z-index: 100;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          width: 340px;
          max-width: calc(100% - 24px);
          padding: 14px 16px;
          border: none;
          border-radius: 14px;
          background: #fff;
          box-shadow:
            0 10px 32px rgba(28, 25, 23, 0.16),
            0 2px 8px rgba(28, 25, 23, 0.08);
          color: #57534e;
          white-space: normal;
          font-family: inherit;
        }
        .rich-text-editor .ql-snow .ql-tooltip::before {
          content: "Link";
          width: 100%;
          margin: 0;
          line-height: 1.4;
          font-size: 14px;
          color: #57534e;
        }
        .rich-text-editor .ql-snow .ql-tooltip.ql-editing[data-selection]::before {
          content: "Link “" attr(data-selection) "”";
        }
        .rich-text-editor .ql-snow .ql-tooltip a.ql-preview {
          flex: 1;
          min-width: 0;
          max-width: none;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 14px;
          color: #1d4ed8;
        }
        .rich-text-editor .ql-snow .ql-tooltip input[type="text"] {
          display: none;
          height: auto;
          padding: 9px 12px;
          border: 1px solid #e7e5e4;
          border-radius: 10px;
          font-size: 14px;
          color: #292524;
        }
        .rich-text-editor .ql-snow .ql-tooltip.ql-editing input[type="text"] {
          display: block;
          flex: 1;
          width: auto;
          min-width: 0;
        }
        .rich-text-editor .ql-snow .ql-tooltip input[type="text"]:focus {
          outline: none;
          border-color: #0f766e;
        }
        .rich-text-editor .ql-snow .ql-tooltip input[type="text"]::placeholder {
          color: #a8a29e;
        }
        .rich-text-editor .ql-snow .ql-tooltip a.ql-action,
        .rich-text-editor .ql-snow .ql-tooltip a.ql-remove {
          font-size: 13px;
          font-weight: 500;
          color: #0f766e;
        }
        .rich-text-editor .ql-snow .ql-tooltip a.ql-action::after {
          content: "Edit";
          margin-left: 0;
          padding-right: 10px;
          border-right: 1px solid #e7e5e4;
        }
        .rich-text-editor .ql-snow .ql-tooltip.ql-editing a.ql-action {
          display: inline-flex;
          align-items: center;
          padding: 9px 18px;
          border-radius: 10px;
          background: #0d9488;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          line-height: 1;
        }
        .rich-text-editor .ql-snow .ql-tooltip.ql-editing a.ql-action:hover {
          background: #0f766e;
        }
        .rich-text-editor .ql-snow .ql-tooltip.ql-editing a.ql-action::after {
          content: "Apply";
          margin-left: 0;
          padding-right: 0;
          border-right: none;
        }
        .rich-text-editor .ql-snow .ql-tooltip.ql-editing::after {
          content: "Enter to apply · Esc to cancel";
          width: 100%;
          font-size: 12.5px;
          color: #a8a29e;
        }
      `}</style>
    </div>
  );
}
