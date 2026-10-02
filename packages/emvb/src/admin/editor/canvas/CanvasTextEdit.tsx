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
  const view = element.ownerDocument.defaultView;
  const computed = view?.getComputedStyle(element);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const done = React.useRef(false);
  const [draft, setDraft] = React.useState(text);

  React.useLayoutEffect(() => {
    element.setAttribute("data-emvb-editing", "");
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
        font: computed?.font,
        color: computed?.color,
        textAlign: computed?.textAlign as React.CSSProperties["textAlign"],
        letterSpacing: computed?.letterSpacing,
        lineHeight: computed?.lineHeight,
        padding: computed?.padding,
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
