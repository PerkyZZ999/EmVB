import { Button } from "@cloudflare/kumo";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import {
  defaultConditions,
  MAX_CONDITION_RULES,
  type ConditionRule,
  type ConditionsDoc,
} from "../../../core/index.ts";
import { conditionRuleLabel } from "../../theme-api.ts";
import { BUTTON } from "../../ui.ts";
import { PanelSelect } from "./settings/PanelSelect.tsx";

type Props = {
  conditions: ConditionsDoc | undefined;
  onChange: (conditions: ConditionsDoc) => void;
};

const GROUP_OPTIONS = [
  { value: "general:entire_site", label: "Entire site", group: "general", name: "entire_site" },
  { value: "singular:front", label: "Front page", group: "singular", name: "front" },
  { value: "singular:all", label: "All singular", group: "singular", name: "all" },
  { value: "singular:not_found", label: "404 page", group: "singular", name: "not_found" },
  // W-694: the Archive part's default rule; the menu showed it as "Entire site".
  { value: "archive:all", label: "All archives", group: "archive", name: "all" },
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

/** The menu value that keeps a rule the menu can't build (one entry, one term, another collection). */
const CURRENT_RULE = "current";

/**
 * The menu value for a rule: its option, or CURRENT_RULE when no option builds it exactly.
 * W-694: such rules (from MCP, an import or an older EmVB) showed as "Entire site", and touching
 * the menu replaced them; they now show their Theme Builder label, e.g. "Tag: news".
 */
function menuValue(rule: ConditionRule): string {
  const value = optionValue(rule);
  const option = GROUP_OPTIONS.find((o) => o.value === value);
  if (!option) return CURRENT_RULE;
  const expected = "args" in option ? Object.keys(option.args).length : 0;
  return Object.keys(rule.args).length === expected ? value : CURRENT_RULE;
}

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

  /** The schema allows at most 20 rules, so a 21st would make the part unsavable (W-092). */
  const full = doc.rules.length >= MAX_CONDITION_RULES;
  const fullReason = `${MAX_CONDITION_RULES} conditions is the most one part can have. Remove one to add another.`;

  const add = (op: "include" | "exclude") => {
    if (full) return;
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
            <PanelSelect
              className="emvb-condition-op"
              label="Include or exclude"
              value={rule.op}
              options={[
                { value: "include", label: "Include" },
                { value: "exclude", label: "Exclude" },
              ]}
              onChange={(value) =>
                update(rule.id, { op: value === "exclude" ? "exclude" : "include" })
              }
            />
            <PanelSelect
              className="emvb-condition-where"
              label="Where"
              value={menuValue(rule)}
              options={[
                ...(menuValue(rule) === CURRENT_RULE
                  ? [{ value: CURRENT_RULE, label: conditionRuleLabel(rule) }]
                  : []),
                ...GROUP_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
              ]}
              onChange={(value) => {
                if (value === CURRENT_RULE) return;
                update(rule.id, ruleFromOption(value, rule.op, rule.id));
              }}
            />
            <Button
              type="button"
              variant="ghost"
              shape="square"
              // W-767: the 28 px icon button its grid column expects; the text-button size overflowed.
              className="emvb-icon-btn"
              aria-label="Remove condition"
              icon={<TrashIcon aria-hidden="true" />}
              onClick={() => remove(rule.id)}
            />
          </li>
        ))}
      </ul>
      {/* UX-051: sentence case; the plus says "add", so both fit on one row at 264 px. */}
      <div className="emvb-condition-actions">
        <Button
          type="button"
          variant="secondary"
          className={BUTTON}
          icon={<PlusIcon aria-hidden="true" />}
          disabled={full}
          title={full ? fullReason : undefined}
          onClick={() => add("include")}
          aria-label="Add include rule"
        >
          Include
        </Button>
        <Button
          type="button"
          variant="secondary"
          className={BUTTON}
          icon={<PlusIcon aria-hidden="true" />}
          disabled={full}
          title={full ? fullReason : undefined}
          onClick={() => add("exclude")}
          aria-label="Add exclude rule"
        >
          Exclude
        </Button>
      </div>
      {full && (
        <p className="emvb-helper" data-emvb-conditions-full="">
          {fullReason}
        </p>
      )}
    </div>
  );
}
