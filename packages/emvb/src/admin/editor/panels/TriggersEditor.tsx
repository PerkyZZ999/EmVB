import { Button, Input, Select } from "@cloudflare/kumo";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import * as React from "react";
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

/** "Show at most" keeps what is typed and commits on blur or Enter: empty means no limit. */
function ShowTimesField({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (value: number | null) => void;
}) {
  const [draft, setDraft] = React.useState(value === null ? "" : String(value));
  const commit = () => {
    const raw = draft.trim();
    const next = raw === "" ? null : Math.min(100, Math.max(1, Math.round(Number(raw)) || 1));
    setDraft(next === null ? "" : String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <Input
      label="Show at most (times)"
      className={FIELD}
      type="number"
      min={1}
      max={100}
      description="Leave empty for no limit. Counted per visitor's browser, up to 100."
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
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
  /** Removing the only On page load trigger would only put it back, so it can't be removed. */
  const onlyDefault = doc.open.length === 1 && doc.open[0]?.type === "page_load";

  return (
    <div className="emvb-triggers" data-emvb-panel="triggers">
      <h3 className="emvb-section-label">Triggers</h3>
      <p className="emvb-helper">
        When this popup opens. Display conditions still decide which pages include it.
      </p>
      <ul className="emvb-trigger-list">
        {doc.open.map((trigger, index) => (
          <li key={index} className="emvb-trigger-row" data-emvb-trigger={trigger.type}>
            <div className="emvb-trigger-head">
              <Select
                label={index === 0 ? "Open when" : "Or when"}
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
              <Button
                type="button"
                variant="ghost"
                className={BUTTON}
                aria-label="Remove trigger"
                title={onlyDefault ? "The popup needs at least one trigger" : "Remove trigger"}
                disabled={onlyDefault}
                icon={<TrashIcon aria-hidden="true" />}
                onClick={() => removeAt(index)}
              />
            </div>
            <TriggerSettings trigger={trigger} onChange={(next) => updateAt(index, next)} />
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
      <p className="emvb-helper">Limit how often the popup shows, and on which devices.</p>
      <ShowTimesField
        key={String(advanced.showTimes ?? "")}
        value={advanced.showTimes ?? null}
        onCommit={(showTimes) =>
          onChange({ schemaVersion: 1, open: doc.open, advanced: { ...advanced, showTimes } })
        }
      />
      <fieldset className="emvb-device-fieldset">
        <legend className="emvb-field-label">Devices</legend>
        <p className="emvb-helper">All devices when none are checked.</p>
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
