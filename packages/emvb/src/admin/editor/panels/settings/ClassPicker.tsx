import { Button, Select } from "@cloudflare/kumo";
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from "@phosphor-icons/react";
import {
  addClassId,
  moveClassId,
  removeClassId,
  type DesignSystem,
} from "../../../../core/index.ts";
import { BUTTON } from "../../../ui.ts";

const NONE = "__none__";

/**
 * Style-tab control for `node.classes` (W-031 / R-021). Apply, remove, and reorder
 * design class ids; HTML/CSS use the `emvb-k-*` prefix at render time.
 */
export function ClassPicker({
  applied,
  design,
  onChange,
}: {
  applied: readonly string[] | undefined;
  design: DesignSystem;
  onChange: (classes: string[] | undefined) => void;
}) {
  const ids = applied ?? [];
  const catalog = design.classes ?? [];
  const byId = new Map(catalog.map((cls) => [cls.id, cls]));
  const available = catalog.filter((cls) => !ids.includes(cls.id));
  const prompt = available.length === 0 ? "No more classes" : "Choose a class…";

  const commit = (next: string[]) => {
    onChange(next.length === 0 ? undefined : next);
  };

  return (
    <div className="emvb-class-picker" data-emvb-class-picker="">
      <p className="emvb-field-label">Classes</p>
      <p className="emvb-helper" data-emvb-cascade-caption="">
        Applied order sets cascade (later overrides earlier). Local styles always win.
      </p>
      {ids.length === 0 ? (
        <p className="emvb-helper">No classes applied. Add one from the site design.</p>
      ) : (
        <ul className="emvb-class-list">
          {ids.map((id, index) => {
            const name = byId.get(id)?.name ?? id;
            return (
              <li key={`${id}-${index}`} className="emvb-class-row" data-emvb-class-id={id}>
                <span className="emvb-class-order" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="emvb-class-name">{name}</span>
                <span className="emvb-mono emvb-class-token">emvb-k-{id}</span>
                <div className="emvb-class-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={BUTTON}
                    aria-label={`Move ${name} up`}
                    disabled={index === 0}
                    onClick={() => commit(moveClassId(ids, index, -1))}
                  >
                    <ArrowUpIcon size={14} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={BUTTON}
                    aria-label={`Move ${name} down`}
                    disabled={index === ids.length - 1}
                    onClick={() => commit(moveClassId(ids, index, 1))}
                  >
                    <ArrowDownIcon size={14} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={BUTTON}
                    aria-label={`Remove ${name}`}
                    onClick={() => commit(removeClassId(ids, id))}
                  >
                    <TrashIcon size={14} aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Select
        label="Add class"
        className="emvb-field"
        value={NONE}
        disabled={available.length === 0}
        onValueChange={(value) => {
          if (!value || value === NONE) return;
          commit(addClassId(ids, value));
        }}
        renderValue={() => prompt}
      >
        <Select.Option value={NONE}>{prompt}</Select.Option>
        {available.map((cls) => (
          <Select.Option key={cls.id} value={cls.id}>
            {cls.name}
          </Select.Option>
        ))}
      </Select>
    </div>
  );
}
