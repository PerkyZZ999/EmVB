import * as React from "react";
import {
  applyTokens,
  fluidClamp,
  SCALE_RATIOS,
  spaceScale,
  typeScale,
  type DesignSystem,
} from "../../../core/index.ts";

const num = (text: string): number | undefined => {
  const n = Number(text);
  return text.trim() !== "" && Number.isFinite(n) ? n : undefined;
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
  onSave: (design: DesignSystem) => Promise<void>;
}) {
  const [kind, setKind] = React.useState<"type" | "space">("type");
  const [base, setBase] = React.useState("18");
  const [minBase, setMinBase] = React.useState("16");
  const [fluid, setFluid] = React.useState(true);
  const [ratio, setRatio] = React.useState(String(SCALE_RATIOS[2].value));
  const [done, setDone] = React.useState<string | null>(null);
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
        <label>
          <span className="emvb-bind-label">Scale</span>
          <select
            className="emvb-native-select"
            value={kind}
            data-emvb-tokens-kind=""
            onChange={(event) => setKind(event.currentTarget.value === "space" ? "space" : "type")}
          >
            <option value="type">Type scale</option>
            <option value="space">Spacing scale</option>
          </select>
        </label>
        <label>
          <span className="emvb-bind-label">{kind === "type" ? "Body size" : "Base gap"} (px)</span>
          <input
            className="emvb-native-input"
            inputMode="decimal"
            value={base}
            data-emvb-tokens-base=""
            onChange={(event) => setBase(event.currentTarget.value)}
          />
        </label>
        {kind === "type" && (
          <label>
            <span className="emvb-bind-label">Ratio</span>
            <select
              className="emvb-native-select"
              value={ratio}
              data-emvb-tokens-ratio=""
              onChange={(event) => setRatio(event.currentTarget.value)}
            >
              {SCALE_RATIOS.map((r) => (
                <option key={r.value} value={String(r.value)}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="emvb-tokens-fluid">
          <input
            type="checkbox"
            checked={fluid}
            data-emvb-tokens-fluid=""
            onChange={(event) => setFluid(event.currentTarget.checked)}
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
              onChange={(event) => setMinBase(event.currentTarget.value)}
            />
          </label>
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
                    : { width: `${Math.min(t.value.value, 120)}px` }
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
          void onSave(applyTokens(design, list, tokens)).then(() =>
            setDone(
              `${tokens.length - updating} added${updating ? `, ${updating} updated` : ""} in ${kind === "type" ? "Font sizes" : "Spacing"}.`,
            ),
          );
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
