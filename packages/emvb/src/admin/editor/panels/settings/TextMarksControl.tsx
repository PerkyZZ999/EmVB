import { Button, Checkbox, Input } from "@cloudflare/kumo";
import { LinkSimpleIcon, TextBIcon, TextItalicIcon, XIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  hasFormat,
  type LayoutNode,
  MAX_TEXT_MARKS,
  type MarkFormat,
  sanitizeHref,
  setFormat,
  type TextMark,
  unsetFormat,
} from "../../../../core/index.ts";
import { BUTTON, FIELD } from "../../../ui.ts";
import { propsOf, withProp } from "./node-props.ts";

type Range = { start: number; end: number };

/** The element's Text field, next to this control in the panel. */
function textField(from: HTMLElement | null): HTMLInputElement | HTMLTextAreaElement | null {
  const scope =
    from?.closest("[data-emvb-fields]") ?? from?.parentElement?.parentElement ?? document;
  const holder = scope.querySelector('[data-emvb-field="text"]');
  if (holder instanceof HTMLInputElement || holder instanceof HTMLTextAreaElement) return holder;
  return holder?.querySelector("textarea, input") ?? null;
}

/** Buttons keep the Text field's selection: pressing one doesn't move focus there first. */
const keep = (event: React.MouseEvent) => event.preventDefault();

const describe = (mark: TextMark): string =>
  [
    mark.bold ? "Bold" : null,
    mark.italic ? "Italic" : null,
    typeof mark.color === "string" ? `Colour ${mark.color}` : mark.color ? "Colour" : null,
    mark.href ? `Link ${mark.href}${mark.newTab ? " (new tab)" : ""}` : null,
  ]
    .filter(Boolean)
    .join(", ");

/**
 * Formatting (W-950): bold, italic, colour and links on the words selected in the Text field.
 * The text stays plain; each format is a range over it, listed below with a Remove button.
 */
