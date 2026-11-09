import { DropdownMenu, InputGroup } from "@cloudflare/kumo";
import { CaretDownIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { DesignSystem, FlatStyleProps } from "../../../../core/index.ts";
import { FIELD } from "../../../ui.ts";
import {
  fluidDraft,
  isFluid,
  parseLengthDraft,
  takesFluid,
  unitsFor,
  type FluidLiteral,
  type LengthLiteral,
  type LengthUnit,
  type UnitChoice,
} from "./length-units.ts";
import type { StyleKey } from "./style-sections.ts";
import { bindKind, boundRef, lengthRef, VariableButton, VariableChip } from "./VariableBinding.tsx";
import { isCommitEnter } from "../../ime.ts";

const isLiteral = (value: unknown): value is LengthLiteral =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { value?: unknown }).value === "number" &&
  typeof (value as { unit?: unknown }).unit === "string";

const same = (a: unknown, b: unknown) =>
  a === b ||
  (isLiteral(a) && isLiteral(b) && a.value === b.value && a.unit === b.unit) ||
  (isFluid(a) && isFluid(b) && a.fluid.min === b.fluid.min && a.fluid.max === b.fluid.max);

type NumericUnit = LengthUnit | "x";

const firstNumeric = (units: readonly UnitChoice[]): NumericUnit =>
  (units.find((u) => u !== "auto") as NumericUnit | undefined) ?? "px";

