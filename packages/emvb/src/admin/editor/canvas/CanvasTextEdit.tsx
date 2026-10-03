import * as React from "react";
import { commitPlainText } from "../../../core/index.ts";
import type { Box } from "./SelectionOverlay.tsx";

/** Edits one element's plain text over its canvas box (W-097). The iframe stays script-free. */
export function CanvasTextEdit({
  element,
  box,
  text,
  multiline,
  onCommit,
  onCancel,
}: {
  element: Element;
  box: Box;
  text: string;
  multiline: boolean;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  // W-117: read the element's look once, before it is marked as editing. Computed style is live,
  // and the canvas makes an editing element's text transparent, so reading it on a later render
  // (every keystroke) gave the field transparent text.
  const look = React.useMemo(() => {
    const computed = element.ownerDocument.defaultView?.getComputedStyle(element);
    return {
      font: computed?.font,
      color: computed?.color,
      textAlign: computed?.textAlign as React.CSSProperties["textAlign"],
      letterSpacing: computed?.letterSpacing,
      lineHeight: computed?.lineHeight,
      padding: computed?.padding,
    };
  }, [element]);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const done = React.useRef(false);
  const [draft, setDraft] = React.useState(text);

  React.useLayoutEffect(() => {
    element.setAttribute("data-emvb-editing", "");
    // The double-click that opened the field also selected a word on the canvas; clear it, or its
    // highlight shows through the transparent field.
    element.ownerDocument.getSelection()?.removeAllRanges();
    const field = ref.current;
    field?.focus();
    const end = field?.value.length ?? 0;
    field?.setSelectionRange(end, end);
    return () => element.removeAttribute("data-emvb-editing");
  }, [element]);

  const finish = (next: string | null) => {
    if (done.current) return;
    done.current = true;
    if (next === null || next === text) onCancel();
    else onCommit(next);
  };

  return (
    <textarea
      ref={ref}
      className="emvb-canvas-text"
      aria-label="Edit text"
      rows={1}
      spellCheck
      value={draft}
      style={{
        top: box.top,
        left: box.left,
        width: box.width,
        height: Math.max(box.height, 20),
        ...look,
      }}
      onChange={(event) => setDraft(commitPlainText(event.target.value, multiline))}
      onBlur={() => finish(commitPlainText(draft, multiline))}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
        } else if (event.key === "Enter" && !multiline) {
          event.preventDefault();
          finish(commitPlainText(draft, false));
        }
      }}
    />
  );
}
