import { Button } from "@cloudflare/kumo";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { defaultConditions, type ConditionRule, type ConditionsDoc } from "../../../core/index.ts";
import { BUTTON, FIELD } from "../../ui.ts";

type Props = {
  conditions: ConditionsDoc | undefined;
  onChange: (conditions: ConditionsDoc) => void;
};

const GROUP_OPTIONS = [
  { value: "general:entire_site", label: "Entire site", group: "general", name: "entire_site" },
  { value: "singular:front", label: "Front page", group: "singular", name: "front" },
  { value: "singular:all", label: "All singular", group: "singular", name: "all" },
  { value: "singular:not_found", label: "404 page", group: "singular", name: "not_found" },
  {
    value: "singular:collection:pages",
    label: "Pages (all)",
    group: "singular",
    name: "collection",
    args: { collection: "pages" },
  },
  {
    value: "singular:collection:posts",
    label: "Posts (all)",
    group: "singular",
    name: "collection",
    args: { collection: "posts" },
  },
  {
    value: "singular:collection:emvb_pages",
    label: "Visual pages (all)",
    group: "singular",
    name: "collection",
    args: { collection: "emvb_pages" },
  },
  {
    value: "archive:collection:posts",
    label: "Posts archive",
    group: "archive",
    name: "collection",
    args: { collection: "posts" },
  },
  { value: "archive:search", label: "Search results", group: "archive", name: "search" },
  {
    value: "archive:taxonomy:category",
    label: "All categories",
    group: "archive",
    name: "taxonomy",
    args: { taxonomy: "category" },
  },
  {
    value: "archive:taxonomy:tag",
    label: "All tags",
    group: "archive",
    name: "taxonomy",
    args: { taxonomy: "tag" },
  },
] as const;

export function optionValue(rule: ConditionRule): string {
  if (rule.group === "singular" && rule.name === "collection") {
    return `singular:collection:${String(rule.args["collection"] ?? "")}`;
  }
  if (rule.group === "archive" && rule.name === "collection") {
    return `archive:collection:${String(rule.args["collection"] ?? "")}`;
  }
  if (rule.group === "archive" && rule.name === "taxonomy") {
    return `archive:taxonomy:${String(rule.args["taxonomy"] ?? "")}`;
  }
  return `${rule.group}:${rule.name}`;
}

export function ruleFromOption(
  value: string,
  op: "include" | "exclude",
  id: string,
): ConditionRule {
  const option = GROUP_OPTIONS.find((o) => o.value === value) ?? GROUP_OPTIONS[0];
  return {
    id,
    op,
    group: option.group,
    name: option.name,
    args: "args" in option && option.args ? { ...option.args } : {},
  };
}

let ruleSeq = 0;
const newConditionId = () => `r-${Date.now().toString(36)}-${(++ruleSeq).toString(36)}`;

/** Include/Exclude display conditions for theme parts (Elementor-like MVP set). */
export function ConditionsEditor({ conditions, onChange }: Props) {
  const doc = conditions ?? defaultConditions();
  const setRules = (rules: ConditionRule[]) => onChange({ schemaVersion: 1, rules });

  const add = (op: "include" | "exclude") => {
    setRules([...doc.rules, ruleFromOption("general:entire_site", op, newConditionId())]);
  };

  const update = (id: string, patch: Partial<ConditionRule>) => {
    setRules(doc.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  const remove = (id: string) => {
    setRules(doc.rules.filter((rule) => rule.id !== id));
  };

  return (
    <div className="emvb-conditions" data-emvb-panel="conditions">
      <h3 className="emvb-section-label">Display conditions</h3>
      <p className="emvb-helper">
        Include where this part should appear. Exclude overrides include for the same part.
      </p>
      {doc.rules.length === 0 && (
        <p className="emvb-helper" role="status">
          No conditions yet — this part will not appear anywhere until you add an Include.
        </p>
      )}
      <ul className="emvb-condition-list">
        {doc.rules.map((rule) => (
          <li key={rule.id} className="emvb-condition-row" data-emvb-condition={rule.id}>
            <select
              className="emvb-condition-op"
              aria-label="Include or exclude"
              value={rule.op}
              onChange={(event) =>
                update(rule.id, { op: event.target.value === "exclude" ? "exclude" : "include" })
              }
            >
              <option value="include">Include</option>
              <option value="exclude">Exclude</option>
            </select>
            <select
              className={`emvb-condition-where ${FIELD}`}
              aria-label="Where"
              value={optionValue(rule)}
              onChange={(event) => {
                const next = ruleFromOption(event.target.value, rule.op, rule.id);
                update(rule.id, next);
              }}
            >
              {GROUP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="ghost"
              className={BUTTON}
              aria-label="Remove condition"
              icon={<TrashIcon aria-hidden="true" />}
              onClick={() => remove(rule.id)}
            />
          </li>
        ))}
      </ul>
      <div className="emvb-condition-actions">
        <Button
          type="button"
          variant="secondary"
          className={BUTTON}
          icon={<PlusIcon aria-hidden="true" />}
          onClick={() => add("include")}
        >
          Add Include
        </Button>
        <Button
          type="button"
          variant="secondary"
          className={BUTTON}
          icon={<PlusIcon aria-hidden="true" />}
          onClick={() => add("exclude")}
        >
          Add Exclude
        </Button>
      </div>
    </div>
  );
}
