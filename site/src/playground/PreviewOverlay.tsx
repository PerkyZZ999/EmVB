import { Button } from "@cloudflare/kumo";
import {
  ArrowSquareOutIcon,
  DesktopIcon,
  DeviceMobileIcon,
  DeviceTabletIcon,
  XIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import { BUTTON } from "../../../packages/emvb/src/admin/ui.ts";
import { DEVICE_PREVIEW_PX } from "../../../packages/emvb/src/core/index.ts";
import { VIEW_PATH } from "./mock/backend.ts";

/** What the view page posts when Escape is pressed inside it (see view-client.ts). */
const CLOSE_VIEW_MESSAGE = "emvb-playground:close-view";

type Device = "desktop" | "tablet" | "mobile";
type Version = "draft" | "published";

const DEVICES = [
  { id: "desktop", label: "Desktop", icon: DesktopIcon },
  { id: "tablet", label: `Tablet (${DEVICE_PREVIEW_PX.tablet} px)`, icon: DeviceTabletIcon },
  { id: "mobile", label: `Mobile (${DEVICE_PREVIEW_PX.mobile} px)`, icon: DeviceMobileIcon },
] as const;

export const viewUrl = (entryId: string, version: Version, embed = true) => {
  const params = new URLSearchParams({ entry: entryId });
  if (version === "draft") params.set("draft", "1");
  if (embed) params.set("embed", "1");
  return `${VIEW_PATH}?${params}`;
};

/**
 * The page as a visitor would get it: the playground's view page, which renders the saved state
 * with EmVB's public renderer. The saved draft or the published version, at a device width.
 */
export function PreviewOverlay({
  entryId,
  published,
  onClose,
}: {
  entryId: string;
  published: boolean;
  onClose: () => void;
}) {
  const [version, setVersion] = React.useState<Version>(published ? "published" : "draft");
  const [device, setDevice] = React.useState<Device>("desktop");
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    rootRef.current?.querySelector<HTMLButtonElement>("[data-pg-close]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === CLOSE_VIEW_MESSAGE)
        onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("message", onMessage);
    };
  }, [onClose]);

  const width = device === "desktop" ? "100%" : `${DEVICE_PREVIEW_PX[device]}px`;

  return (
    <div
      className="pg-preview"
      role="dialog"
      aria-modal="true"
      aria-label="Page view"
      data-pg-preview=""
    >
      <div className="pg-preview-bar">
        <div className="pg-segment" role="radiogroup" aria-label="Version">
          {(["draft", "published"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={version === v}
              disabled={v === "published" && !published}
              title={v === "published" && !published ? "Publish the page first" : undefined}
              onClick={() => setVersion(v)}
            >
              {v === "draft" ? "Saved draft" : "Published"}
            </button>
          ))}
        </div>
        <div className="pg-segment" role="radiogroup" aria-label="Device">
          {DEVICES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={device === id}
              aria-label={label}
              title={label}
              onClick={() => setDevice(id)}
            >
              <Icon size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
        <p className="pg-preview-note">
          Rendered in your browser by EmVB's public renderer: plain HTML and CSS.
        </p>
        <a
          className="pg-preview-open"
          href={viewUrl(entryId, version, false)}
          target="_blank"
          rel="noopener"
        >
          <ArrowSquareOutIcon size={16} aria-hidden="true" /> Open in a new tab
        </a>
        <Button
          data-pg-close=""
          variant="secondary"
          className={BUTTON}
          icon={<XIcon aria-hidden="true" />}
          onClick={onClose}
        >
          Close
        </Button>
      </div>
      <div className="pg-preview-stage">
        <iframe
          key={`${version}:${device}`}
          title={version === "draft" ? "Saved draft of the page" : "Published page"}
          src={viewUrl(entryId, version)}
          style={{ width }}
          data-device={device}
        />
      </div>
    </div>
  );
}
