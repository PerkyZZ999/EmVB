import { Button, Input, Select } from "@cloudflare/kumo";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { defaultTriggers, type PopupOpenTrigger, type TriggersDoc } from "../../../core/index.ts";
import { BUTTON, FIELD } from "../../ui.ts";
import { TriggerSettings } from "./TriggerSettings.tsx";

type Props = {
  triggers: TriggersDoc | undefined;
  onChange: (triggers: TriggersDoc) => void;
};

const TRIGGER_TYPES = [
  { value: "page_load", label: "On page load" },
  { value: "delay", label: "After delay" },
  { value: "scroll", label: "On scroll" },
  { value: "click", label: "On click (selector)" },
  { value: "exit_intent", label: "Exit intent" },
  { value: "inactivity", label: "After inactivity" },
] as const;

type TriggerType = (typeof TRIGGER_TYPES)[number]["value"];

function blankTrigger(type: TriggerType): PopupOpenTrigger {
  switch (type) {
    case "page_load":
      return { type: "page_load" };
    case "delay":
      return { type: "delay", ms: 3000 };
    case "scroll":
      return { type: "scroll", percent: 50 };
    case "click":
      return { type: "click", selector: "" };
    case "exit_intent":
      return { type: "exit_intent" };
    case "inactivity":
      return { type: "inactivity", ms: 30_000 };
  }
}

/**
 * Popup open triggers + thin advanced rules (S7b / W-081).
 * Gaps vs Elementor (deferred): URL rules, scheduling, A/B.
 */
export function TriggersEditor({ triggers, onChange }: Props) {
  const doc = triggers ?? defaultTriggers();
  const setOpen = (open: PopupOpenTrigger[]) =>
    onChange({ schemaVersion: 1, open, advanced: doc.advanced ?? {} });

  const updateAt = (index: number, next: PopupOpenTrigger) => {
    setOpen(doc.open.map((t, i) => (i === index ? next : t)));
  };

  const removeAt = (index: number) => {
    const open = doc.open.filter((_, i) => i !== index);
    setOpen(open.length ? open : [{ type: "page_load" }]);
  };

  const advanced = doc.advanced ?? {};

  return (
    <div className="emvb-triggers" data-emvb-panel="triggers">
      <h3 className="emvb-section-label">Triggers</h3>
      <p className="emvb-helper">
        When this popup opens. Display conditions still decide which pages include it.
      </p>
      <ul className="emvb-trigger-list">
        {doc.open.map((trigger, index) => (
          <li key={index} className="emvb-trigger-row" data-emvb-trigger={trigger.type}>
            <Select
              label={index === 0 ? "Open when" : undefined}
              className={FIELD}
              value={trigger.type}
              onValueChange={(value) => {
                const type = (TRIGGER_TYPES.find((o) => o.value === value)?.value ??
                  "page_load") as TriggerType;
                updateAt(index, blankTrigger(type));
              }}
              renderValue={(value: unknown) =>
                TRIGGER_TYPES.find((o) => o.value === value)?.label ?? String(value)
              }
            >
              {TRIGGER_TYPES.map((option) => (
                <Select.Option key={option.value} value={option.value}>
                  {option.label}
                </Select.Option>
              ))}
            </Select>
            <TriggerSettings trigger={trigger} onChange={(next) => updateAt(index, next)} />
            <Button
              type="button"
              variant="ghost"
              className={BUTTON}
              aria-label="Remove trigger"
              icon={<TrashIcon aria-hidden="true" />}
              onClick={() => removeAt(index)}
            />
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="secondary"
        className={BUTTON}
        icon={<PlusIcon aria-hidden="true" />}
        onClick={() => setOpen([...doc.open, blankTrigger("page_load")])}
      >
        Add trigger
      </Button>

      <h3 className="emvb-section-label">Advanced</h3>
      <p className="emvb-helper">
        MVP-thin: show limit and devices. URL rules, scheduling, and A/B are later.
      </p>
      <Input
        label="Show at most (times)"
        className={FIELD}
        type="number"
        min={1}
        max={100}
        description="Leave empty for unlimited. Counted per browser (localStorage)."
        value={
          advanced.showTimes === null || advanced.showTimes === undefined
            ? ""
            : String(advanced.showTimes)
        }
        onChange={(event) => {
          const raw = event.target.value.trim();
          const showTimes = raw === "" ? null : Math.max(1, Number(raw) || 1);
          onChange({
            schemaVersion: 1,
            open: doc.open,
            advanced: { ...advanced, showTimes },
          });
        }}
      />
      <fieldset className="emvb-device-fieldset">
        <legend className="emvb-helper">Devices (all if none checked)</legend>
        {(
          [
            ["desktop", "Desktop"],
            ["tablet", "Tablet"],
            ["mobile", "Mobile"],
          ] as const
        ).map(([value, label]) => {
          const selected = advanced.devices ?? [];
          const checked = selected.includes(value);
          return (
            <label key={value} className="emvb-device-option">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected.filter((d) => d !== value), value]
                    : selected.filter((d) => d !== value);
                  onChange({
                    schemaVersion: 1,
                    open: doc.open,
                    advanced: {
                      ...advanced,
                      devices: next.length ? next : null,
                    },
                  });
                }}
              />{" "}
              {label}
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}