/** A length property: number input, unit menu inside its right edge, variable button (W-088). */
export function LengthRow({
  styleKey,
  label,
  value,
  design,
  set,
  placeholder,
  slider = false,
  onPatch,
  reset,
}: {
  styleKey: StyleKey;
  label: string;
  value: unknown;
  design: DesignSystem;
  set: boolean;
  /** The Normal value, shown while a state is edited (W-089). */
  placeholder?: string;
  /** Gap: a slider for the common range. The number field still accepts the full length. */
  slider?: boolean;
  onPatch: (patch: Partial<FlatStyleProps>) => void;
  reset: React.ReactNode;
}) {
  const units = unitsFor(styleKey);
  // W-213: a plain number is a unitless line height, shown with the `x` unit.
  // W-603: memoized, so a plain number doesn't make a new object each render; the effect below
  // would reset the draft on every keystroke and nothing typed over a unitless value would stick.
  const literal = React.useMemo<{ value: number; unit: NumericUnit } | undefined>(
    () => (isLiteral(value) ? value : typeof value === "number" ? { value, unit: "x" } : undefined),
    [value],
  );
  // W-955: a fluid size shows as "32–56" in px.
  const fluid = isFluid(value) ? value : undefined;
  const textOf = (): string => (fluid ? fluidDraft(fluid) : literal ? String(literal.value) : "");
  const numericUnit = literal?.unit ?? (fluid ? "px" : firstNumeric(units));
  const [draft, setDraft] = React.useState(textOf);
  const [unit, setUnit] = React.useState<UnitChoice>(value === "auto" ? "auto" : numericUnit);
  const lastNumeric = React.useRef<NumericUnit>(numericUnit);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setDraft(textOf());
    setUnit(value === "auto" ? "auto" : (literal?.unit ?? (fluid ? "px" : lastNumeric.current)));
    if (literal) lastNumeric.current = literal.unit;
    setError(null);
  }, [value, literal]);

  const send = (next: LengthLiteral | FluidLiteral | "auto" | number | undefined) => {
    if (!same(next, value)) onPatch({ [styleKey]: next });
  };

  const commit = () => {
    const parsed = parseLengthDraft(draft, styleKey, unit === "auto" ? lastNumeric.current : unit);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    if (parsed.value === undefined && value === "auto") return;
    send(parsed.value);
  };

  const pickUnit = (next: UnitChoice) => {
    setError(null);
    setUnit(next);
    if (next === "auto") {
      setDraft("");
      send("auto");
      return;
    }
    lastNumeric.current = next;
    const parsed = parseLengthDraft(draft, styleKey, next);
    if (!parsed.ok) return;
    const typed = parsed.value;
    // A fluid range is always px; the unit menu leaves it as it is.
    if (typed === undefined || typed === "auto" || isFluid(typed)) return;
    const n = typeof typed === "number" ? typed : typed.value;
    if (next === "x") {
      if (n <= 100) send(n);
      else setError("Line height without a unit can be from 0 to 100.");
    } else send({ value: n, unit: next });
  };

  const kind = bindKind(styleKey);
  const chip = lengthRef(value);
  const current = kind ? boundRef(value, kind) : null;
  return (
    <div
      className="emvb-style-row"
      data-emvb-style={styleKey}
      data-set={set ? "true" : undefined}
      data-inherited={!set && placeholder !== undefined ? "true" : undefined}
      data-unit={chip ? undefined : unit}
    >
      {chip ? (
        <VariableChip
          label={label}
          kind={chip.kind}
          design={design}
          id={chip.var}
          onDetach={(kept) => onPatch({ [styleKey]: typeof kept === "object" ? kept : undefined })}
        />
      ) : (
        <div className={slider ? "emvb-length-stack" : undefined}>
          <InputGroup
            label={label}
            className={`${FIELD} emvb-length`}
            error={error ? { message: error, match: true } : undefined}
          >
            <InputGroup.Input
              className="emvb-mono"
              aria-label={label}
              inputMode="decimal"
              value={draft}
              placeholder={unit === "auto" ? "auto" : placeholder}
              title={`A number in ${unit === "auto" ? lastNumeric.current : unit}, or with its own unit (2rem, 50%)${
                units.includes("auto") ? ", or auto" : ""
              }${takesFluid(styleKey) ? ". A range such as 32–56 grows from phones to large screens (px)" : ""}`}
              aria-invalid={error ? true : undefined}
              onChange={(event) => {
                if (unit === "auto") setUnit(lastNumeric.current);
                setDraft(event.target.value);
              }}
              onBlur={commit}
              onKeyDown={(event) => {
                if (isCommitEnter(event)) commit();
              }}
            />
            <InputGroup.Addon align="end" className="emvb-unit-addon">
              <DropdownMenu>
                <DropdownMenu.Trigger>
                  <button
                    type="button"
                    className="emvb-unit-btn"
                    aria-label={`${label} unit (${unit})`}
                    data-emvb-unit={unit}
                  >
                    {unit === "x" ? "×" : unit}
                    <CaretDownIcon size={12} aria-hidden="true" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content data-emvb-unit-menu={styleKey}>
                  <DropdownMenu.RadioGroup
                    aria-label={`${label} unit`}
                    value={unit}
                    onValueChange={(next: UnitChoice) => pickUnit(next)}
                  >
                    {units.map((choice) => (
                      <DropdownMenu.RadioItem
                        key={choice}
                        value={choice}
                        closeOnClick
                        data-emvb-unit-option={choice}
                      >
                        <span className="emvb-mono">{choice === "x" ? "× (no unit)" : choice}</span>
                        <DropdownMenu.RadioItemIndicator />
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Content>
              </DropdownMenu>
            </InputGroup.Addon>
          </InputGroup>
          {slider && unit !== "auto" && (
            <input
              className="emvb-gap-slider"
              type="range"
              min={0}
              max={200}
              step={1}
              aria-label={`${label} slider`}
              value={Math.min(200, literal?.value ?? 0)}
              onChange={(event) => {
                const next = Number(event.target.value);
                setDraft(String(next));
                send(unit === "x" ? next : { value: next, unit });
              }}
            />
          )}
        </div>
      )}
      {kind && (
        <VariableButton
          label={label}
          kind={kind}
          design={design}
          current={current?.var ?? null}
          onBind={(next) => onPatch({ [styleKey]: next })}
        />
      )}
      {reset}
    </div>
  );
}
