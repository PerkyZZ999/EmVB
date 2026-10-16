import { Button, Input, Select } from "@cloudflare/kumo";
import { PlusIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  cleanClassName,
  slugify,
  variableListFull,
  type DesignSystem,
  type StyleProps,
} from "../../../core/index.ts";

type ColorValue = StyleProps["color"];
import { BUTTON, FIELD } from "../../ui.ts";
import {
  formatOklch,
  formatRgb,
  oklchClipped,
  hexInput,
  parseHex,
  parseOklch,
  parseRgb,
  toHex,
} from "./color-space.ts";
import { InlineError } from "./inline-error.tsx";
import { pickerHex, withPreviousAlpha } from "./variable-values.ts";
import { isCommitEnter } from "../ime.ts";
import { useMediaQuery } from "../useMediaQuery.ts";

/**
 * W-673: Kumo's Input `variant="error"` is deprecated (and warns), and its `error` prop would print
 * a second message under our InlineError, so a refused field gets Kumo's error ring as classes.
 */
const INVALID = " !ring-kumo-danger focus:ring-kumo-danger/50 focus:ring-[1.5px]";
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const NONE = "__none__";
const CUSTOM = "__custom__";
/** Swatch buttons shown under the Select; the rest stay in its list (W-136). */
const SWATCH_LIMIT = 16;
const BAD_HEX = "Enter a hex color such as #1a2b3c.";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Couldn't save site styles. Try again.";

function Swatch({ color }: { color: string }) {
  return <span className="emvb-swatch" style={{ background: color }} aria-hidden="true" />;
}

