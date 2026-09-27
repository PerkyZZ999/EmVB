import { Button, Input, Select } from "@cloudflare/kumo";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { DesignSystem, StyleProps } from "../../../../core/index.ts";
import { BUTTON, FIELD } from "../../../ui.ts";
import { ColorControl } from "../ColorControl.tsx";
import { STYLE_LABELS, type StyleKey } from "./style-sections.ts";

type Length = NonNullable<StyleProps["gap"]>;

const LENGTH_KEYS = new Set<StyleKey>([
  "gap",
  "width",
  "minWidth",
  "maxWidth",
  "height",
  "minHeight",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "borderWidth",
  "borderRadius",
]);

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
  borderStyle: [
    { value: "none", label: "None" },
    { value: "solid", label: "Solid" },
    { value: "dashed", label: "Dashed" },
    { value: "dotted", label: "Dotted" },
  ],
  fontWeight: [
    { value: "400", label: "Regular" },
    { value: "500", label: "Medium" },
    { value: "600", label: "Semibold" },
    { value: "700", label: "Bold" },
  ],
};

export function parseLengthDraft(
  draft: string,
  styleKey: StyleKey,
  unit: Length["unit"],
): { ok: true; value: Length | undefined } | { ok: false; message: string } {
  if (draft.trim() === "") return { ok: true, value: undefined };
  const n = Number(draft);
  if (!Number.isFinite(n) || n < 0) return { ok: false, message: gapMessage(styleKey) };
  if (n > 10_000)
    return {
      ok: false,
      message: `${STYLE_LABELS[styleKey]} can be up to 10000. Enter a smaller number.`,
    };
  return { ok: true, value: { value: n, unit } };
}

const gapMessage = (key: StyleKey) =>
  key === "gap"
    ? "Gap can't be negative. Enter 0 or more."
    : `${STYLE_LABELS[key]} can't be negative. Enter 0 or more.`;

/** One Style property row: control, set marker, reset (W-021). */
export function StyleRow({
  styleKey,
  style,
  design,
  onPatch,
  onDesignChange,
}: {
  styleKey: StyleKey;
  style: StyleProps | undefined;
  design: DesignSystem;
  onPatch: (patch: Partial<StyleProps>) => void;
  onDesignChange: (design: DesignSystem) => Promise<void>;
}) {
  const value = style?.[styleKey];
  const set = value !== undefined;
  const label = STYLE_LABELS[styleKey];

  const reset = (
    <Button
      type="button"
      variant="ghost"
      className={`${BUTTON} emvb-reset-btn`}
      aria-label={`Reset ${label} to default`}
      title="Reset to default"
      disabled={!set}
      onClick={() => onPatch({ [styleKey]: undefined })}
    >
      <ArrowCounterClockwiseIcon size={14} aria-hidden="true" />
    </Button>
  );

  if (COLOR_KEYS.has(styleKey)) {
    return (
      <div
        className="emvb-style-row"
        data-emvb-style={styleKey}
        data-set={set ? "true" : undefined}
      >
        <ColorControl
          label={label}
          value={value as StyleProps["color"]}
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
    const current =
      styleKey === "fontWeight" && typeof value === "number"
        ? String(value)
        : ((value as string | undefined) ?? options[0]?.value ?? "");
    return (
      <div
        className="emvb-style-row"
        data-emvb-style={styleKey}
        data-set={set ? "true" : undefined}
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

  if (LENGTH_KEYS.has(styleKey)) {
    return (
      <LengthRow
        styleKey={styleKey}
        label={label}
        value={value as Length | undefined}
        set={set}
        onPatch={onPatch}
        reset={reset}
      />
    );
  }

  return null;
}

function LengthRow({
  styleKey,
  label,
  value,
  set,
  onPatch,
  reset,
}: {
  styleKey: StyleKey;
  label: string;
  value: Length | undefined;
  set: boolean;
  onPatch: (patch: Partial<StyleProps>) => void;
  reset: React.ReactNode;
}) {
  const [draft, setDraft] = React.useState(value ? String(value.value) : "");
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setDraft(value ? String(value.value) : "");
    setError(null);
  }, [value]);

  const commit = () => {
    const parsed = parseLengthDraft(draft, styleKey, value?.unit ?? "px");
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    onPatch({ [styleKey]: parsed.value });
  };

  return (
    <div className="emvb-style-row" data-emvb-style={styleKey} data-set={set ? "true" : undefined}>
      <Input
        label={`${label} (${value?.unit ?? "px"})`}
        className={`${FIELD} emvb-mono`}
        inputMode="numeric"
        value={draft}
        error={error ?? undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
      {reset}
    </div>
  );
}

export const IMPLEMENTED_STYLE_KEYS: StyleKey[] = [
  ...LENGTH_KEYS,
  ...COLOR_KEYS,
  ...(Object.keys(SELECT_OPTIONS) as StyleKey[]),
];
