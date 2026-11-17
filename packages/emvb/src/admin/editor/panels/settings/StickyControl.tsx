import type * as React from "react";
import type { DesignSystem, FlatStyleProps } from "../../../../core/index.ts";
import { ColorControl } from "../ColorControl.tsx";
import { HintedSwitch } from "./HintedSwitch.tsx";
import { NumberField, type NumberSpec } from "./NumberRow.tsx";

type Sticky = NonNullable<FlatStyleProps["stickyMotion"]>;
type Effects = Extract<Sticky, { hide?: unknown }>;

const DISTANCE: NumberSpec = { min: 10, max: 2000, integer: true, example: "120", suffix: "px" };
const PADDING: NumberSpec = { min: 0, max: 400, integer: true, example: "8", suffix: "px" };

/** The effects, or undefined when none is left (an empty record would be refused). */
function tidy(next: Effects): Sticky | undefined {
  const { distance, background, shadow, padding, hide } = next;
  const kept: Effects = {
    ...(distance !== undefined ? { distance } : {}),
    ...(background !== undefined ? { background } : {}),
    ...(shadow ? { shadow } : {}),
    ...(padding !== undefined ? { padding } : {}),
    ...(hide ? { hide } : {}),
  };
  const any =
    kept.background !== undefined || kept.shadow || kept.padding !== undefined || kept.hide;
  return any ? kept : undefined;
}

/**
 * W-1070: "When the page scrolls" in Position: how a sticky header looks once the page has
 * scrolled, and whether it slides away while scrolling down.
 */
export function StickyControl({
  value,
  design,
  onChange,
  onDesignChange,
  reset,
}: {
  value: Sticky | undefined;
  design: DesignSystem;
  onChange: (next: Sticky | undefined) => void;
  onDesignChange: (design: DesignSystem) => Promise<void>;
  reset: React.ReactNode;
}) {
  const current: Effects = value && !("type" in value) ? value : {};
  const set = (patch: Partial<Effects>) => onChange(tidy({ ...current, ...patch }));
  const padding = current.padding;
  const paddingPx =
    padding && typeof padding === "object" && "unit" in padding && padding.unit === "px"
      ? padding.value
      : undefined;
  return (
    <div className="emvb-style-row emvb-sticky-control" data-emvb-style="stickyMotion">
      <p className="emvb-field-label">When the page scrolls</p>
      <HintedSwitch
        label="Hide while scrolling down"
        checked={current.hide === true}
        onCheckedChange={(hide) => set({ hide })}
        hint="It slides back as soon as the visitor scrolls up, and stays while focus is in it."
      />
      <ColorControl
        label="Background once scrolled"
        value={current.background}
        design={design}
        onChange={(background) => set({ background })}
        onDesignChange={onDesignChange}
      />
      <HintedSwitch
        label="Shadow once scrolled"
        checked={current.shadow === true}
        onCheckedChange={(shadow) => set({ shadow })}
      />
      <NumberField
        fieldKey="stickyPadding"
        label="Top and bottom padding once scrolled"
        value={paddingPx}
        spec={PADDING}
        onCommit={(px) =>
          set({ padding: px === undefined ? undefined : { value: px, unit: "px" } })
        }
      />
      <NumberField
        fieldKey="stickyDistance"
        label="Changes over the first"
        value={current.distance}
        spec={DISTANCE}
        inherited={120}
        onCommit={(distance) => set({ distance })}
      />
      <p className="emvb-helper">
        Browsers without scroll-driven animations, and visitors who prefer reduced motion, see it as
        it is.
      </p>
      {reset}
    </div>
  );
}
