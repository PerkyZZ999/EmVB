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
  inlined = {},
}: {
  html: string;
  css: string;
  canvasStyles: readonly string[];
  origin: string;
  dir?: "ltr" | "rtl";
  /** W-920: stylesheet text by href, read by the editor; a sandboxed frame can't load them. */
  inlined?: Readonly<Record<string, string>>;
}): string {
  const links = canvasStyles
    .map((href) =>
      inlined[href] === undefined
        ? `<link rel="stylesheet" href="${escapeAttr(href)}">`
        : `<style>${cssText(inlined[href])}</style>`,
    )
    .join("");
  return [
    `<!doctype html><html${dir ? ` dir="${dir}"` : ""}><head><meta charset="utf-8">`,
    `<base href="${escapeAttr(origin)}/">`,
    `<style>html,body{margin:0}</style>`,
    links,
    `<style>${cssText(css)}</style></head><body>${html}</body></html>`,
  ].join("");
}

/** `<` is CSS-escaped so a `</style` in the text can't end the element early. */
const cssText = (text: string) => text.replace(/</g, "\\3c ");

/**
 * W-920: the frame is fully sandboxed (no origin), so dev servers and strict hosts refuse its
 * stylesheet requests and the preview fell back to the browser's default type. Same-origin
 * site stylesheets are read here and inlined; others keep their <link>.
 */
export function useInlinedStyles(
  hrefs: readonly string[],
  load: (href: string) => Promise<string | null> = loadStyleText,
): Readonly<Record<string, string>> {
  const [texts, setTexts] = React.useState<Record<string, string>>({});
  const key = hrefs.join("\n");
  React.useEffect(() => {
    let live = true;
    void Promise.all(hrefs.map(async (href) => [href, await load(href)] as const)).then((pairs) => {
      if (!live) return;
      const next: Record<string, string> = {};
      for (const [href, text] of pairs) if (text !== null) next[href] = text;
      setTexts(next);
    });
    return () => {
      live = false;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- keyed on the list's contents.
  }, [key, load]);
  return texts;
}

async function loadStyleText(href: string): Promise<string | null> {
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return null;
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
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
.emvb-field-preview-stage { display: flex; overflow: auto; height: 72vh; margin-top: 12px; padding: 16px; box-sizing: border-box; border: 1px solid var(--color-kumo-line); border-radius: 8px; background: var(--color-kumo-recessed); }
.emvb-field-preview-stage iframe { flex: none; margin: 0 auto; max-width: none; height: 100%; border: 0; border-radius: 6px; background: #fff; box-shadow: 0 0 0 1px var(--color-kumo-line), 0 8px 24px rgb(0 0 0 / 0.18); }
`;
