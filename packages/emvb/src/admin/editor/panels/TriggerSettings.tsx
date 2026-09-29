import { Input } from "@cloudflare/kumo";
import type { PopupOpenTrigger } from "../../../core/index.ts";
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
        max={120000}
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
        max={100}
        value={String(trigger.percent)}
        onChange={(event) =>
          onChange({
            type: "scroll",
            percent: Math.min(100, Math.max(0, Number(event.target.value) || 0)),
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
        min={1000}
        max={120000}
        value={String(trigger.ms)}
        onChange={(event) =>
          onChange({
            type: "inactivity",
            ms: Math.max(1000, Number(event.target.value) || 1000),
          })
        }
      />
    );
  }
  return null;
}
