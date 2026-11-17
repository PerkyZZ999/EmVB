import { Button, Input, Select } from "@cloudflare/kumo";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  defaultTriggers,
  MAX_POPUP_TRIGGERS,
  type PopupOpenTrigger,
  type TriggersDoc,
  type UrlParamRule,
  validateTriggers,
} from "../../../core/index.ts";
import { BUTTON, FIELD } from "../../ui.ts";
import { TriggerSettings } from "./TriggerSettings.tsx";
import { isCommitEnter } from "../ime.ts";
import { formatUrlRules, parseUrlRules } from "./url-rules.ts";

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
      description="Leave empty for no limit. Counted per visitor's browser, up to 100. A click trigger always opens."
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (isCommitEnter(event)) commit();
      }}
    />
  );
}

/** W-1081: a show-from or show-until moment, typed as a Countdown's target; empty clears it. */
function ShowDateField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string | null;
  onCommit: (value: string | null) => void;
}) {
  const [draft, setDraft] = React.useState(value ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const commit = () => {
    const raw = draft.trim();
    if (raw === "") {
      setError(null);
      if (value !== null) onCommit(null);
      return;
    }
    if (
      !validateTriggers({
        schemaVersion: 1,
        open: [{ type: "page_load" }],
        advanced: { from: raw },
      }).ok
    ) {
      setError("Use a date, time and UTC offset such as 2026-12-01T09:00-05:00.");
      return;
    }
    setError(null);
    if (raw !== value) onCommit(raw);
  };
  return (
    <Input
      label={label}
      className={FIELD}
      placeholder="2026-12-01T09:00-05:00"
      value={draft}
      {...(error ? { error } : {})}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (isCommitEnter(event)) commit();
      }}
    />
  );
}

/** W-1081: the URL rules, one per line, committed on blur when every line reads. */
function UrlRulesField({
  value,
  onCommit,
}: {
  value: UrlParamRule[] | null;
  onCommit: (rules: UrlParamRule[] | null) => void;
}) {
  const id = React.useId();
  const [draft, setDraft] = React.useState(formatUrlRules(value));
  const [error, setError] = React.useState<string | null>(null);
  const commit = () => {
    const parsed = parseUrlRules(draft);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    const next = parsed.rules.length > 0 ? parsed.rules : null;
    if (formatUrlRules(next) !== formatUrlRules(value)) onCommit(next);
  };
  return (
    <div className="emvb-field-group" data-emvb-url-rules="">
      <label className="emvb-field-label" htmlFor={id}>
        Only when the page address has
      </label>
      <textarea
        id={id}
        className={`${FIELD} emvb-textarea`}
        rows={3}
        value={draft}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
      />
      <p className="emvb-helper" id={`${id}-hint`}>
        One rule per line: utm_source=newsletter (that value), coupon (any value), or !preview (not
        there). Every rule must hold. Empty: every address.
      </p>
      {error && (
        <p className="emvb-inline-error" role="alert" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Popup open triggers + advanced rules (S7b / W-081): how often, devices, the page address and
 * show dates (W-1081). Gap vs Elementor (deferred): A/B.
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
  /** W-280: a popup saves with at most this many triggers; one more would make the save fail. */
  const full = doc.open.length >= MAX_POPUP_TRIGGERS;
  const fullReason = `${MAX_POPUP_TRIGGERS} triggers is the most one popup can have. Remove one to add another.`;

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
        disabled={full}
        title={full ? fullReason : undefined}
        onClick={() => {
          if (!full) setOpen([...doc.open, blankTrigger("page_load")]);
        }}
      >
        Add trigger
      </Button>
      {full && (
        <p className="emvb-helper" data-emvb-triggers-full="">
          {fullReason}
        </p>
      )}

      <h3 className="emvb-section-label">Advanced</h3>
      <p className="emvb-helper">
        Limit how often the popup shows, on which devices, on which addresses and when.
      </p>
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
      <UrlRulesField
        key={formatUrlRules(advanced.urlParams)}
        value={advanced.urlParams ?? null}
        onCommit={(urlParams) =>
          onChange({ schemaVersion: 1, open: doc.open, advanced: { ...advanced, urlParams } })
        }
      />
      <ShowDateField
        key={`from:${advanced.from ?? ""}`}
        label="Show from"
        value={advanced.from ?? null}
        onCommit={(from) =>
          onChange({ schemaVersion: 1, open: doc.open, advanced: { ...advanced, from } })
        }
      />
      <ShowDateField
        key={`until:${advanced.until ?? ""}`}
        label="Show until"
        value={advanced.until ?? null}
        onCommit={(until) =>
          onChange({ schemaVersion: 1, open: doc.open, advanced: { ...advanced, until } })
        }
      />
    </div>
  );
}
