import { Button, Dialog, Tabs } from "@cloudflare/kumo";
import * as React from "react";
import { DEVICE_PREVIEW_PX, POPUP_DEVICES, type PopupDevice } from "../../core/index.ts";
import { escapeAttr } from "../../core/sanitize/escape.ts";
import { BUTTON, UI_CSS } from "../ui.ts";

const DEVICE_NAMES: Record<PopupDevice, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

/**
 * W-911: the page as the public renderer writes it, for a sandboxed `srcdoc` frame. The CSS is
 * generated, but a `</style` in it would end the element early, so `<` is CSS-escaped.
 */
export function previewDocument({
  html,
  css,
  canvasStyles,
  origin,
  dir,
}: {
  html: string;
  css: string;
  canvasStyles: readonly string[];
  origin: string;
  dir?: "ltr" | "rtl";
}): string {
  const links = canvasStyles
    .map((href) => `<link rel="stylesheet" href="${escapeAttr(href)}">`)
    .join("");
  return [
    `<!doctype html><html${dir ? ` dir="${dir}"` : ""}><head><meta charset="utf-8">`,
    `<base href="${escapeAttr(origin)}/">`,
    links,
    `<style>${css.replace(/</g, "\\3c ")}</style></head><body>${html}</body></html>`,
  ].join("");
}

/** W-911: field mode has no saved draft to preview, so the unsaved layout is shown here. */
export function FieldPreview({
  open,
  onOpenChange,
  device: initialDevice,
  render,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: PopupDevice;
  /** Renders the current layout for a device as a full HTML document. */
  render: (device: PopupDevice) => string | null;
}) {
  const [device, setDevice] = React.useState<PopupDevice>(initialDevice);
  React.useEffect(() => {
    if (open) setDevice(initialDevice);
  }, [open, initialDevice]);
  const doc = open ? render(device) : null;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="xl" className="emvb-field-preview p-4">
        <style>{UI_CSS}</style>
        <style>{PREVIEW_CSS}</style>
        <div data-emvb-dialog="field-preview" className="emvb-dialog">
          <div className="emvb-field-preview-head">
            <div>
              <Dialog.Title>Preview</Dialog.Title>
              <Dialog.Description>
                Your unsaved changes, as the site will show them. Apply, then save the entry, to
                keep them.
              </Dialog.Description>
            </div>
            <Tabs
              variant="segmented"
              size="sm"
              className="emvb-device-tabs"
              tabs={POPUP_DEVICES.map((item) => ({ value: item, label: DEVICE_NAMES[item] }))}
              value={device}
              onValueChange={(next) => {
                if ((POPUP_DEVICES as readonly string[]).includes(next))
                  setDevice(next as PopupDevice);
              }}
            />
            <Button variant="secondary" className={BUTTON} onClick={() => onOpenChange(false)}>
              Back to editing
            </Button>
          </div>
          <div className="emvb-field-preview-stage">
            {doc === null ? (
              <p className="emvb-helper">There is nothing to preview yet.</p>
            ) : (
              <iframe
                title={`Preview (${DEVICE_NAMES[device]})`}
                data-emvb-field-preview={device}
                // No scripts and no same-origin access: the layout is untrusted (D-011).
                sandbox=""
                srcDoc={doc}
                style={{ width: DEVICE_PREVIEW_PX[device] }}
              />
            )}
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}

const PREVIEW_CSS = `
.emvb-field-preview { width: min(1360px, 96vw); max-width: 96vw; }
.emvb-field-preview-head { display: flex; align-items: center; gap: 16px; justify-content: space-between; flex-wrap: wrap; }
.emvb-field-preview-head > div:first-child { flex: 1 1 280px; min-width: 0; }
.emvb-field-preview-stage { display: flex; justify-content: center; overflow: auto; height: 72vh; margin-top: 12px; border: 1px solid var(--color-kumo-line); border-radius: 8px; background: var(--color-kumo-recessed); }
.emvb-field-preview-stage iframe { flex: none; max-width: none; height: 100%; border: 0; background: #fff; }
`;
