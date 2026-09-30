import { Button, Checkbox } from "@cloudflare/kumo";
import { PlusIcon } from "@phosphor-icons/react";
import type * as React from "react";
import type { DesignSystem, StyleProps } from "../../../../core/index.ts";
import { BUTTON } from "../../../ui.ts";
import { ColorControl } from "../ColorControl.tsx";
import { NumberField, NumberRow, type NumberSpec } from "./NumberRow.tsx";

type Shadow = NonNullable<StyleProps["boxShadow"]>;
type Filter = NonNullable<StyleProps["filter"]>;

/** DESIGN.md: Add shadow starts at 0 4 12 0, 18 % black. */
const NEW_SHADOW: Shadow = { x: 0, y: 4, blur: 12, spread: 0, color: "#0000002e" };

const OFFSET: NumberSpec = { min: -1000, max: 1000, example: "4" };
const SHADOW_FIELDS: ReadonlyArray<
  [key: "x" | "y" | "blur" | "spread", label: string, NumberSpec]
> = [
  ["x", "X", OFFSET],
  ["y", "Y", OFFSET],
  ["blur", "Blur", { min: 0, max: 1000, example: "12" }],
  ["spread", "Spread", OFFSET],
];

/** One box shadow: Add shadow when unset; X, Y, blur, spread, colour and inset when set. */
export function ShadowControl({
  value,
  design,
  onChange,
  onDesignChange,
  reset,
}: {
  value: Shadow | undefined;
  design: DesignSystem;
  onChange: (next: Shadow | undefined) => void;
  onDesignChange: (design: DesignSystem) => Promise<void>;
  reset: React.ReactNode;
}) {
  const patch = (part: Partial<Shadow>) => {
    if (!value) return;
    const next: Record<string, unknown> = { ...value, ...part };
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    onChange(next as Shadow);
  };
  return (
    <div
      className="emvb-style-row"
      data-emvb-style="boxShadow"
      data-set={value ? "true" : undefined}
    >
      <div className="emvb-field-group emvb-shadow">
        <span className="emvb-var-field-label">Box shadow</span>
        {value ? (
          <>
            <div className="emvb-shadow-grid">
              {SHADOW_FIELDS.map(([key, label, spec]) => (
                <NumberField
                  key={key}
                  fieldKey={`boxShadow.${key}`}
                  label={label}
                  value={value[key]}
                  spec={spec}
                  onCommit={(n) => patch({ [key]: n ?? 0 })}
                />
              ))}
            </div>
            <ColorControl
              label="Shadow color"
              value={value.color}
              design={design}
              onChange={(color) => patch({ color })}
              onDesignChange={onDesignChange}
            />
            <Checkbox
              label="Inset"
              checked={value.inset === true}
              onCheckedChange={(checked) => patch({ inset: checked === true ? true : undefined })}
            />
          </>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className={`${BUTTON} emvb-add-shadow`}
            icon={<PlusIcon aria-hidden="true" />}
            onClick={() => onChange(NEW_SHADOW)}
          >
            Add shadow
          </Button>
        )}
      </div>
      {reset}
    </div>
  );
}

const PERCENT_300: NumberSpec = {
  min: 0,
  max: 300,
  example: "100",
  suffix: "%",
  placeholder: "100",
};
const FILTER_ROWS: ReadonlyArray<[key: keyof Filter, label: string, NumberSpec]> = [
  ["blur", "Blur", { min: 0, max: 100, example: "4", suffix: "px", placeholder: "0" }],
  ["brightness", "Brightness", PERCENT_300],
  ["contrast", "Contrast", PERCENT_300],
  ["saturate", "Saturation", PERCENT_300],
  ["grayscale", "Grayscale", { min: 0, max: 100, example: "100", suffix: "%", placeholder: "0" }],
  ["hueRotate", "Hue rotation", { min: 0, max: 360, example: "90", suffix: "°", placeholder: "0" }],
];

/** The filter functions, one number row each; clearing the last one unsets Filters. */
export function FiltersControl({
  value,
  onChange,
}: {
  value: Filter | undefined;
  onChange: (next: Filter | undefined) => void;
}) {
  const patch = (key: keyof Filter, n: number | undefined) => {
    const next: Record<string, number> = {};
    for (const [k, v] of Object.entries({ ...value, [key]: n })) {
      if (typeof v === "number") next[k] = v;
    }
    onChange(Object.keys(next).length > 0 ? (next as Filter) : undefined);
  };
  return (
    <div className="emvb-filters" data-emvb-style="filter" data-set={value ? "true" : undefined}>
      <p className="emvb-sub-label">Filters</p>
      {FILTER_ROWS.map(([key, label, spec]) => (
        <NumberRow
          key={key}
          rowKey={`filter.${key}`}
          label={label}
          value={value?.[key]}
          spec={spec}
          onCommit={(n) => patch(key, n)}
        />
      ))}
    </div>
  );
}
