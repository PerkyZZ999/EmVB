import { Input } from "@cloudflare/kumo";
import * as React from "react";
import { FIELD } from "../../../ui.ts";

/** Range and scale of a plain number row; `scale` converts stored to shown (opacity 0–1 → %). */
export type NumberSpec = {
  min: number;
  max: number;
  integer?: boolean;
  scale?: number;
  example: string;
  placeholder?: string;
};

/** Checks a number row's text. Empty is unset. Returns the stored number. */
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

/** A mono number input that commits on blur or Enter (W-088: z-index, opacity, filters). */
export function NumberRow({
  rowKey,
  label,
  value,
  spec,
  set,
  onCommit,
  reset,
}: {
  rowKey: string;
  label: string;
  value: number | undefined;
  spec: NumberSpec;
  set: boolean;
  onCommit: (next: number | undefined) => void;
  reset: React.ReactNode;
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
    <div className="emvb-style-row" data-emvb-style={rowKey} data-set={set ? "true" : undefined}>
      <Input
        label={label}
        className={`${FIELD} emvb-mono emvb-number`}
        inputMode="decimal"
        value={draft}
        placeholder={spec.placeholder}
        error={error ?? undefined}
        aria-invalid={error ? true : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
      {reset}
    </div>
  );
}
