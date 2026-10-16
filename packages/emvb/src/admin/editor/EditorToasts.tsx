import { Toasty, type createKumoToastManager } from "@cloudflare/kumo";
import * as React from "react";

/** Keeps toast ownership outside the full-screen editor's stacking context. */
export function EditorToasts({
  toastManager,
  children,
}: {
  toastManager: ReturnType<typeof createKumoToastManager>;
  children: React.ReactNode;
}) {
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null);
  React.useLayoutEffect(() => {
    const element = document.createElement("div");
    element.setAttribute("data-emvb-toasts", "");
    document.body.append(element);
    setContainer(element);
    return () => element.remove();
  }, []);

  return container ? (
    <Toasty container={container} toastManager={toastManager}>
      {children}
    </Toasty>
  ) : null;
}
