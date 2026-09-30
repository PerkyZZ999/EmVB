import { Input } from "@cloudflare/kumo";
import * as React from "react";
import { clampScrollPercent, type PopupOpenTrigger, TRIGGER_LIMITS } from "../../../core/index.ts";
import { FIELD } from "../../ui.ts";

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * A number field that keeps what is typed and commits on blur or Enter (W-087), so a lower bound
 * never rewrites the first keystroke (typing 5000 into Idle time used to jump to 1000).
 */
function NumberField({
  label,
  value,
  min,
  max,
  description,
  normalize,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  description?: string;
  normalize: (raw: string) => number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = React.useState(String(value));
  const commit = () => {
    const next = normalize(draft);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <Input
      label={label}
      className={FIELD}
      type="number"
      min={min}
      max={max}
      description={description}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}

const seconds = (ms: number) =>
  `${(ms / 1000).toLocaleString("en", { maximumFractionDigits: 1 })} s`;

/** The per-type settings row inside a popup trigger (S7b / W-081). */
export function TriggerSettings({
  trigger,
  onChange,
}: {
  trigger: PopupOpenTrigger;
  onChange: (next: PopupOpenTrigger) => void;
}) {
  if (trigger.type === "delay") {
    return (
      <NumberField
        key={trigger.ms}
        label="Delay (ms)"
        value={trigger.ms}
        min={0}
        max={TRIGGER_LIMITS.maxDelayMs}
        description={`${seconds(trigger.ms)} after the page loads. Up to 120 000 ms.`}
        normalize={(raw) => clamp(Number(raw) || 0, 0, TRIGGER_LIMITS.maxDelayMs)}
        onCommit={(ms) => onChange({ type: "delay", ms })}
      />
    );
  }
  if (trigger.type === "scroll") {
    return (
      <NumberField
        key={trigger.percent}
        label="Scroll percent"
        value={trigger.percent}
        min={0}
        max={TRIGGER_LIMITS.maxScrollPercent}
        description="How far down the page, from 0 to 100."
        normalize={clampScrollPercent}
        onCommit={(percent) => onChange({ type: "scroll", percent })}
      />
    );
  }
  if (trigger.type === "click") {
    return (
      <Input
        label="CSS selector"
        className={`${FIELD} emvb-mono`}
        value={trigger.selector}
        placeholder=".open-popup"
        description="Clicking any element that matches opens the popup."
        onChange={(event) => onChange({ type: "click", selector: event.target.value })}
      />
    );
  }
  if (trigger.type === "exit_intent") {
    return (
      <p className="emvb-helper">
        Opens when the pointer leaves toward the top of the viewport (desktop).
      </p>
    );
  }
  if (trigger.type === "inactivity") {
    return (
      <NumberField
        key={trigger.ms}
        label="Idle time (ms)"
        value={trigger.ms}
        min={TRIGGER_LIMITS.minIdleMs}
        max={TRIGGER_LIMITS.maxDelayMs}
        description={`${seconds(trigger.ms)} without scrolling, typing, clicking or moving the pointer.`}
        normalize={(raw) =>
          clamp(
            Number(raw) || TRIGGER_LIMITS.minIdleMs,
            TRIGGER_LIMITS.minIdleMs,
            TRIGGER_LIMITS.maxDelayMs,
          )
        }
        onCommit={(ms) => onChange({ type: "inactivity", ms })}
      />
    );
  }
  return null;
}
