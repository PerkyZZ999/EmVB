import { Button, Input } from "@cloudflare/kumo";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import * as React from "react";
import { BUTTON, FIELD } from "../../../ui.ts";

/** Range and scale of a plain number field; `scale` converts stored to shown (opacity 0–1 → %). */
export type NumberSpec = {
  min: number;
  max: number;
  integer?: boolean;
  scale?: number;
  example: string;
  suffix?: string;
  placeholder?: string;
};

/** Checks a number field's text. Empty is unset. Returns the stored number. */
function parseNumberDraft(
  draft: string,
  label: string,
  spec: NumberSpec,
): { ok: true; value: number | undefined } | { ok: false; message: string } {
  const text = draft.trim();
  if (text === "") return { ok: true, value: undefined };
  const n = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isFinite(n))
    return { ok: false, message: `Enter a number, such as ${spec.example}.` };
  if (spec.integer && !Number.isInteger(n)) {
    return { ok: false, message: `${label} must be a whole number.` };
  }
  if (n < spec.min || n > spec.max) {
    return { ok: false, message: `${label} can be from ${spec.min} to ${spec.max}.` };
  }
  const scale = spec.scale ?? 1;
  return { ok: true, value: scale === 1 ? n : Math.round((n / scale) * 1000) / 1000 };
}

const shown = (value: number | undefined, spec: NumberSpec) =>
  value === undefined ? "" : String(Math.round(value * (spec.scale ?? 1) * 1000) / 1000);

/** A mono number input that commits on blur or Enter (W-088). */
export function NumberField({
  fieldKey,
  label,
  value,
  spec,
  onCommit,
}: {
  fieldKey: string;
  label: string;
  value: number | undefined;
  spec: NumberSpec;
  onCommit: (next: number | undefined) => void;
}) {
  const [draft, setDraft] = React.useState(shown(value, spec));
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setDraft(shown(value, spec));
    setError(null);
  }, [value, spec]);

  const commit = () => {
    const parsed = parseNumberDraft(draft, label, spec);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    if (parsed.value !== value) onCommit(parsed.value);
  };

  return (
    <Input
      label={spec.suffix ? `${label} (${spec.suffix})` : label}
      className={`${FIELD} emvb-mono emvb-number`}
      inputMode="decimal"
      value={draft}
      placeholder={spec.placeholder}
      error={error ?? undefined}
      aria-invalid={error ? true : undefined}
      data-emvb-number={fieldKey}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}

/** The row's reset button (W-021): enabled once the property is set. */
export function ResetButton({
  label,
  set,
  onReset,
}: {
  label: string;
  set: boolean;
  onReset: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={`${BUTTON} emvb-reset-btn`}
      aria-label={`Reset ${label} to default`}
      title="Reset to default"
      disabled={!set}
      onClick={onReset}
    >
      <ArrowCounterClockwiseIcon size={14} aria-hidden="true" />
    </Button>
  );
}

/** A number field with its reset button, as one Style row. */
export function NumberRow({
  rowKey,
  label,
  value,
  spec,
  onCommit,
}: {
  rowKey: string;
  label: string;
  value: number | undefined;
  spec: NumberSpec;
  onCommit: (next: number | undefined) => void;
}) {
  const set = value !== undefined;
  return (
    <div className="emvb-style-row" data-emvb-style={rowKey} data-set={set ? "true" : undefined}>
      <NumberField fieldKey={rowKey} label={label} value={value} spec={spec} onCommit={onCommit} />
      <ResetButton label={label} set={set} onReset={() => onCommit(undefined)} />
    </div>
  );
}
