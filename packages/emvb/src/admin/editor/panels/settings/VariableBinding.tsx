import { DropdownMenu } from "@cloudflare/kumo";
import { BracketsCurlyIcon, RulerIcon, TextAaIcon, TextTIcon, XIcon } from "@phosphor-icons/react";
import type { DesignSystem, StyleProps } from "../../../../core/index.ts";
import type { StyleKey } from "./style-sections.ts";

/** Variable kinds a length or font property can bind to. Colours bind through ColorControl. */
export type BindKind = "font" | "fontSize" | "spacing";

const SPACING_KEYS = new Set<StyleKey>([
  "gap",
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
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
]);

/** The variable kind a style property takes, or null when it has no variable button. */
export function bindKind(key: StyleKey): BindKind | null {
  if (key === "fontFamily") return "font";
  if (key === "fontSize") return "fontSize";
  return SPACING_KEYS.has(key) ? "spacing" : null;
}

type Variable = { id: string; name: string; value: string | { value: number; unit: string } };

const LIST = { font: "fonts", fontSize: "fontSizes", spacing: "spacings" } as const;
const NOUN = { font: "font", fontSize: "font size", spacing: "spacing" } as const;
const KIND_ICON = { font: TextTIcon, fontSize: TextAaIcon, spacing: RulerIcon } as const;

const variablesOf = (design: DesignSystem, kind: BindKind): readonly Variable[] =>
  design.variables[LIST[kind]] ?? [];

const shown = (value: Variable["value"]) =>
  typeof value === "string" ? value : `${value.value}${value.unit}`;

/** A bound `{ var }` reference of `kind`, if `value` is one. */
export function boundRef(value: unknown, kind: BindKind): { var: string } | null {
  if (!value || typeof value !== "object" || !("var" in value)) return null;
  const ref = value as { var: string; from?: string };
  return ref.from === kind ? ref : null;
}

/**
 * Any length variable a value is bound to, whatever the row's own kind: a spacing variable on
 * Font size still renders as `var(--emvb-s-…)`, so it shows as a spacing chip (W-088).
 */
export function lengthRef(value: unknown): { var: string; kind: "fontSize" | "spacing" } | null {
  if (!value || typeof value !== "object" || !("var" in value)) return null;
  const ref = value as { var: string; from?: string };
  return ref.from === "fontSize" || ref.from === "spacing"
    ? { var: ref.var, kind: ref.from }
    : null;
}

/** The variable button (Phosphor BracketsCurly): lists the site's variables of the kind. */
export function VariableButton({
  label,
  kind,
  design,
  current,
  onBind,
}: {
  label: string;
  kind: BindKind;
  design: DesignSystem;
  current: string | null;
  onBind: (ref: NonNullable<StyleProps["gap"]>) => void;
}) {
  const list = variablesOf(design, kind);
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger>
        <button
          type="button"
          className="emvb-var-btn"
          aria-label={`Use a variable for ${label}`}
          title="Use a variable"
          data-active={current ? "true" : undefined}
        >
          <BracketsCurlyIcon size={16} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content data-emvb-var-menu={kind}>
        {list.length === 0 ? (
          <DropdownMenu.Item disabled>
            No {NOUN[kind]} variables yet. Add them in Site styles.
          </DropdownMenu.Item>
        ) : (
          list.map((variable) => (
            <DropdownMenu.Item
              key={variable.id}
              data-emvb-var-option={variable.id}
              data-selected={variable.id === current ? "true" : undefined}
              onClick={() => onBind({ var: variable.id, from: kind })}
            >
              <span className="emvb-var-option">
                <span
                  className="emvb-var-option-sample"
                  aria-hidden="true"
                  style={kind === "font" ? { fontFamily: shown(variable.value) } : undefined}
                >
                  {kind === "font" ? "Ag" : kind === "fontSize" ? "Aa" : ""}
                </span>
                <span className="emvb-var-option-name">{variable.name}</span>
                <span className="emvb-var-option-value">{shown(variable.value)}</span>
              </span>
            </DropdownMenu.Item>
          ))
        )}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

/**
 * The variable chip that stands in for a bound value (DESIGN.md): the kind icon, the variable's
 * name and an × that detaches it, keeping the variable's current value as a literal.
 */
export function VariableChip({
  label,
  kind,
  design,
  id,
  onDetach,
}: {
  label: string;
  kind: BindKind;
  design: DesignSystem;
  id: string;
  onDetach: (literal: Variable["value"] | undefined) => void;
}) {
  const variable = variablesOf(design, kind).find((v) => v.id === id);
  const Icon = KIND_ICON[kind];
  return (
    <div className="emvb-var-field" data-emvb-var-bound={id}>
      <span className="emvb-var-field-label">{label}</span>
      <span
        className="emvb-var-chip"
        data-missing={variable ? undefined : "true"}
        title={
          variable ? `${variable.name} · ${shown(variable.value)}` : "This variable was deleted"
        }
      >
        <Icon size={14} aria-hidden="true" />
        <span className="emvb-var-chip-name">{variable?.name ?? `Missing (${id})`}</span>
        {variable && <span className="emvb-var-chip-value">{shown(variable.value)}</span>}
        <button
          type="button"
          className="emvb-var-chip-x"
          aria-label={`Detach ${variable?.name ?? id} from ${label}`}
          onClick={() => onDetach(variable?.value)}
        >
          <XIcon size={12} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}
