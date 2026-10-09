import { Input, Select } from "@cloudflare/kumo";
import { MotionControl } from "./MotionControl.tsx";
import { isSafeFontStack, type DesignSystem, type StyleProps } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { FIELD } from "../../../ui.ts";
import { ColorControl } from "../ColorControl.tsx";
import { BackgroundFill } from "./BackgroundFill.tsx";
import { STYLE_LABELS, type StyleKey } from "./style-sections.ts";
import { ChoiceGroup, LAYOUT_CHOICES } from "./ChoiceGroup.tsx";
import { LengthRow } from "./LengthRow.tsx";
import {
  EntranceControl,
  FiltersControl,
  ShadowControl,
  TransitionControl,
} from "./EffectsControls.tsx";
import {
  ICON_SCALE,
  ICON_STROKE,
  IconAnimationControl,
  IconFlipRow,
  IconRotateRow,
  IconShadowControl,
} from "./IconControls.tsx";
import { NumberRow, ResetButton, type NumberSpec } from "./NumberRow.tsx";
import { boundRef, VariableButton, VariableChip } from "./VariableBinding.tsx";

const LENGTH_KEYS = new Set<StyleKey>([
  "gap",
  "width",
  "minWidth",
  "maxWidth",
  "height",
  "minHeight",
  "maxHeight",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "top",
  "right",
  "bottom",
  "left",
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "borderWidth",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
]);

const Z_INDEX: NumberSpec = { min: -9999, max: 9999, integer: true, example: "10" };
const GRID_SPAN: NumberSpec = { min: 1, max: 12, integer: true, example: "2" };
const OPACITY: NumberSpec = { min: 0, max: 100, scale: 100, example: "50", suffix: "%" };

const COLOR_KEYS = new Set<StyleKey>(["color", "backgroundColor", "borderColor"]);

const SELECT_OPTIONS: Partial<Record<StyleKey, { value: string; label: string }[]>> = {
  textAlign: [
    { value: "left", label: "Left" },
    { value: "center", label: "Center" },
    { value: "right", label: "Right" },
    { value: "justify", label: "Justify" },
  ],
  textTransform: [
    { value: "none", label: "None" },
    { value: "uppercase", label: "Uppercase" },
    { value: "lowercase", label: "Lowercase" },
    { value: "capitalize", label: "Capitalize" },
  ],
  textDecoration: [
    { value: "none", label: "None" },
    { value: "underline", label: "Underline" },
    { value: "overline", label: "Overline" },
    { value: "line-through", label: "Line-through" },
  ],
  position: [
    { value: "static", label: "Static" },
    { value: "relative", label: "Relative" },
    { value: "absolute", label: "Absolute" },
    { value: "fixed", label: "Fixed" },
    { value: "sticky", label: "Sticky" },
  ],
  overflow: [
    { value: "visible", label: "Visible" },
    { value: "hidden", label: "Hidden" },
    { value: "clip", label: "Clip" },
    { value: "scroll", label: "Scroll" },
    { value: "auto", label: "Auto" },
  ],
  aspectRatio: [
    { value: "auto", label: "Auto" },
    ...["1/1", "4/3", "3/2", "16/9", "21/9", "3/4", "2/3", "9/16"].map((ratio) => ({
      value: ratio,
      label: ratio.replace("/", ":"),
    })),
  ],
  objectFit: [
    { value: "fill", label: "Fill" },
    { value: "contain", label: "Contain" },
    { value: "cover", label: "Cover" },
    { value: "none", label: "None" },
    { value: "scale-down", label: "Scale down" },
  ],
  cursor: [
    { value: "default", label: "Default" },
    { value: "pointer", label: "Pointer" },
    { value: "text", label: "Text" },
    { value: "move", label: "Move" },
    { value: "grab", label: "Grab" },
    { value: "not-allowed", label: "Not allowed" },
    { value: "help", label: "Help" },
    { value: "crosshair", label: "Crosshair" },
    { value: "zoom-in", label: "Zoom in" },
  ],
  borderStyle: [
    { value: "none", label: "None" },
    { value: "solid", label: "Solid" },
    { value: "dashed", label: "Dashed" },
    { value: "dotted", label: "Dotted" },
  ],
  backgroundSize: [
    { value: "cover", label: "Cover" },
    { value: "contain", label: "Contain" },
    { value: "auto", label: "Auto" },
  ],
  backgroundPosition: [
    { value: "center", label: "Center" },
    { value: "top", label: "Top" },
    { value: "bottom", label: "Bottom" },
    { value: "left", label: "Left" },
    { value: "right", label: "Right" },
    { value: "top left", label: "Top left" },
    { value: "top right", label: "Top right" },
    { value: "bottom left", label: "Bottom left" },
    { value: "bottom right", label: "Bottom right" },
  ],
  backgroundRepeat: [
    { value: "no-repeat", label: "No repeat" },
    { value: "repeat", label: "Repeat" },
    { value: "repeat-x", label: "Repeat horizontally" },
    { value: "repeat-y", label: "Repeat vertically" },
  ],
  // W-213: the full CSS weight range.
  fontWeight: [
    { value: "400", label: "Regular" },
    { value: "100", label: "Thin" },
    { value: "200", label: "Extra light" },
    { value: "300", label: "Light" },
    { value: "500", label: "Medium" },
    { value: "600", label: "Semibold" },
    { value: "700", label: "Bold" },
    { value: "800", label: "Extra bold" },
    { value: "900", label: "Black" },
  ],
};

