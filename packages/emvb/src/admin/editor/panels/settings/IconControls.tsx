import { Button, Select } from "@cloudflare/kumo";
import { FlipHorizontalIcon, FlipVerticalIcon, PlusIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { DesignSystem, StyleProps } from "../../../../core/index.ts";
import { BUTTON, FIELD } from "../../../ui.ts";
import { ColorControl } from "../ColorControl.tsx";
import { NumberField, ResetButton, type NumberSpec } from "./NumberRow.tsx";

/** W-237: the Icon section's own controls (glyph rotation, flip, drop shadow, loop). */

type Flip = NonNullable<StyleProps["iconFlip"]>;
type IconShadow = NonNullable<StyleProps["iconShadow"]>;
type IconAnimation = NonNullable<StyleProps["iconAnimation"]>;

const ICON_ROTATE: NumberSpec = {
  min: -360,
  max: 360,
  integer: true,
  example: "45",
  suffix: "°",
  placeholder: "0",
};
export const ICON_SCALE: NumberSpec = {
  min: 0.1,
  max: 4,
  example: "1.2",
  suffix: "×",
  placeholder: "1",
};
export const ICON_STROKE: NumberSpec = { min: 0.25, max: 6, example: "1.5", placeholder: "2" };

/** Rotation in degrees: a number field over a -360…360 slider. */
export function IconRotateRow({
  value,
  inherited,
  onChange,
}: {
  value: number | undefined;
  inherited?: number;
  onChange: (next: number | undefined) => void;
}) {
  const set = value !== undefined;
  return (
    <div
      className="emvb-style-row"
      data-emvb-style="iconRotate"
      data-set={set ? "true" : undefined}
      data-inherited={!set && inherited !== undefined ? "true" : undefined}
    >
      <div className="emvb-length-stack">
        <NumberField
          fieldKey="iconRotate"
          label="Rotate"
          value={value}
          spec={ICON_ROTATE}
          inherited={inherited}
          onCommit={onChange}
        />
        <input
          className="emvb-gap-slider"
          type="range"
          min={-360}
          max={360}
          step={1}
          aria-label="Rotate slider"
          value={value ?? inherited ?? 0}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
      <ResetButton label="Rotate" set={set} onReset={() => onChange(undefined)} />
    </div>
  );
}

const flipParts = (flip: Flip | undefined) => ({
  h: flip === "horizontal" || flip === "both",
  v: flip === "vertical" || flip === "both",
});

/** Two toggles stored as one value; both off saves `none` so a device can undo Desktop's flip. */
export function IconFlipRow({
  value,
  inherited,
  onChange,
}: {
  value: Flip | undefined;
  inherited?: Flip;
  onChange: (next: Flip | undefined) => void;
}) {
  const set = value !== undefined;
  const { h, v } = flipParts(value ?? inherited);
  const pick = (nextH: boolean, nextV: boolean) =>
    onChange(nextH && nextV ? "both" : nextH ? "horizontal" : nextV ? "vertical" : "none");
  return (
    <div
      className="emvb-style-row"
      data-emvb-style="iconFlip"
      data-set={set ? "true" : undefined}
      data-inherited={!set && inherited !== undefined ? "true" : undefined}
    >
      <div className="emvb-choice">
        <span className="emvb-choice-label">Flip</span>
        <div className="emvb-choice-group" role="group" aria-label="Flip">
          <button
            type="button"
            aria-pressed={h}
            aria-label="Flip horizontal"
            title="Flip horizontal"
            data-emvb-flip="horizontal"
            onClick={() => pick(!h, v)}
          >
            <FlipHorizontalIcon size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={v}
            aria-label="Flip vertical"
            title="Flip vertical"
            data-emvb-flip="vertical"
            onClick={() => pick(h, !v)}
          >
            <FlipVerticalIcon size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <ResetButton label="Flip" set={set} onReset={() => onChange(undefined)} />
    </div>
  );
}

/** Add drop shadow starts at 0 2 4, 25 % black: soft, and it follows the glyph's outline. */
const NEW_ICON_SHADOW: IconShadow = { x: 0, y: 2, blur: 4, color: "#00000040" };
const SHADOW_OFFSET: NumberSpec = { min: -100, max: 100, example: "2" };
const ICON_SHADOW_FIELDS: ReadonlyArray<[key: "x" | "y" | "blur", label: string, NumberSpec]> = [
  ["x", "Horizontal", SHADOW_OFFSET],
  ["y", "Vertical", SHADOW_OFFSET],
  ["blur", "Blur", { min: 0, max: 100, example: "4" }],
];

export function IconShadowControl({
  value,
  design,
  onChange,
  onDesignChange,
}: {
  value: IconShadow | undefined;
  design: DesignSystem;
  onChange: (next: IconShadow | undefined) => void;
  onDesignChange: (design: DesignSystem) => Promise<void>;
}) {
  const patch = (part: Partial<IconShadow>) => {
    if (!value) return;
    const next: Record<string, unknown> = { ...value, ...part };
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    onChange(next as IconShadow);
  };
  return (
    <div
      className="emvb-style-row"
      data-emvb-style="iconShadow"
      data-set={value ? "true" : undefined}
    >
      <div className="emvb-field-group emvb-shadow">
        <span className="emvb-var-field-label">Drop shadow</span>
        {value ? (
          <>
            <ColorControl
              label="Drop shadow color"
              value={value.color}
              design={design}
              onChange={(color) => patch({ color })}
              onDesignChange={onDesignChange}
            />
            <div className="emvb-shadow-grid">
              {ICON_SHADOW_FIELDS.map(([key, label, spec]) => (
                <NumberField
                  key={key}
                  fieldKey={`iconShadow.${key}`}
                  label={label}
                  value={value[key]}
                  spec={spec}
                  onCommit={(n) => patch({ [key]: n ?? 0 })}
                />
              ))}
            </div>
          </>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className={`${BUTTON} emvb-add-shadow`}
            icon={<PlusIcon aria-hidden="true" />}
            onClick={() => onChange(NEW_ICON_SHADOW)}
          >
            Add drop shadow
          </Button>
        )}
      </div>
      <ResetButton
        label="Drop shadow"
        set={value !== undefined}
        onReset={() => onChange(undefined)}
      />
    </div>
  );
}

const DURATION: NumberSpec = {
  min: 200,
  max: 10_000,
  integer: true,
  example: "2000",
  suffix: "ms",
};
const DEFAULT_DURATION: Record<IconAnimation["type"], number> = { spin: 2000, pulse: 1000 };

/** A looping spin or pulse (Normal only); visitors who prefer reduced motion see it still. */
export function IconAnimationControl({
  value,
  onChange,
}: {
  value: IconAnimation | undefined;
  onChange: (next: IconAnimation | undefined) => void;
}) {
  const [type, setType] = React.useState<string>(value?.type ?? "none");
  React.useEffect(() => setType(value?.type ?? "none"), [value?.type]);
  return (
    <div
      className="emvb-style-row"
      data-emvb-style="iconAnimation"
      data-set={value ? "true" : undefined}
    >
      <div className="emvb-field-group">
        <Select
          label="Animation"
          className={FIELD}
          value={type}
          onValueChange={(next) => {
            const picked = String(next);
            setType(picked);
            if (picked === "spin" || picked === "pulse") {
              onChange({ type: picked, duration: value?.duration ?? DEFAULT_DURATION[picked] });
            } else onChange(undefined);
          }}
        >
          <Select.Option value="none">None</Select.Option>
          <Select.Option value="spin">Spin</Select.Option>
          <Select.Option value="pulse">Pulse</Select.Option>
        </Select>
        {value && (
          <NumberField
            fieldKey="iconAnimation.duration"
            label="Duration"
            value={value.duration}
            spec={DURATION}
            onCommit={(n) => onChange({ ...value, duration: n ?? DEFAULT_DURATION[value.type] })}
          />
        )}
        {value && <p className="emvb-helper">Off for visitors who prefer reduced motion.</p>}
      </div>
      <ResetButton
        label="Animation"
        set={value !== undefined}
        onReset={() => onChange(undefined)}
      />
    </div>
  );
}
