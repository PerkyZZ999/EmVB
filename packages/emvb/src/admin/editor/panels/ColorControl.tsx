import { Button, Input, Select } from "@cloudflare/kumo";
import { PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import * as React from "react";
import { slugify, type DesignSystem, type StyleProps } from "../../../core/index.ts";

type ColorValue = StyleProps["color"];
import { BUTTON, FIELD } from "../../ui.ts";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const NONE = "__none__";
const BAD_HEX = "Enter a hex color such as #1a2b3c.";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Couldn't save site styles. Try again.";

function InlineError({ children }: { children: string }) {
  return (
    <p className="emvb-inline-error" role="alert">
      <WarningCircleIcon size={16} aria-hidden="true" />
      {children}
    </p>
  );
}

const uniqueId = (design: DesignSystem, name: string) => {
  const base = slugify(name).slice(0, 34) || "color";
  const taken = new Set(design.variables.colors.map((color) => color.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
};

/**
 * Colour bound to a design variable (R-004 partial). Creating a variable or editing a bound
 * variable's value saves the design at once: it applies to every page (D-013).
 */
export function ColorControl({
  label,
  value,
  design,
  onChange,
  onDesignChange,
}: {
  label: string;
  value: ColorValue;
  design: DesignSystem;
  onChange: (value: ColorValue) => void;
  onDesignChange: (design: DesignSystem) => Promise<void>;
}) {
  const colors = design.variables.colors;
  const bound = value && typeof value === "object" ? colors.find((c) => c.id === value.var) : null;
  const [creating, setCreating] = React.useState(false);

  const selectValue = !value ? NONE : typeof value === "object" ? value.var : value;
  return (
    <div className="emvb-field-group" data-emvb-control="color">
      <Select
        label={label}
        className={FIELD}
        value={selectValue}
        onValueChange={(next) =>
          onChange(
            next === NONE
              ? undefined
              : HEX.test(String(next))
                ? String(next)
                : { var: String(next) },
          )
        }
        renderValue={(current: unknown) =>
          current === NONE
            ? "Default"
            : (colors.find((c) => c.id === current)?.name ?? String(current))
        }
      >
        <Select.Option value={NONE}>Default</Select.Option>
        {typeof value === "string" && <Select.Option value={value}>{value}</Select.Option>}
        {colors.map((color) => (
          <Select.Option key={color.id} value={color.id}>
            <span className="emvb-swatch" style={{ background: color.value }} aria-hidden="true" />
            {color.name}
          </Select.Option>
        ))}
      </Select>
      {bound && (
        <VariableValue
          key={bound.id}
          name={bound.name}
          value={bound.value}
          onCommit={async (hex) => {
            await onDesignChange({
              ...design,
              variables: {
                colors: colors.map((c) => (c.id === bound.id ? { ...c, value: hex } : c)),
              },
            });
          }}
        />
      )}
      {creating ? (
        <NewVariable
          onCancel={() => setCreating(false)}
          onCreate={async (name, hex) => {
            const id = uniqueId(design, name);
            await onDesignChange({
              ...design,
              variables: { colors: [...colors, { id, name, value: hex }] },
            });
            onChange({ var: id });
            setCreating(false);
          }}
        />
      ) : (
        <Button
          variant="ghost"
          className={BUTTON}
          icon={<PlusIcon aria-hidden="true" />}
          onClick={() => setCreating(true)}
        >
          New variable
        </Button>
      )}
    </div>
  );
}

function VariableValue({
  name,
  value,
  onCommit,
}: {
  name: string;
  value: string;
  onCommit: (hex: string) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState(value);
  const [error, setError] = React.useState<string | null>(null);
  const commit = async () => {
    if (draft === value) return;
    if (!HEX.test(draft)) {
      setError(BAD_HEX);
      return;
    }
    setError(null);
    try {
      await onCommit(draft);
    } catch (failure) {
      setError(errorText(failure));
    }
  };
  return (
    <>
      <Input
        label={`${name} value`}
        className={`${FIELD} emvb-mono`}
        value={draft}
        variant={error ? "error" : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") void commit();
        }}
      />
      {error ? (
        <InlineError>{error}</InlineError>
      ) : (
        <p className="emvb-helper">Changes to site styles apply to all pages immediately.</p>
      )}
    </>
  );
}

function NewVariable({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (name: string, hex: string) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [hex, setHex] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const create = async () => {
    if (!name.trim()) return setError("Enter a name for the variable.");
    if (!HEX.test(hex)) return setError(BAD_HEX);
    setError(null);
    setBusy(true);
    try {
      await onCreate(name.trim(), hex);
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  };
  return (
    <div className="emvb-new-variable" data-emvb-form="new-variable">
      <Input
        label="Variable name"
        className={FIELD}
        value={name}
        autoFocus
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        label="Value"
        className={`${FIELD} emvb-mono`}
        placeholder="#1a2b3c"
        value={hex}
        onChange={(event) => setHex(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void create();
        }}
      />
      {error && <InlineError>{error}</InlineError>}
      <div className="emvb-row-actions">
        <Button variant="secondary" className={BUTTON} onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="secondary" className={BUTTON} loading={busy} onClick={() => void create()}>
          Create variable
        </Button>
      </div>
    </div>
  );
}