const isLengthLiteral = (value: unknown): value is { value: number; unit: string } =>
  typeof value === "object" && value !== null && "value" in value && "unit" in value;

/** A value as placeholder text: a literal, a keyword, or the variable's name (W-089). */
export function placeholderOf(value: unknown, design: DesignSystem): string | undefined {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (isLengthLiteral(value)) return `${value.value}${value.unit}`;
  if (typeof value === "object" && value !== null && "var" in value) {
    const { colors, fonts, fontSizes, spacings } = design.variables;
    const id = (value as { var: unknown }).var;
    return [...colors, ...(fonts ?? []), ...(fontSizes ?? []), ...(spacings ?? [])].find(
      (v) => v.id === id,
    )?.name;
  }
  return undefined;
}

/** One Style property row: control, set marker, reset (W-021). */
const FILL_REST = new Set<StyleKey>([
  "backgroundImage",
  "backgroundSize",
  "backgroundPosition",
  "backgroundRepeat",
  "gradient",
  "overlay",
  "backgroundVideo",
]);

export function StyleRow({
  styleKey,
  style,
  inherited,
  design,
  fetcher,
  elementType = "container",
  fillScope,
  onPatch,
  onDesignChange,
}: {
  styleKey: StyleKey;
  style: StyleProps | undefined;
  /** The Normal styles while a state is edited (W-089): shown as placeholders, never saved. */
  inherited?: StyleProps;
  design: DesignSystem;
  /** Present on an element, so a background image can use the media library. */
  fetcher?: Fetcher;
  /** Decides whether Image and Video are offered. A class editor passes a box. */
  elementType?: string;
  /** Which class and device the background fill memory belongs to (W-184). */
  fillScope?: string;
  onPatch: (patch: Partial<StyleProps>) => void;
  onDesignChange: (design: DesignSystem) => Promise<void>;
}) {
  const value = style?.[styleKey];
  const set = value !== undefined;
  const label = STYLE_LABELS[styleKey];
  const normalValue = inherited?.[styleKey];
  const placeholder = set ? undefined : placeholderOf(normalValue, design);
  const inheriting = !set && normalValue !== undefined ? "true" : undefined;

  const reset = (
    <ResetButton label={label} set={set} onReset={() => onPatch({ [styleKey]: undefined })} />
  );

  if (styleKey === "backgroundColor") {
    return (
      <BackgroundFill
        style={style}
        elementType={elementType}
        design={design}
        fetcher={fetcher}
        sizeOptions={SELECT_OPTIONS.backgroundSize ?? []}
        positionOptions={SELECT_OPTIONS.backgroundPosition ?? []}
        repeatOptions={SELECT_OPTIONS.backgroundRepeat ?? []}
        onPatch={onPatch}
        onDesignChange={onDesignChange}
        memoryScope={fillScope}
        reset={
          <ResetButton
            label="Background"
            set={
              style?.backgroundColor !== undefined ||
              style?.gradient !== undefined ||
              style?.backgroundImage !== undefined ||
              style?.backgroundVideo !== undefined ||
              style?.overlay !== undefined
            }
            onReset={() =>
              onPatch({
                backgroundColor: undefined,
                backgroundImage: undefined,
                backgroundSize: undefined,
                backgroundPosition: undefined,
                backgroundRepeat: undefined,
                gradient: undefined,
                overlay: undefined,
                backgroundVideo: undefined,
              })
            }
          />
        }
      />
    );
  }

  if (FILL_REST.has(styleKey)) return null;

  if (COLOR_KEYS.has(styleKey)) {
    return (
      <div
        className="emvb-style-row"
        data-emvb-style={styleKey}
        data-set={set ? "true" : undefined}
        data-inherited={inheriting}
      >
        <ColorControl
          label={label}
          value={value as StyleProps["color"]}
          placeholder={placeholder}
          design={design}
          onChange={(color) => onPatch({ [styleKey]: color })}
          onDesignChange={onDesignChange}
        />
        {reset}
      </div>
    );
  }

  const choices = LAYOUT_CHOICES[styleKey];
  if (choices) {
    return (
      <div
        className="emvb-style-row"
        data-emvb-style={styleKey}
        data-set={set ? "true" : undefined}
        data-inherited={inheriting}
      >
        <ChoiceGroup
          label={label}
          value={typeof value === "string" ? value : undefined}
          options={choices}
          onChange={(next) => onPatch({ [styleKey]: next })}
        />
        {reset}
      </div>
    );
  }

  const options = SELECT_OPTIONS[styleKey];
  if (options) {
    const shown = value ?? normalValue;
    const current =
      styleKey === "fontWeight" && typeof shown === "number"
        ? String(shown)
        : ((shown as string | undefined) ?? options[0]?.value ?? "");
    return (
      <div
        className="emvb-style-row"
        data-emvb-style={styleKey}
        data-set={set ? "true" : undefined}
        data-inherited={inheriting}
      >
        <Select
          label={label}
          className={FIELD}
          value={current}
          onValueChange={(next) => {
            if (styleKey === "fontWeight") {
              const n = Number(next);
              onPatch({
                fontWeight: Number.isFinite(n)
                  ? (n as NonNullable<StyleProps["fontWeight"]>)
                  : undefined,
              });
              return;
            }
            onPatch({ [styleKey]: next === options[0]?.value && !set ? next : next });
          }}
          renderValue={(v: unknown) =>
            options.find((o) => o.value === String(v))?.label ?? String(v)
          }
        >
          {options.map((option) => (
            <Select.Option key={option.value} value={option.value}>
              {option.label}
            </Select.Option>
          ))}
        </Select>
        {reset}
      </div>
    );
  }

  if (styleKey === "fontFamily") {
    const text = typeof value === "string" ? value : "";
    const ref = boundRef(value, "font");
    return (
      <div
        className="emvb-style-row"
        data-emvb-style={styleKey}
        data-set={set ? "true" : undefined}
        data-inherited={inheriting}
      >
        {ref ? (
          <VariableChip
            label={label}
            kind="font"
            design={design}
            id={ref.var}
            onDetach={(literal) =>
              onPatch({
                fontFamily:
                  typeof literal === "string" && isSafeFontStack(literal) ? literal : undefined,
              })
            }
          />
        ) : (
          <Input
            label={label}
            className={FIELD}
            value={text}
            placeholder={placeholder ?? "Noto Sans, system-ui, sans-serif"}
            onChange={(event) => {
              const next = event.target.value.trim();
              onPatch({ fontFamily: next === "" ? undefined : next });
            }}
          />
        )}
        <VariableButton
          label={label}
          kind="font"
          design={design}
          current={ref?.var ?? null}
          onBind={(next) => onPatch({ fontFamily: next as StyleProps["fontFamily"] })}
        />
        {reset}
      </div>
    );
  }

  if (
    styleKey === "zIndex" ||
    styleKey === "opacity" ||
    styleKey === "gridColumnSpan" ||
    styleKey === "gridRowSpan"
  ) {
    const spec = styleKey === "zIndex" ? Z_INDEX : styleKey === "opacity" ? OPACITY : GRID_SPAN;
    return (
      <NumberRow
        rowKey={styleKey}
        label={label}
        value={typeof value === "number" ? value : undefined}
        inherited={typeof normalValue === "number" ? normalValue : undefined}
        spec={spec}
        onCommit={(next) => onPatch({ [styleKey]: next })}
      />
    );
  }

  // W-237: the Icon section.
  if (styleKey === "iconRotate") {
    return (
      <IconRotateRow
        value={style?.iconRotate}
        inherited={inherited?.iconRotate}
        onChange={(iconRotate) => onPatch({ iconRotate })}
      />
    );
  }
  if (styleKey === "iconFlip") {
    return (
      <IconFlipRow
        value={style?.iconFlip}
        inherited={inherited?.iconFlip}
        onChange={(iconFlip) => onPatch({ iconFlip })}
      />
    );
  }
  if (styleKey === "iconScale" || styleKey === "iconStrokeWidth") {
    return (
      <NumberRow
        rowKey={styleKey}
        label={label}
        value={typeof value === "number" ? value : undefined}
        inherited={typeof normalValue === "number" ? normalValue : undefined}
        spec={styleKey === "iconScale" ? ICON_SCALE : ICON_STROKE}
        onCommit={(next) => onPatch({ [styleKey]: next })}
      />
    );
  }
  if (styleKey === "iconShadow") {
    return (
      <IconShadowControl
        value={style?.iconShadow}
        design={design}
        onChange={(iconShadow) => onPatch({ iconShadow })}
        onDesignChange={onDesignChange}
      />
    );
  }
  if (styleKey === "iconAnimation") {
    return (
      <IconAnimationControl
        value={style?.iconAnimation}
        inherited={inherited?.iconAnimation}
        onChange={(iconAnimation) => onPatch({ iconAnimation })}
      />
    );
  }

  if (styleKey === "boxShadow") {
    return (
      <ShadowControl
        value={style?.boxShadow}
        design={design}
        onChange={(boxShadow) => onPatch({ boxShadow })}
        onDesignChange={onDesignChange}
        reset={reset}
      />
    );
  }

  if (styleKey === "entrance") {
    return (
      <EntranceControl
        value={style?.entrance}
        onChange={(entrance) => onPatch({ entrance })}
        reset={reset}
      />
    );
  }

  if (styleKey === "scrollMotion") {
    return (
      <MotionControl
        value={style?.scrollMotion}
        onChange={(scrollMotion) => onPatch({ scrollMotion })}
        reset={reset}
      />
    );
  }

  if (styleKey === "transition") {
    return (
      <TransitionControl
        value={style?.transition}
        onChange={(transition) => onPatch({ transition })}
        reset={reset}
      />
    );
  }

  if (styleKey === "filter") {
    return (
      <FiltersControl
        value={style?.filter}
        inherited={inherited?.filter}
        onChange={(filter) => onPatch({ filter })}
      />
    );
  }

  if (LENGTH_KEYS.has(styleKey)) {
    return (
      <LengthRow
        styleKey={styleKey}
        label={label}
        value={value}
        design={design}
        set={set}
        placeholder={placeholder}
        slider={styleKey === "gap"}
        onPatch={onPatch}
        reset={reset}
      />
    );
  }

  return null;
}

export const IMPLEMENTED_STYLE_KEYS: StyleKey[] = [
  ...LENGTH_KEYS,
  ...COLOR_KEYS,
  "fontFamily",
  "zIndex",
  "gridColumnSpan",
  "gridRowSpan",
  "opacity",
  "boxShadow",
  "filter",
  "entrance",
  "scrollMotion",
  "transition",
  "iconRotate",
  "iconFlip",
  "iconScale",
  "iconStrokeWidth",
  "iconShadow",
  "iconAnimation",
  "backgroundImage",
  "backgroundVideo",
  "gradient",
  "overlay",
  ...(Object.keys(SELECT_OPTIONS) as StyleKey[]),
  ...(Object.keys(LAYOUT_CHOICES) as StyleKey[]),
];
