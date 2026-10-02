import { Input, Select } from "@cloudflare/kumo";
import { isSafeFontStack, type DesignSystem, type StyleProps } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { FIELD } from "../../../ui.ts";
import { ColorControl } from "../ColorControl.tsx";
import { BackgroundImageControl, GradientControl, OverlayControl } from "./BackgroundControls.tsx";
import { STYLE_LABELS, type StyleKey } from "./style-sections.ts";
import { LengthRow } from "./LengthRow.tsx";
import { FiltersControl, ShadowControl, TransitionControl } from "./EffectsControls.tsx";
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
  "borderRadius",
]);

const Z_INDEX: NumberSpec = { min: -9999, max: 9999, integer: true, example: "10" };
const GRID_SPAN: NumberSpec = { min: 1, max: 12, integer: true, example: "2" };
const OPACITY: NumberSpec = { min: 0, max: 100, scale: 100, example: "50", suffix: "%" };

const COLOR_KEYS = new Set<StyleKey>(["color", "backgroundColor", "borderColor"]);

const SELECT_OPTIONS: Partial<Record<StyleKey, { value: string; label: string }[]>> = {
  flexDirection: [
    { value: "column", label: "Column" },
    { value: "row", label: "Row" },
    { value: "column-reverse", label: "Column reverse" },
    { value: "row-reverse", label: "Row reverse" },
  ],
  flexWrap: [
    { value: "nowrap", label: "No wrap" },
    { value: "wrap", label: "Wrap" },
    { value: "wrap-reverse", label: "Wrap reverse" },
  ],
  justifyContent: [
    { value: "flex-start", label: "Start" },
    { value: "center", label: "Center" },
    { value: "flex-end", label: "End" },
    { value: "space-between", label: "Space between" },
    { value: "space-around", label: "Space around" },
    { value: "space-evenly", label: "Space evenly" },
  ],
  alignItems: [
    { value: "stretch", label: "Stretch" },
    { value: "flex-start", label: "Start" },
    { value: "center", label: "Center" },
    { value: "flex-end", label: "End" },
    { value: "baseline", label: "Baseline" },
  ],
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
  fontWeight: [
    { value: "400", label: "Regular" },
    { value: "500", label: "Medium" },
    { value: "600", label: "Semibold" },
    { value: "700", label: "Bold" },
  ],
};

const isLengthLiteral = (value: unknown): value is { value: number; unit: string } =>
  typeof value === "object" && value !== null && "value" in value && "unit" in value;

/** A value as placeholder text: a literal, a keyword, or the variable's name (W-089). */
function placeholderOf(value: unknown, design: DesignSystem): string | undefined {
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
export function StyleRow({
  styleKey,
  style,
  inherited,
  design,
  fetcher,
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

  if (styleKey === "backgroundImage") {
    return (
      <BackgroundImageControl
        value={typeof value === "string" ? value : undefined}
        fetcher={fetcher}
        onChange={(next) => onPatch({ backgroundImage: next })}
        reset={reset}
      />
    );
  }

  if (styleKey === "gradient") {
    return (
      <GradientControl
        value={style?.gradient}
        design={design}
        onChange={(next) => onPatch({ gradient: next })}
        onDesignChange={onDesignChange}
        reset={reset}
      />
    );
  }

  if (styleKey === "overlay") {
    return (
      <OverlayControl
        value={style?.overlay}
        design={design}
        onChange={(next) => onPatch({ overlay: next })}
        onDesignChange={onDesignChange}
        reset={reset}
      />
    );
  }

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
                fontWeight: Number.isFinite(n) ? (n as 400 | 500 | 600 | 700) : undefined,
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
  "transition",
  "backgroundImage",
  "gradient",
  "overlay",
  ...(Object.keys(SELECT_OPTIONS) as StyleKey[]),
];
