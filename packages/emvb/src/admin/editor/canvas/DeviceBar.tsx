import { Button, Tabs } from "@cloudflare/kumo";
import {
  DesktopIcon,
  DeviceMobileIcon,
  DeviceTabletIcon,
  type Icon,
  LaptopIcon,
  MonitorIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import { EDITOR_DEVICES, type EditorDevice } from "../../../core/index.ts";

const LABELS: Record<EditorDevice, string> = {
  wide: "Wide screen",
  desktop: "Desktop",
  laptop: "Laptop",
  tablet: "Tablet",
  mobile: "Mobile",
};

const ICONS: Record<EditorDevice, Icon> = {
  wide: MonitorIcon,
  desktop: DesktopIcon,
  laptop: LaptopIcon,
  tablet: DeviceTabletIcon,
  mobile: DeviceMobileIcon,
};

/** The device's icon (decorative) and its name, which stays the tab's accessible name (W-127). */
function DeviceLabel({ device }: { device: EditorDevice }) {
  const DeviceIcon = ICONS[device];
  return (
    <span className="emvb-device-label">
      <DeviceIcon aria-hidden="true" size={14} />
      {LABELS[device]}
    </span>
  );
}

/** Wide screen (W-959), desktop, laptop, tablet or mobile. Desktop edits `style`; the others edit overrides (W-096). */
export function DeviceBar({
  device,
  hidden,
  canHide,
  hideLabel,
  inherited = false,
  onDevice,
  onToggleHidden,
  zoom = "fit",
  scale = 1,
  onZoom,
}: {
  device: EditorDevice;
  /** Whether the selected element is hidden on `device`. */
  hidden: boolean;
  canHide: boolean;
  /** From the hide-on-device command, so the checkbox wording has one source. */
  hideLabel: string;
  /** W-959: Wide screen's hide still follows Desktop (no choice of its own yet). */
  inherited?: boolean;
  onDevice: (device: EditorDevice) => void;
  onToggleHidden: () => void;
  /** Fit or 100% (W-158), with the current on-screen scale for the readout. */
  zoom?: "fit" | "actual";
  scale?: number;
  onZoom?: (zoom: "fit" | "actual") => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current?.querySelector('[role="tablist"]')?.setAttribute("aria-label", "Device");
  });
  return (
    <div className="emvb-device-bar" data-emvb-device={device}>
      <div ref={ref}>
        <Tabs
          variant="segmented"
          size="sm"
          className="emvb-device-tabs"
          tabs={EDITOR_DEVICES.map((item) => ({
            value: item,
            label: <DeviceLabel device={item} />,
          }))}
          value={device}
          onValueChange={(next) => {
            if ((EDITOR_DEVICES as readonly string[]).includes(next))
              onDevice(next as EditorDevice);
          }}
        />
      </div>
      <label className="emvb-device-hide">
        <input type="checkbox" checked={hidden} disabled={!canHide} onChange={onToggleHidden} />
        {hideLabel}
        {inherited && (
          <span className="emvb-helper" data-emvb-hide-inherited="">
            {" "}
            (follows Desktop)
          </span>
        )}
      </label>
      {onZoom && (
        <Button
          variant="ghost"
          size="sm"
          className="emvb-zoom"
          aria-pressed={zoom === "fit"}
          aria-label={`Fit to canvas (${Math.round(scale * 100)}%)`}
          title={zoom === "fit" ? "Scaled to fit. Show at 100%" : "At 100%. Scale to fit"}
          onClick={() => onZoom(zoom === "fit" ? "actual" : "fit")}
        >
          {zoom === "fit" ? `Fit · ${Math.round(scale * 100)}%` : "100%"}
        </Button>
      )}
    </div>
  );
}
