import * as React from "react";
import {
  applyTokens,
  fluidClamp,
  SCALE_RATIOS,
  spaceScale,
  typeScale,
  type DesignSystem,
} from "../../../core/index.ts";
import { fieldNumber } from "./settings/number-input.ts";
import { PanelSelect } from "./settings/PanelSelect.tsx";

// W-436: the fields are labelled "(px)", so "18px" is 18.
const num = (text: string): number | undefined => {
  const n = fieldNumber(text, "px");
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Design tokens (W-316): build a type scale from a base size and a ratio, or a spacing scale
 * from one gap, optionally fluid between a small-screen and a large-screen base. They land in
 * Font sizes and Spacing as ordinary variables; ones with the same id are updated in place.
 */
export function TokenScales({
  design,
  onSave,
}: {
  design: DesignSystem;
  /** Resolves false when the save failed (the drawer shows why). */
  onSave: (design: DesignSystem) => Promise<boolean | void>;
}) {
  const id = React.useId();
  const [kind, setKind] = React.useState<"type" | "space">("type");
  const [base, setBase] = React.useState("18");
  const [minBase, setMinBase] = React.useState("16");
  const [fluid, setFluid] = React.useState(true);
  const [ratio, setRatio] = React.useState(String(SCALE_RATIOS[2].value));
  const [done, setDone] = React.useState<string | null>(null);
  // W-609, W-626: an "added" message is about the scale as it was; any change clears it.
  const edit =
    (setter: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setter(event.currentTarget.value);
      setDone(null);
    };
  const input = {
    base: num(base) ?? Number.NaN,
    ...(fluid && num(minBase) !== undefined ? { minBase: num(minBase) } : {}),
  };
  const tokens =
    kind === "type"
      ? typeScale({
          ...input,
          ratio: num(ratio) ?? Number.NaN,
          ...(fluid ? { minRatio: Math.max(1.05, (num(ratio) ?? 1.2) - 0.05) } : {}),
        })
      : spaceScale(input);
  const range = design.fluidRange;
  const [lo, hi] = kind === "type" ? [8, 64] : [2, 64];
  const minValue = num(minBase);
  const minOff = fluid && !(minValue !== undefined && minValue >= lo && minValue <= hi);
  const list = kind === "type" ? "fontSizes" : "spacings";
  const updating = tokens.filter((t) =>
    (design.variables[list] ?? []).some((v) => v.id === t.id),
  ).length;
  return (
    <section className="emvb-site-section emvb-tokens" data-emvb-tokens="">
      <h3 className="emvb-bind-title">Scales</h3>
      <p className="emvb-helper">
        Generate a whole scale from two numbers. Fluid sizes grow smoothly from small to large
        screens with CSS clamp(), no breakpoints.
      </p>
      <div className="emvb-tokens-grid">
        <div className="emvb-tokens-field">
          <span className="emvb-bind-label" id={`${id}-kind`}>
            Scale
          </span>
          <PanelSelect
            labelledBy={`${id}-kind`}
            value={kind}
            data={{ "data-emvb-tokens-kind": "" }}
            options={[
              { value: "type", label: "Type scale" },
              { value: "space", label: "Spacing scale" },
            ]}
            onChange={(value) => {
              setKind(value === "space" ? "space" : "type");
              setDone(null);
            }}
          />
        </div>
        <label>
          <span className="emvb-bind-label">{kind === "type" ? "Body size" : "Base gap"} (px)</span>
          <input
            className="emvb-native-input"
            inputMode="decimal"
            value={base}
            data-emvb-tokens-base=""
            onChange={edit(setBase)}
          />
        </label>
        {kind === "type" && (
          <div className="emvb-tokens-field">
            <span className="emvb-bind-label" id={`${id}-ratio`}>
              Ratio
            </span>
            <PanelSelect
              labelledBy={`${id}-ratio`}
              value={ratio}
              data={{ "data-emvb-tokens-ratio": "" }}
              options={SCALE_RATIOS.map((r) => ({ value: String(r.value), label: r.label }))}
              onChange={(value) => {
                setRatio(value);
                setDone(null);
              }}
            />
          </div>
        )}
        <label className="emvb-tokens-fluid">
          <input
            type="checkbox"
            checked={fluid}
            data-emvb-tokens-fluid=""
            onChange={(event) => {
              setFluid(event.currentTarget.checked);
              setDone(null);
            }}
          />{" "}
          Fluid
        </label>
        {fluid && (
          <label>
            <span className="emvb-bind-label">On small screens (px)</span>
            <input
              className="emvb-native-input"
              inputMode="decimal"
              value={minBase}
              data-emvb-tokens-min=""
              onChange={edit(setMinBase)}
              aria-invalid={minOff ? true : undefined}
            />
          </label>
        )}
        {minOff && (
          <p className="emvb-helper" data-emvb-tokens-min-error="">
            {`Use a small-screen size from ${lo} to ${hi} px. Until then the sizes aren't fluid.`}
          </p>
        )}
      </div>
      {tokens.length === 0 ? (
        <p className="emvb-helper" role="alert">
          {kind === "type" ? "Use a body size from 8 to 64 px." : "Use a base gap from 2 to 64 px."}
        </p>
      ) : (
        <ol className="emvb-tokens-preview" data-emvb-tokens-preview="">
          {tokens.map((t) => (
            <li key={t.id}>
              <span
                className="emvb-tokens-sample"
                style={
                  kind === "type"
                    ? { fontSize: `${Math.min(t.value.value, 40)}px` }
                    : { width: `${Math.min(t.value.value, 64)}px` }
                }
              >
                {kind === "type" ? "Aa" : ""}
              </span>
              <span>{t.name}</span>
              <code className="emvb-mono">
                {t.fluid ? fluidClamp(t.fluid.min, t.fluid.max, range) : `${t.value.value}px`}
              </code>
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        className="emvb-link-button"
        disabled={tokens.length === 0}
        data-emvb-tokens-apply=""
        onClick={() => {
          const next = applyTokens(design, list, tokens);
          const label = kind === "type" ? "Font sizes" : "Spacing";
          // W-609: count what landed under the list's limit, not what was generated.
          const added = (next.variables[list] ?? []).length - (design.variables[list] ?? []).length;
          const left = tokens.length - updating - added;
          void onSave(next).then((ok) => {
            if (ok === false) return;
            setDone(
              `${added} added${updating ? `, ${updating} updated` : ""} in ${label}.` +
                (left > 0
                  ? ` ${left} didn't fit: ${label} holds up to ${list === "fontSizes" ? 50 : 100}.`
                  : ""),
            );
          });
        }}
      >
        {updating > 0 ? "Update the scale in site styles" : "Add the scale to site styles"}
      </button>
      {done && (
        <p className="emvb-helper" role="status">
          {done}
        </p>
      )}
    </section>
  );
}