export function TextMarksControl({
  node,
  onChange,
}: {
  node: LayoutNode;
  onChange: (node: LayoutNode) => void;
}) {
  const props = propsOf(node);
  const text = typeof props["text"] === "string" ? props["text"] : "";
  const marks = Array.isArray(props["marks"]) ? (props["marks"] as TextMark[]) : [];
  const ref = React.useRef<HTMLDivElement>(null);
  const colorRef = React.useRef<HTMLInputElement>(null);
  const [message, setMessage] = React.useState<string>();
  const [linkFor, setLinkFor] = React.useState<Range>();
  const [href, setHref] = React.useState("");
  const [newTab, setNewTab] = React.useState(false);
  const linkedHeading = node.type === "heading" && typeof props["href"] === "string";

  /** The selected words, or a message saying why there are none. */
  const selection = (): Range | undefined => {
    const field = textField(ref.current);
    if (!field) return undefined;
    if (field.value !== text) {
      setMessage("Finish editing the text first (press Enter or leave the field).");
      return undefined;
    }
    const start = field.selectionStart ?? 0;
    const end = field.selectionEnd ?? 0;
    if (end <= start) {
      setMessage("Select some words in the Text field first.");
      return undefined;
    }
    setMessage(undefined);
    return { start, end };
  };

  const save = (next: TextMark[]) => {
    if (next.length > MAX_TEXT_MARKS) {
      setMessage(`A text can have up to ${MAX_TEXT_MARKS} formatted parts.`);
      return;
    }
    onChange(withProp(node, "marks", next.length > 0 ? next : undefined));
  };

  const toggle = (format: Extract<MarkFormat, "bold" | "italic">) => {
    const range = selection();
    if (!range) return;
    save(
      hasFormat(marks, range.start, range.end, format)
        ? unsetFormat(marks, range.start, range.end, format)
        : setFormat(marks, range.start, range.end, { [format]: true }),
    );
  };

  // A colour is applied when the picker closes, not on every step of a drag.
  React.useEffect(() => {
    const input = colorRef.current;
    if (!input) return;
    const apply = () => {
      const range = selection();
      if (range) save(setFormat(marks, range.start, range.end, { color: input.value }));
    };
    input.addEventListener("change", apply);
    return () => input.removeEventListener("change", apply);
  });

  const applyLink = () => {
    if (!linkFor) return;
    const safe = sanitizeHref(href.trim());
    if (!safe) {
      setMessage("Enter a link such as /contact or https://example.com.");
      return;
    }
    save(
      setFormat(marks, linkFor.start, linkFor.end, {
        href: safe,
        ...(newTab ? { newTab: true } : {}),
      }),
    );
    setLinkFor(undefined);
  };

  const clear = () => {
    const range = selection();
    if (!range) return;
    let next = marks;
    for (const format of ["bold", "italic", "color", "href"] as const)
      next = unsetFormat(next, range.start, range.end, format);
    save(next);
  };

  return (
    <div ref={ref} className="emvb-marks" data-emvb-field="marks">
      <span className="emvb-import-label">Formatting</span>
      <div className="emvb-marks-bar" role="toolbar" aria-label="Formatting">
        <Button
          type="button"
          variant="secondary"
          className={BUTTON}
          aria-label="Bold"
          icon={<TextBIcon aria-hidden="true" />}
          onMouseDown={keep}
          onClick={() => toggle("bold")}
        />
        <Button
          type="button"
          variant="secondary"
          className={BUTTON}
          aria-label="Italic"
          icon={<TextItalicIcon aria-hidden="true" />}
          onMouseDown={keep}
          onClick={() => toggle("italic")}
        />
        <label className="emvb-marks-color">
          <span className="emvb-helper">Colour</span>
          <input ref={colorRef} type="color" aria-label="Colour" defaultValue="#000000" />
        </label>
        {!linkedHeading && (
          <Button
            type="button"
            variant="secondary"
            className={BUTTON}
            aria-label="Link"
            icon={<LinkSimpleIcon aria-hidden="true" />}
            onMouseDown={keep}
            onClick={() => {
              const range = selection();
              if (!range) return;
              setLinkFor(range);
              setHref("");
              setNewTab(false);
            }}
          />
        )}
        <Button
          type="button"
          variant="secondary"
          className={BUTTON}
          onMouseDown={keep}
          onClick={clear}
        >
          Clear
        </Button>
      </div>
      {linkFor && (
        <div className="emvb-marks-link" data-emvb-marks-link="">
          <Input
            label={`Link for "${text.slice(linkFor.start, linkFor.end)}"`}
            className={FIELD}
            value={href}
            placeholder="/contact"
            onChange={(event) => setHref(event.target.value)}
          />
          <Checkbox
            label="Open in a new tab"
            checked={newTab}
            onCheckedChange={(checked: boolean) => setNewTab(checked)}
          />
          <div className="emvb-marks-bar">
            <Button type="button" variant="primary" className={BUTTON} onClick={applyLink}>
              Apply link
            </Button>
            <Button
              type="button"
              variant="secondary"
              className={BUTTON}
              onClick={() => setLinkFor(undefined)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      <p className="emvb-helper" role="status">
        {message ?? "Select words in the Text field, then choose a format."}
      </p>
      {marks.length > 0 && (
        <ul className="emvb-marks-list" aria-label="Formatted words">
          {marks.map((mark, index) => (
            <li key={`${mark.start}-${mark.end}-${index}`}>
              <span>
                <strong>“{text.slice(mark.start, mark.end) || "…"}”</strong> {describe(mark)}
              </span>
              <Button
                type="button"
                variant="ghost"
                className={BUTTON}
                aria-label={`Remove formatting from "${text.slice(mark.start, mark.end)}"`}
                icon={<XIcon aria-hidden="true" />}
                onClick={() => save(marks.filter((_, i) => i !== index))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
