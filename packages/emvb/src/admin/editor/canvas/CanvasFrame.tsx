import * as React from "react";
import { createPortal } from "react-dom";
import type { VNode } from "../../../core/index.ts";
import { vnodeToReact } from "./vnode-react.tsx";

const SRCDOC =
  '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}</style></head><body></body></html>';

/**
 * The canvas: a sandboxed `srcdoc` iframe without `allow-scripts` (D-011, D-014), so admin CSS
 * stays out, page CSS stays in, and nothing runs inside it. React renders into its document
 * through a portal. It fills the space between the panels, with no zoom or virtual width (D-025).
 */
export function CanvasFrame({ vnode, css }: { vnode: VNode | null; css: string }) {
  const frame = React.useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = React.useState<Document | null>(null);

  const onLoad = React.useCallback(() => {
    const loaded = frame.current?.contentDocument;
    if (loaded?.body) setDoc(loaded);
  }, []);

  return (
    <>
      <iframe
        ref={frame}
        title="Page canvas"
        data-emvb-canvas=""
        srcDoc={SRCDOC}
        sandbox="allow-same-origin"
        onLoad={onLoad}
      />
      {doc && createPortal(<style data-emvb-canvas-css="">{css}</style>, doc.head)}
      {doc && vnode && createPortal(vnodeToReact(vnode), doc.body)}
    </>
  );
}
