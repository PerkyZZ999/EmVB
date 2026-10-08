import { Input, Select } from "@cloudflare/kumo";
import * as React from "react";
import type { ThemePartType } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { listThemeParts, type ThemePartSummary } from "../../../theme-api.ts";
import { FIELD } from "../../../ui.ts";
import { useAdminLinks } from "../../host.ts";

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
  partType = "loop_item",
  label = "Loop Item",
  emptyLabel = "Use nested elements",
  marker = "loop-item",
}: {
  value: string;
  fetcher: Fetcher;
  onChange: (itemPartId: string) => void;
  partType?: ThemePartType;
  label?: string;
  emptyLabel?: string;
  /** `data-emvb-${marker}-bind` keeps the loop-item tests stable. */
  marker?: string;
}) {
  const [parts, setParts] = React.useState<ThemePartSummary[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const adminLinks = useAdminLinks();

  React.useEffect(() => {
    let cancelled = false;
    void listThemeParts(fetcher)
      .then((all) => {
        if (cancelled) return;
        setParts(all.filter((part) => part.partType === partType));
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
  }, [fetcher, partType]);

  if (parts && parts.length > 0) {
    const known = parts.some((part) => part.id === value);
    const selectValue = value === "" ? NONE : known ? value : MANUAL;
    return (
      <div {...{ [`data-emvb-${marker}-bind`]: "list" }}>
        <Select
          label={label}
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
            if (current === NONE || current === "") return emptyLabel;
            if (current === MANUAL) return "Current id (not in list)";
            const match = parts.find((part) => part.id === String(current));
            return match ? labelFor(match) : String(current);
          }}
        >
          <Select.Option value={NONE}>{emptyLabel}</Select.Option>
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
          label={`${label} part id`}
          className={`${FIELD} emvb-mono`}
          value={value}
          onChange={(event) => onChange(event.target.value.trim())}
        />
        <p className="emvb-helper">
          Optional published {label} theme part. Leave blank to use nested elements.
          {adminLinks && <a href="/_emdash/admin/plugins/emvb/theme"> Open Theme Builder</a>}
        </p>
      </div>
    );
  }

  return (
    <div {...{ [`data-emvb-${marker}-bind`]: "manual" }}>
      <Input
        label={`${label} part id`}
        className={`${FIELD} emvb-mono`}
        value={value}
        onChange={(event) => onChange(event.target.value.trim())}
      />
      <p className="emvb-helper">
        {failed
          ? `Could not load ${label} parts. Paste a theme-part id${adminLinks ? ", or " : "."}`
          : `No ${label} theme parts yet. Paste an id${adminLinks ? ", or " : "."}`}
        {adminLinks && (
          <>
            <a href="/_emdash/admin/plugins/emvb/theme">create one in Theme Builder</a>.
          </>
        )}
      </p>
    </div>
  );
}

function labelFor(part: ThemePartSummary): string {
  const status = part.status === "published" ? "" : ` (${part.status})`;
  return `${part.title}${status}`;
}
