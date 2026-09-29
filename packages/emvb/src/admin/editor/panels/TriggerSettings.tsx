import { Input } from "@cloudflare/kumo";
import { clampScrollPercent, type PopupOpenTrigger, TRIGGER_LIMITS } from "../../../core/index.ts";
import { FIELD } from "../../ui.ts";

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
      <Input
        label="Delay (ms)"
        className={FIELD}
        type="number"
        min={0}
        max={TRIGGER_LIMITS.maxDelayMs}
        value={String(trigger.ms)}
        onChange={(event) =>
          onChange({
            type: "delay",
            ms: Math.max(0, Number(event.target.value) || 0),
          })
        }
      />
    );
  }
  if (trigger.type === "scroll") {
    return (
      <Input
        label="Scroll percent"
        className={FIELD}
        type="number"
        min={0}
        max={TRIGGER_LIMITS.maxScrollPercent}
        value={String(trigger.percent)}
        onChange={(event) =>
          onChange({
            type: "scroll",
            percent: clampScrollPercent(event.target.value),
          })
        }
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
      <Input
        label="Idle time (ms)"
        className={FIELD}
        type="number"
        min={TRIGGER_LIMITS.minIdleMs}
        max={TRIGGER_LIMITS.maxDelayMs}
        value={String(trigger.ms)}
        onChange={(event) =>
          onChange({
            type: "inactivity",
            ms: Math.max(
              TRIGGER_LIMITS.minIdleMs,
              Number(event.target.value) || TRIGGER_LIMITS.minIdleMs,
            ),
          })
        }
      />
    );
  }
  return null;
}
