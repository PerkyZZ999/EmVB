/**
 * Focuses the selected layer or the canvas if focus ends up on <body>. A closing dialog keeps
 * focus until its close animation ends, so wait (up to 2 s) while focus is still in a dialog;
 * other dialog-like layers (toasts) don't hold it up. Returns a cancel.
 */
export function focusWhenLost(): () => void {
  const started = Date.now();
  let timer: number | undefined;
  const settle = () => {
    const now = document.activeElement;
    if (now && now !== document.body) {
      const inDialog = now.closest('[role="dialog"], [role="alertdialog"]') !== null;
      if (inDialog && Date.now() - started < 2000) timer = window.setTimeout(settle, 30);
      return;
    }
    const target =
      document.querySelector<HTMLElement>('.emvb-layer-select[aria-current="true"]') ??
      document.querySelector<HTMLElement>("iframe[data-emvb-canvas]");
    target?.focus({ preventScroll: true });
  };
  timer = window.setTimeout(settle, 30);
  return () => window.clearTimeout(timer);
}
