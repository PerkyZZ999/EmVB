import { Tabs } from "@cloudflare/kumo";
import * as React from "react";
import { POPUP_DEVICES, type PopupDevice } from "../../../core/index.ts";

const LABELS: Record<PopupDevice, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

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
          tabs={POPUP_DEVICES.map((item) => ({ value: item, label: LABELS[item] }))}
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
