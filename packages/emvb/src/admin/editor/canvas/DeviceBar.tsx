import { Tabs } from "@cloudflare/kumo";
import { DesktopIcon, DeviceMobileIcon, DeviceTabletIcon, type Icon } from "@phosphor-icons/react";
import * as React from "react";
import { POPUP_DEVICES, type PopupDevice } from "../../../core/index.ts";

const LABELS: Record<PopupDevice, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

const ICONS: Record<PopupDevice, Icon> = {
  desktop: DesktopIcon,
  tablet: DeviceTabletIcon,
  mobile: DeviceMobileIcon,
};

/** The device's icon (decorative) and its name, which stays the tab's accessible name (W-127). */
function DeviceLabel({ device }: { device: PopupDevice }) {
  const DeviceIcon = ICONS[device];
  return (
    <span className="emvb-device-label">
      <DeviceIcon aria-hidden="true" size={14} />
      {LABELS[device]}
    </span>
  );
}

/** Desktop, tablet or mobile. Desktop edits `style`; the others edit overrides (W-096). */
export function DeviceBar({
  device,
  hidden,
  canHide,
  onDevice,
  onToggleHidden,
}: {
  device: PopupDevice;
  /** Whether the selected element is hidden on `device`. */
  hidden: boolean;
  canHide: boolean;
  onDevice: (device: PopupDevice) => void;
  onToggleHidden: () => void;
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
          tabs={POPUP_DEVICES.map((item) => ({
            value: item,
            label: <DeviceLabel device={item} />,
          }))}
          value={device}
          onValueChange={(next) => {
            if ((POPUP_DEVICES as readonly string[]).includes(next)) onDevice(next as PopupDevice);
          }}
        />
      </div>
      <label className="emvb-device-hide">
        <input type="checkbox" checked={hidden} disabled={!canHide} onChange={onToggleHidden} />
        Hide on {LABELS[device].toLowerCase()}
      </label>
    </div>
  );
}
