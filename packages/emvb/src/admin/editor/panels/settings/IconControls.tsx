import { Button, Select, Switch } from "@cloudflare/kumo";
import {
  FlipHorizontalIcon,
  FlipVerticalIcon,
  PlusIcon,
  ProhibitIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import type { DesignSystem, StyleProps } from "../../../../core/index.ts";
import { BUTTON, FIELD } from "../../../ui.ts";
import { ColorControl } from "../ColorControl.tsx";
import { radioGroupKeys } from "./ChoiceGroup.tsx";
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
const ANIMATION_LABELS: Record<string, string> = { none: "None", spin: "Spin", pulse: "Pulse" };

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
          renderValue={(v: unknown) => ANIMATION_LABELS[String(v)] ?? "None"}
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

/** W-238: Force single colour, a content prop shown under Colour for multi-colour SVGs. */
export function IconSingleColorRow({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="emvb-field-group" data-emvb-icon-single-color="">
      <Switch label="Force single color" checked={checked} onCheckedChange={onChange} />
      <p className="emvb-helper">
        {checked
          ? "Every part of this SVG uses the icon color, so details drawn over filled shapes can disappear."
          : "This SVG keeps its own colors. Turn on to paint it in the icon color."}
      </p>
    </div>
  );
}

type IconShape = "none" | "circle" | "rounded" | "square";

const SHAPE_PADDING = { value: 12, unit: "px" } as const;
/** A light neutral, so the default icon colour (the text colour) reads on it. */
const SHAPE_BACKGROUND = "#f1f5f9";
const SHAPE_RADIUS: Record<Exclude<IconShape, "none">, StyleProps["borderRadius"]> = {
  circle: { value: 50, unit: "%" },
  rounded: { value: 12, unit: "px" },
  square: { value: 0, unit: "px" },
};
const PADDINGS = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"] as const;
const CORNERS = [
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
] as const;

/** The shape the styles in effect make: a background or border, and the corner radius. */
function iconShapeOf(style: StyleProps | undefined): IconShape {
  if (!style || (style.backgroundColor === undefined && style.borderWidth === undefined))
    return "none";
  const radius = style.borderRadius;
  if (radius && typeof radius === "object" && "value" in radius) {
    if (radius.unit === "%" && radius.value >= 50) return "circle";
    if (radius.value === 0) return "square";
    return "rounded";
  }
  return radius === undefined ? "square" : "rounded";
}

/**
 * The patch a shape choice makes (Elementor's Shape: None, Circle, Rounded, Square). A shape
 * keeps a background or border already set, and adds 12 px padding only where none is set.
 * None clears the background, radius and padding it would have added.
 */
function iconShapePatch(shape: IconShape, style: StyleProps | undefined): Partial<StyleProps> {
  const patch: Partial<StyleProps> = {};
  for (const corner of CORNERS) if (style?.[corner] !== undefined) patch[corner] = undefined;
  if (shape === "none") {
    patch.backgroundColor = undefined;
    patch.borderRadius = undefined;
    for (const side of PADDINGS) patch[side] = undefined;
    return patch;
  }
  if (style?.backgroundColor === undefined && style?.borderWidth === undefined)
    patch.backgroundColor = SHAPE_BACKGROUND;
  patch.borderRadius = SHAPE_RADIUS[shape];
  if (PADDINGS.every((side) => style?.[side] === undefined))
    for (const side of PADDINGS) patch[side] = SHAPE_PADDING;
  return patch;
}

const SHAPES: { value: IconShape; label: string }[] = [
  { value: "none", label: "None" },
  { value: "circle", label: "Circle" },
  { value: "rounded", label: "Rounded square" },
  { value: "square", label: "Square" },
];

/** Background shape presets; colour, padding and border stay editable in their sections. */
export function IconShapeRow({
  style,
  inherited,
  onPatch,
}: {
  style: StyleProps | undefined;
  inherited?: StyleProps;
  onPatch: (patch: Partial<StyleProps>) => void;
}) {
  const effective = { ...inherited, ...style };
  const current = iconShapeOf(effective);
  const keys = radioGroupKeys(
    SHAPES.map((shape) => shape.value),
    current,
    (value) => onPatch(iconShapePatch(value as IconShape, effective)),
  );
  return (
    <div className="emvb-style-row" data-emvb-icon-shape={current}>
      <div className="emvb-choice">
        <span className="emvb-choice-label" id="emvb-icon-shape-label">
          Shape
        </span>
        <div
          className="emvb-choice-group"
          role="radiogroup"
          aria-labelledby="emvb-icon-shape-label"
          onKeyDown={keys.onKeyDown}
        >
          {SHAPES.map((shape) => (
            <button
              key={shape.value}
              type="button"
              role="radio"
              aria-checked={current === shape.value}
              aria-label={shape.label}
              title={shape.label}
              data-emvb-choice={shape.value}
              tabIndex={keys.tabIndexOf(shape.value)}
              onClick={() => onPatch(iconShapePatch(shape.value, effective))}
            >
              {shape.value === "none" ? (
                <ProhibitIcon size={16} aria-hidden="true" />
              ) : (
                <span className="emvb-shape-swatch" data-shape={shape.value} aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
        <p className="emvb-helper">
          Color, padding and border: Background, Spacing and Border below.
        </p>
      </div>
    </div>
  );
}