const uniqueId = (design: DesignSystem, name: string) => {
  const base = slugify(name).slice(0, 34).replace(/-+$/, "") || "color";
  const taken = new Set(design.variables.colors.map((color) => color.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
};

/**
 * Colour: Default, a design variable (R-004) or a custom hex (W-136, D-043). The Select keeps its
 * visible label and shows the current swatch; the site's colour variables also show as swatch
 * buttons under it, and "Custom color" opens a validated hex field with the browser's picker.
 * Creating a variable or editing a bound variable's value saves the design at once (D-013).
 */
export function ColorControl({
  label,
  value,
  design,
  placeholder,
  onChange,
  onDesignChange,
}: {
  label: string;
  value: ColorValue;
  design: DesignSystem;
  /** Shown instead of Default when unset: the Normal value while a state is edited (W-089). */
  placeholder?: string;
  onChange: (value: ColorValue) => void;
  onDesignChange: (design: DesignSystem) => Promise<void>;
}) {
  const colors = design.variables.colors;
  const bound = value && typeof value === "object" ? colors.find((c) => c.id === value.var) : null;
  const [creating, setCreating] = React.useState(false);
  const [customOpen, setCustomOpen] = React.useState(false);
  // The hex an out-of-gamut OKLCH entry was clipped to. It lives here because committing a custom
  // colour remounts CustomColor (W-183).
  const [clipped, setClipped] = React.useState<string | null>(null);
  const custom = typeof value === "string" ? value : null;
  const showCustom = custom !== null || customOpen;

  const selectValue = showCustom ? CUSTOM : value && typeof value === "object" ? value.var : NONE;
  const pick = (next: unknown) => {
    if (next === CUSTOM) {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onChange(next === NONE || next === null ? undefined : { var: String(next) });
  };
  return (
    <div className="emvb-field-group" data-emvb-control="color">
      <Select
        label={label}
        className={FIELD}
        value={selectValue}
        onValueChange={pick}
        renderValue={(current: unknown) => {
          if (current === NONE) return placeholder ?? "Default";
          if (current === CUSTOM)
            return custom ? (
              <>
                <Swatch color={custom} />
                {custom}
              </>
            ) : (
              "Custom color"
            );
          const color = colors.find((c) => c.id === current);
          return color ? (
            <>
              <Swatch color={color.value} />
              {color.name}
            </>
          ) : (
            String(current)
          );
        }}
      >
        <Select.Option value={NONE}>Default</Select.Option>
        {colors.map((color) => (
          <Select.Option key={color.id} value={color.id}>
            <Swatch color={color.value} />
            {color.name}
          </Select.Option>
        ))}
        <Select.Option value={CUSTOM}>Custom color</Select.Option>
      </Select>
      {colors.length > 0 && (
        <div
          className="emvb-swatches"
          role="group"
          aria-label={`${label}: colour variables`}
          data-emvb-swatches=""
        >
          {colors.slice(0, SWATCH_LIMIT).map((color) => (
            <button
              key={color.id}
              type="button"
              className="emvb-swatch-button"
              aria-label={`${color.name} (${color.value})`}
              aria-pressed={bound?.id === color.id}
              title={`${color.name} · ${color.value}`}
              onClick={() => pick(color.id)}
            >
              <Swatch color={color.value} />
            </button>
          ))}
          {colors.length > SWATCH_LIMIT && (
            <span className="emvb-helper">+{colors.length - SWATCH_LIMIT} more in the list</span>
          )}
        </div>
      )}
      {showCustom && (
        <CustomColor
          key={custom ?? "new"}
          value={custom ?? ""}
          label={label}
          clipped={clipped}
          onClipped={setClipped}
          onCommit={onChange}
        />
      )}
      {bound && (
        <VariableValue
          key={bound.id}
          name={bound.name}
          value={bound.value}
          onCommit={async (hex) => {
            await onDesignChange({
              ...design,
              variables: {
                ...design.variables,
                colors: colors.map((c) => (c.id === bound.id ? { ...c, value: hex } : c)),
              },
            });
          }}
        />
      )}
      {creating ? (
        <NewVariable
          onCancel={() => setCreating(false)}
          onCreate={async (raw, hex) => {
            const name = cleanClassName(raw);
            // Past the cap or with no name left the save would fail (W-219).
            if (!name || variableListFull(design, "color")) return;
            const id = uniqueId(design, name);
            await onDesignChange({
              ...design,
              variables: { ...design.variables, colors: [...colors, { id, name, value: hex }] },
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
          disabled={variableListFull(design, "color")}
        >
          New variable
        </Button>
      )}
    </div>
  );
}

/** The custom hex field with the browser's colour picker beside it (W-136). */
function CustomColor({
  value,
  label,
  clipped,
  onClipped,
  onCommit,
}: {
  value: string;
  label: string;
  clipped: string | null;
  onClipped: (hex: string | null) => void;
  onCommit: (hex: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  // The field that refused its entry is the one marked, not always the hex (W-174).
  const [error, setError] = React.useState<{ field: Notation; message: string } | null>(null);
  const picker = React.useRef<HTMLInputElement | null>(null);
  const commit = (next: string) => {
    const typed = next.trim();
    if (typed === value || typed === "") {
      setError(null);
      return;
    }
    const hex = hexInput(typed);
    if (!hex) {
      setError({ field: "hex", message: BAD_HEX });
      return;
    }
    if (hex === value) {
      setError(null);
      setDraft(hex);
      return;
    }
    setDraft(hex);
    setError(null);
    onCommit(hex);
  };
  // The picker applies on its native change event (the dialog closed), not on every drag step.
  React.useEffect(() => {
    const el = picker.current;
    if (!el) return;
    const onPicked = () => {
      const picked = withPreviousAlpha(el.value, value);
      setDraft(picked);
      commit(picked);
    };
    el.addEventListener("change", onPicked);
    return () => el.removeEventListener("change", onPicked);
  });
  return (
    <div className="emvb-custom-color" data-emvb-custom-color="">
      <div className="emvb-custom-color-row">
        <Input
          label="Custom color"
          className={`${FIELD} emvb-mono${error?.field === "hex" ? INVALID : ""}`}
          placeholder="#1a2b3c"
          value={draft}
          aria-invalid={error?.field === "hex" ? true : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => {
            if (isCommitEnter(event)) commit(draft);
          }}
        />
        <input
          type="color"
          className="emvb-color-picker"
          aria-label={`Pick ${label.toLowerCase()}`}
          ref={picker}
          value={pickerHex(HEX.test(draft) ? draft : value || "#000000")}
          onChange={(event) => setDraft(withPreviousAlpha(event.target.value, value))}
        />
      </div>
      {error?.field === "hex" && <InlineError>{error.message}</InlineError>}
      <NotationRow
        label="RGB"
        text={formatRgb(parseHex(HEX.test(draft) ? draft : value) ?? { r: 0, g: 0, b: 0, a: 1 })}
        placeholder="255, 128, 0"
        error={error?.field === "rgb" ? error.message : undefined}
        onCommit={(text) => {
          const next = parseRgb(text);
          if (!next) {
            setError({ field: "rgb", message: RGB_RANGE });
            return;
          }
          setError(null);
          const hex = toHex(next);
          setDraft(hex);
          onCommit(hex);
        }}
      />
      <NotationRow
        label="OKLCH"
        text={formatOklch(parseHex(HEX.test(draft) ? draft : value) ?? { r: 0, g: 0, b: 0, a: 1 })}
        placeholder="62.8, 0.150, 29"
        error={error?.field === "oklch" ? error.message : undefined}
        onCommit={(text) => {
          const next = parseOklch(text);
          if (!next) {
            setError({ field: "oklch", message: OKLCH_RANGE });
            return;
          }
          setError(null);
          const hex = toHex(next);
          onClipped(oklchClipped(text) ? hex : null);
          setDraft(hex);
          onCommit(hex);
        }}
      />
      {clipped !== null && clipped === draft && !error && (
        <p className="emvb-helper" role="status" data-emvb-clipped="">
          Clipped to {clipped}: that OKLCH colour is outside sRGB, so its out-of-range channels were
          cut to fit.
        </p>
      )}
    </div>
  );
}

type Notation = "hex" | "rgb" | "oklch";

// A refusal says the valid ranges, not only an example (W-181).
const RGB_RANGE =
  "Enter red, green and blue from 0 to 255, such as 255, 128, 0. Alpha is optional: 0–1 or 0–100%.";
const OKLCH_RANGE =
  "Enter lightness 0–100 (or 0–1), chroma 0–0.5 and hue 0–360, such as 62.8, 0.150, 29.";

/** A second view of the same colour. Commits on Enter or blur, like the hex field. */
function NotationRow({
  label,
  text,
  placeholder,
  error,
  onCommit,
}: {
  label: string;
  text: string;
  placeholder: string;
  error: string | undefined;
  onCommit: (text: string) => void;
}) {
  const [draft, setDraft] = React.useState(text);
  React.useEffect(() => {
    setDraft(text);
  }, [text]);
  return (
    <>
      <Input
        label={label}
        className={`${FIELD} emvb-mono${error ? INVALID : ""}`}
        placeholder={placeholder}
        value={draft}
        aria-invalid={error ? true : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft.trim() !== text) onCommit(draft);
        }}
        onKeyDown={(event) => {
          if (isCommitEnter(event)) onCommit(draft);
        }}
      />
      {error && <InlineError>{error}</InlineError>}
    </>
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
  const [phase, setPhase] = React.useState<"idle" | "saving" | "saved">("idle");
  const pending = React.useRef(false);
  const commit = async () => {
    if (pending.current) return;
    const hex = hexInput(draft);
    if (hex === value) return;
    if (!hex) {
      setError(BAD_HEX);
      return;
    }
    setError(null);
    setDraft(hex);
    pending.current = true;
    setPhase("saving");
    try {
      await onCommit(hex);
      setPhase("saved");
    } catch (failure) {
      setError(errorText(failure));
      setPhase("idle");
    } finally {
      pending.current = false;
    }
  };
  return (
    <>
      <Input
        label={`${name} value`}
        className={`${FIELD} emvb-mono${error ? INVALID : ""}`}
        value={draft}
        readOnly={phase === "saving"}
        aria-busy={phase === "saving"}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          setPhase("idle");
        }}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (isCommitEnter(event)) void commit();
        }}
      />
      <div className="emvb-variable-value-feedback">
        <p
          className="emvb-helper"
          role="status"
          aria-label="Color variable status"
          aria-live="polite"
        >
          {error
            ? ""
            : phase === "saving"
              ? "Saving color variable…"
              : phase === "saved"
                ? "Color variable saved. Publish styles to make it live."
                : "Style changes stay unpublished until you publish styles."}
        </p>
        {error && <InlineError>{error}</InlineError>}
      </div>
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
  const pending = React.useRef(false);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const create = async () => {
    if (pending.current) return;
    if (!name.trim()) return setError("Enter a name for the variable.");
    const typed = hexInput(hex);
    if (!typed) return setError(BAD_HEX);
    setError(null);
    pending.current = true;
    setBusy(true);
    try {
      await onCreate(name.trim(), typed);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="emvb-new-variable" data-emvb-form="new-variable">
      <Input
        label="Variable name"
        disabled={busy}
        className={FIELD}
        value={name}
        autoFocus
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        label="Value"
        disabled={busy}
        className={`${FIELD} emvb-mono`}
        placeholder="#1a2b3c"
        value={hex}
        onChange={(event) => setHex(event.target.value)}
        onKeyDown={(event) => {
          if (isCommitEnter(event)) void create();
        }}
      />
      {error && <InlineError>{error}</InlineError>}
      <p
        className="emvb-helper emvb-new-variable-status"
        role="status"
        aria-label="Color variable status"
        aria-live="polite"
      >
        {busy ? "Creating color variable…" : ""}
      </p>
      <div className="emvb-row-actions">
        <Button variant="secondary" className={BUTTON} disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="secondary"
          className={BUTTON}
          icon={<PlusIcon size={14} aria-hidden="true" />}
          loading={busy && !reducedMotion}
          disabled={busy}
          aria-busy={busy}
          onClick={() => void create()}
        >
          Create variable
        </Button>
      </div>
    </div>
  );
}
