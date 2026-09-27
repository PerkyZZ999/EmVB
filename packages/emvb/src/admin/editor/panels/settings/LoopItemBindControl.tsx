import { Input, Select } from "@cloudflare/kumo";
import * as React from "react";
import type { Fetcher } from "../../../api.ts";
import { listThemeParts, type ThemePartSummary } from "../../../theme-api.ts";
import { FIELD } from "../../../ui.ts";

const MANUAL = "__manual__";
const NONE = "__none__";

/**
 * Loop Item theme-part binder (W-077): pick a published/draft Loop Item by title,
 * keep storing the part id string for render compatibility.
 */
export function LoopItemBindControl({
  value,
  fetcher,
  onChange,
}: {
  value: string;
  fetcher: Fetcher;
  onChange: (itemPartId: string) => void;
}) {
  const [parts, setParts] = React.useState<ThemePartSummary[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void listThemeParts(fetcher)
      .then((all) => {
        if (cancelled) return;
        setParts(all.filter((part) => part.partType === "loop_item"));
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) {
          setParts(null);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetcher]);

  if (parts && parts.length > 0) {
    const known = parts.some((part) => part.id === value);
    const selectValue = value === "" ? NONE : known ? value : MANUAL;
    return (
      <div data-emvb-loop-item-bind="list">
        <Select
          label="Loop Item"
          className={FIELD}
          value={selectValue}
          onValueChange={(next) => {
            if (!next || next === MANUAL) return;
            if (next === NONE) {
              onChange("");
              return;
            }
            onChange(next);
          }}
          renderValue={(current: unknown) => {
            if (current === NONE || current === "") return "Use nested elements";
            if (current === MANUAL) return "Current id (not in list)";
            const match = parts.find((part) => part.id === String(current));
            return match ? labelFor(match) : String(current);
          }}
        >
          <Select.Option value={NONE}>Use nested elements</Select.Option>
          {!known && value ? (
            <Select.Option value={MANUAL}>Current id (not in list)</Select.Option>
          ) : null}
          {parts.map((part) => (
            <Select.Option key={part.id} value={part.id}>
              {labelFor(part)}
            </Select.Option>
          ))}
        </Select>
        <Input
          label="Loop Item part id"
          className={`${FIELD} emvb-mono`}
          value={value}
          onChange={(event) => onChange(event.target.value.trim())}
        />
        <p className="emvb-helper">
          Optional published Loop Item theme part. Leave blank to use nested elements as the item
          template.{" "}
          <a href="/_emdash/admin/plugins/emvb/theme">Open Theme Builder</a>
        </p>
      </div>
    );
  }

  return (
    <div data-emvb-loop-item-bind="manual">
      <Input
        label="Loop Item part id"
        className={`${FIELD} emvb-mono`}
        value={value}
        onChange={(event) => onChange(event.target.value.trim())}
      />
      <p className="emvb-helper">
        {failed
          ? "Could not load Loop Item parts. Paste a theme-part id, or "
          : "No Loop Item theme parts yet. Paste an id, or "}
        <a href="/_emdash/admin/plugins/emvb/theme">create one in Theme Builder</a>.
      </p>
    </div>
  );
}

function labelFor(part: ThemePartSummary): string {
  const status = part.status === "published" ? "" : ` (${part.status})`;
  return `${part.title}${status}`;
}
