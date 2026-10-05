import { DropdownMenu } from "@cloudflare/kumo";
import { CaretDownIcon, LinkSimpleBreakIcon, LinkSimpleIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { DesignSystem, StyleProps } from "../../../../core/index.ts";
import {
  allSame,
  groupSet,
  linkedPatch,
  linkPatch,
  resetPatch,
  sideDraft,
  sidePatch,
  sideValues,
  sharedUnit,
  unitPatch,
  type BoxGroup,
} from "./box-sides.ts";
import { parseLengthDraft, unitsFor, type LengthUnit } from "./length-units.ts";
import { ResetButton } from "./NumberRow.tsx";
import { STYLE_LABELS } from "./style-sections.ts";
import { placeholderOf } from "./StyleRow.tsx";
import { bindKind, boundRef, VariableButton } from "./VariableBinding.tsx";

/**
 * Four boxes with one unit menu and a link toggle (W-138, D-044): padding, margin, border width
 * per side and radius per corner. Linked, a value typed in any box goes to all four.
 */
export function BoxControl({
  group,
  style,
  inherited,
  design,
  onPatch,
}: {
  group: BoxGroup;
  style: StyleProps | undefined;
  /** The Normal styles while a state is edited, shown as placeholders (W-089). */
  inherited?: StyleProps;
  design: DesignSystem;
  onPatch: (patch: Partial<StyleProps>) => void;
}) {
  const values = sideValues(group, style);
  const normal = inherited ? sideValues(group, inherited) : [];
  const same = allSame(values);
  const [linkWanted, setLinkWanted] = React.useState(same);
  // Linked only while all four match (W-149). Cleared to all empty (Reset, undo), it links again.
  const signature = JSON.stringify(values);
  const allEmpty = values.every((value) => value === undefined);
  React.useEffect(() => {
    if (allEmpty) setLinkWanted(true);
  }, [signature, allEmpty]);
  const linked = linkWanted && same;
  const units = unitsFor(group.sides[0]).filter((u): u is LengthUnit => u !== "auto");
  const [fallbackUnit, setFallbackUnit] = React.useState<LengthUnit>(units[0] ?? "px");
  const unit = sharedUnit(values, fallbackUnit);
  const [error, setError] = React.useState<{ index: number; message: string } | null>(null);
  const labelId = React.useId();
  const set = groupSet(group, style);
  const kind = bindKind(group.sides[0]);
  const refs = values.map((value) => (kind ? boundRef(value, kind)?.var : undefined));
  const boundAll = kind && same && refs[0] ? refs[0] : null;

  const commit = (index: number, draft: string) => {
    const current = values[index];
    if (draft === sideDraft(current, unit, placeholderOf(current, design))) {
      setError(null);
      return;
    }
    const key = group.sides[index] as (typeof group.sides)[number];
    const parsed = parseLengthDraft(draft, key, unit);
    if (!parsed.ok) {
      setError({ index, message: parsed.message });
      return;
    }
    setError(null);
    onPatch(linked ? linkedPatch(group, parsed.value) : sidePatch(group, index, parsed.value));
  };

  const toggleLink = () => {
    if (linked) {
      setLinkWanted(false);
      return;
    }
    setLinkWanted(true);
    if (!same) onPatch(linkPatch(group, style));
  };

  const linkLabel = `Link ${group.label.toLowerCase()} ${group.noun}`;
  return (
    <div
      className="emvb-style-row emvb-box"
      data-emvb-box={group.id}
      data-set={set ? "true" : undefined}
      data-linked={linked ? "true" : undefined}
      data-unit={unit}
    >
      <div className="emvb-box-body">
        <div className="emvb-box-head">
          <span className="emvb-box-label" id={labelId}>
            {group.label}
          </span>
          <DropdownMenu>
            <DropdownMenu.Trigger>
              <button
                type="button"
                className="emvb-unit-btn"
                aria-label={`${group.label} unit (${unit})`}
                data-emvb-unit={unit}
              >
                {unit}
                <CaretDownIcon size={12} aria-hidden="true" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content data-emvb-unit-menu={group.id}>
              <DropdownMenu.RadioGroup
                value={unit}
                onValueChange={(next: LengthUnit) => {
                  setFallbackUnit(next);
                  const patch = unitPatch(group, style, next);
                  if (Object.keys(patch).length > 0) onPatch(patch);
                }}
              >
                {units.map((choice) => (
                  <DropdownMenu.RadioItem
                    key={choice}
                    value={choice}
                    closeOnClick
                    data-emvb-unit-option={choice}
                  >
                    <span className="emvb-mono">{choice}</span>
                    <DropdownMenu.RadioItemIndicator />
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu>
          {kind && (
            <VariableButton
              label={group.label}
              kind={kind}
              design={design}
              current={boundAll}
              onBind={(ref) => {
                setLinkWanted(true);
                onPatch(linkedPatch(group, ref));
              }}
            />
          )}
          <button
            type="button"
            className="emvb-link-btn"
            aria-label={linkLabel}
            aria-pressed={linked}
            title={linked ? `Linked: one value for all ${group.noun}` : `Link the ${group.noun}`}
            data-emvb-box-link={group.id}
            onClick={toggleLink}
          >
            {linked ? (
              <LinkSimpleIcon size={16} aria-hidden="true" />
            ) : (
              <LinkSimpleBreakIcon size={16} aria-hidden="true" />
            )}
          </button>
        </div>
        <div className="emvb-box-sides" role="group" aria-labelledby={labelId}>
          {group.sides.map((key, index) => (
            <SideBox
              key={key}
              label={STYLE_LABELS[key]}
              name={group.names[index] ?? ""}
              styleKey={key}
              text={sideDraft(values[index], unit, placeholderOf(values[index], design))}
              placeholder={placeholderOf(normal[index], design)}
              bound={refs[index] !== undefined}
              invalid={error?.index === index}
              onCommit={(draft) => commit(index, draft)}
            />
          ))}
        </div>
        {error && (
          <p className="emvb-box-error" role="alert">
            {error.message}
          </p>
        )}
      </div>
      <ResetButton
        label={group.label}
        set={set}
        onReset={() => {
          setError(null);
          onPatch(resetPatch(group));
        }}
      />
    </div>
  );
}

function SideBox({
  label,
  name,
  styleKey,
  text,
  placeholder,
  bound,
  invalid,
  onCommit,
}: {
  label: string;
  name: string;
  styleKey: string;
  text: string;
  placeholder?: string;
  bound: boolean;
  invalid: boolean;
  onCommit: (draft: string) => void;
}) {
  const [draft, setDraft] = React.useState(text);
  React.useEffect(() => setDraft(text), [text]);
  return (
    <label className="emvb-box-side">
      <input
        className="emvb-box-input emvb-mono"
        aria-label={label}
        data-emvb-box-side={styleKey}
        data-bound={bound ? "true" : undefined}
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        aria-invalid={invalid ? true : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onCommit(draft);
        }}
      />
      <span className="emvb-box-name" aria-hidden="true">
        {name}
      </span>
    </label>
  );
}
