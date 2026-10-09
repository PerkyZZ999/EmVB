import {
  traceStyle,
  type DesignSystem,
  type LayoutNode,
  type StyleSource,
  type TraceDevice,
} from "../../../../core/index.ts";

/** "backgroundColor" → "Background color". */
const propertyName = (key: string) => {
  const words = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** A short, readable value: a colour, a length, a variable, or JSON cut short. */
export function sourceValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    if ("var" in value) return `var ${(value as { var: string }).var}`;
    if ("value" in value && "unit" in value) {
      const v = value as { value: number; unit: string };
      return `${v.value}${v.unit}`;
    }
  }
  const json = JSON.stringify(value) ?? "";
  return json.length > 32 ? `${json.slice(0, 31)}…` : json;
}

const where = (s: StyleSource) => (s.layer === "Desktop" ? s.label : `${s.label} · ${s.layer}`);

/**
 * Style inheritance inspector (W-318): every property that applies to this element here, the
 * layer it comes from (site default, a class, this element; Desktop, Tablet, Mobile or a state)
 * and what it overrides.
 */
export function StyleSources({
  node,
  design,
  device,
  state,
}: {
  node: LayoutNode;
  design: DesignSystem;
  device: TraceDevice;
  state: "normal" | "hover" | "focus" | "active";
}) {
  const trace = traceStyle(node, design, device, state);
  const keys = Object.keys(trace).toSorted();
  const fromElsewhere = keys.filter((key) => trace[key]?.winner.kind !== "local").length;
  return (
    <details className="emvb-sources" data-emvb-style-sources="">
      <summary>
        Where styles come from
        <span className="emvb-sources-count">
          {keys.length === 0
            ? "nothing set"
            : `${keys.length} set${fromElsewhere > 0 ? `, ${fromElsewhere} inherited` : ""}`}
        </span>
      </summary>
      {keys.length === 0 ? (
        <p className="emvb-helper">No styles apply yet beyond the element's defaults.</p>
      ) : (
        <ul>
          {keys.map((key) => {
            const t = trace[key];
            if (!t) return null;
            return (
              <li key={key} data-emvb-source={key} data-kind={t.winner.kind}>
                <span className="emvb-sources-prop">{propertyName(key)}</span>
                <span className="emvb-sources-value">{sourceValue(t.winner.value)}</span>
                <span className="emvb-sources-from">{where(t.winner)}</span>
                {t.overridden.length > 0 && (
                  <span className="emvb-sources-over">
                    overrides{" "}
                    {t.overridden.map((o) => `${where(o)} (${sourceValue(o.value)})`).join(", ")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
