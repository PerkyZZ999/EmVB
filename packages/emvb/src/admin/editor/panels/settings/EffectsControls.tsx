import { Button, Checkbox, Select } from "@cloudflare/kumo";
import { PlusIcon } from "@phosphor-icons/react";
import type * as React from "react";
import type { DesignSystem, StyleProps } from "../../../../core/index.ts";
import { BUTTON, FIELD } from "../../../ui.ts";
import { ColorControl } from "../ColorControl.tsx";
import { NumberField, NumberRow, type NumberSpec } from "./NumberRow.tsx";

type Shadow = NonNullable<StyleProps["boxShadow"]>;
type Filter = NonNullable<StyleProps["filter"]>;
type Transition = NonNullable<StyleProps["transition"]>;
type Entrance = NonNullable<StyleProps["entrance"]>;

/** Add shadow starts at 0 4 12 0, 18 % black. */
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
  inherited,
  onChange,
}: {
  value: Filter | undefined;
  inherited?: Filter;
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
          inherited={inherited?.[key]}
          onCommit={(n) => patch(key, n)}
        />
      ))}
    </div>
  );
}

/** Add transition starts at 200 ms, Ease, All (W-089). */
const NEW_TRANSITION: Transition = { duration: 200, easing: "ease", property: "all" };
const MS: NumberSpec = { min: 0, max: 2000, integer: true, example: "200", suffix: "ms" };
const EASINGS: ReadonlyArray<{ value: Transition["easing"]; label: string }> = [
  { value: "ease", label: "Ease" },
  { value: "ease-in", label: "Ease in" },
  { value: "ease-out", label: "Ease out" },
  { value: "ease-in-out", label: "Ease in and out" },
  { value: "linear", label: "Linear" },
];
const APPLIES_TO: ReadonlyArray<{ value: Transition["property"]; label: string }> = [
  { value: "all", label: "All" },
  { value: "colors", label: "Colours" },
  { value: "opacity", label: "Opacity" },
  { value: "shadow", label: "Shadow" },
  { value: "filter", label: "Filters" },
];

function TransitionSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <Select
      label={label}
      className={FIELD}
      value={value}
      onValueChange={(next) => {
        const option = options.find((o) => o.value === next);
        if (option) onChange(option.value);
      }}
      renderValue={(v: unknown) => options.find((o) => o.value === v)?.label ?? String(v)}
    >
      {options.map((option) => (
        <Select.Option key={option.value} value={option.value}>
          {option.label}
        </Select.Option>
      ))}
    </Select>
  );
}

const ENTRANCE_TYPES: { value: Entrance["type"]; label: string }[] = [
  { value: "fade", label: "Fade" },
  { value: "fade-up", label: "Fade up" },
  { value: "fade-down", label: "Fade down" },
  { value: "slide-up", label: "Slide up" },
  { value: "slide-down", label: "Slide down" },
  { value: "scale", label: "Scale" },
];

/** Plays once on load (W-101, Normal only). Add entrance starts at Fade, 400 ms. */
export function EntranceControl({
  value,
  onChange,
  reset,
}: {
  value: Entrance | undefined;
  onChange: (next: Entrance | undefined) => void;
  reset: React.ReactNode;
}) {
  return (
    <div
      className="emvb-style-row"
      data-emvb-style="entrance"
      data-set={value ? "true" : undefined}
    >
      <div className="emvb-field-group emvb-transition">
        <span className="emvb-var-field-label">Entrance</span>
        {value ? (
          <>
            <TransitionSelect
              label="Entrance"
              value={value.type}
              options={ENTRANCE_TYPES}
              onChange={(type) => onChange({ ...value, type })}
            />
            <NumberField
              fieldKey="entrance.duration"
              label="Duration"
              value={value.duration}
              spec={MS}
              onCommit={(n) => onChange({ ...value, duration: n ?? 0 })}
            />
            <NumberField
              fieldKey="entrance.delay"
              label="Delay"
              value={value.delay ?? 0}
              spec={MS}
              onCommit={(n) => onChange({ ...value, delay: n && n > 0 ? n : undefined })}
            />
            <TransitionSelect
              label="Start"
              value={value.trigger ?? "load"}
              options={[
                { value: "load", label: "On load" },
                { value: "view", label: "In view" },
              ]}
              onChange={(trigger) =>
                onChange({ ...value, trigger: trigger === "load" ? undefined : "view" })
              }
            />
          </>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className={`${BUTTON} emvb-add-shadow`}
            icon={<PlusIcon aria-hidden="true" />}
            onClick={() => onChange({ type: "fade", duration: 400 })}
          >
            Add entrance
          </Button>
        )}
      </div>
      {reset}
    </div>
  );
}

/** One transition (W-089, Normal only): Add transition when unset; duration, delay, easing, property when set. */
export function TransitionControl({
  value,
  onChange,
  reset,
}: {
  value: Transition | undefined;
  onChange: (next: Transition | undefined) => void;
  reset: React.ReactNode;
}) {
  const patch = (part: Partial<Transition>) => {
    if (!value) return;
    const merged: Record<string, unknown> = { ...value, ...part };
    for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
    onChange(merged as Transition);
  };
  return (
    <div
      className="emvb-style-row"
      data-emvb-style="transition"
      data-set={value ? "true" : undefined}
    >
      <div className="emvb-field-group emvb-transition">
        <span className="emvb-var-field-label">Transition</span>
        {value ? (
          <>
            <div className="emvb-shadow-grid">
              <NumberField
                fieldKey="transition.duration"
                label="Duration"
                value={value.duration}
                spec={MS}
                onCommit={(n) => patch({ duration: n ?? 0 })}
              />
              <NumberField
                fieldKey="transition.delay"
                label="Delay"
                value={value.delay}
                spec={{ ...MS, placeholder: "0" }}
                onCommit={(n) => patch({ delay: n })}
              />
            </div>
            <TransitionSelect
              label="Easing"
              value={value.easing}
              options={EASINGS}
              onChange={(easing) => patch({ easing })}
            />
            <TransitionSelect
              label="Applies to"
              value={value.property}
              options={APPLIES_TO}
              onChange={(property) => patch({ property })}
            />
          </>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className={`${BUTTON} emvb-add-shadow`}
            icon={<PlusIcon aria-hidden="true" />}
            onClick={() => onChange(NEW_TRANSITION)}
          >
            Add transition
          </Button>
        )}
      </div>
      {reset}
    </div>
  );
}
