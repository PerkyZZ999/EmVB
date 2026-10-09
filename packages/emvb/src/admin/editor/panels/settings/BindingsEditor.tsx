import * as React from "react";
import {
  BIND_SOURCES,
  BIND_SOURCE_LABELS,
  POST_BIND_KEYS,
  SITE_BIND_KEYS,
  bindableFields,
  resolveBinding,
  withBinding,
  type BindSource,
  type Binding,
  type LayoutNode,
  type ThemePostFields,
} from "../../../../core/index.ts";
import { useLiveData } from "../../live-data.tsx";

const KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const STATIC = "static";

/** Suggested keys for a source; any other key can be typed. */
function suggestions(source: BindSource, site: Readonly<Record<string, string>>): string[] {
  if (source === "post") return POST_BIND_KEYS.map((k) => k.key);
  if (source === "site") {
    return [...new Set([...SITE_BIND_KEYS.map((k) => k.key), ...Object.keys(site)])];
  }
  return [];
}

const firstKey = (source: BindSource) =>
  source === "post" ? "title" : source === "site" ? "title" : "ref";

/**
 * Dynamic data (W-307): bind a text, image or link field to a post field, a site setting or a
 * URL parameter. The field's typed value is the fallback, and the live value shows here and on
 * the canvas while you edit.
 */
export function BindingsEditor({
  node,
  onChange,
  post,
}: {
  node: LayoutNode;
  onChange: (node: LayoutNode) => void;
  /** The post the canvas shows (a sample outside a post template). */
  post?: ThemePostFields;
}) {
  const fields = bindableFields(node.type);
  const live = useLiveData();
  if (fields.length === 0) return null;
  const listId = `emvb-bind-keys-${node.id}`;
  return (
    <section className="emvb-bind" data-emvb-bindings="" aria-labelledby={`${listId}-title`}>
      <h3 className="emvb-bind-title" id={`${listId}-title`}>
        Dynamic data
      </h3>
      <p className="emvb-helper">
        Show live data instead of the typed value. The typed value is used when there is none.
      </p>
      {fields.map((field) => {
        const binding = node.bind?.[field.key];
        const source = binding?.source;
        const value = binding
          ? resolveBinding(binding, { post, site: live.site, params: live.params })
          : undefined;
        const selectId = `${listId}-${field.key}`;
        return (
          <div className="emvb-bind-row" key={field.key} data-emvb-bind-field={field.key}>
            {/* "Text source", not "Text": the field's own input is already named "Text". */}
            <label className="emvb-bind-label" htmlFor={selectId}>
              {`${field.label} source`}
            </label>
            <select
              id={selectId}
              className="emvb-native-select"
              value={source ?? STATIC}
              onChange={(event) => {
                const next = event.target.value;
                if (next === STATIC) onChange(withBinding(node, field.key, undefined));
                else {
                  const src = next as BindSource;
                  onChange(withBinding(node, field.key, { source: src, key: firstKey(src) }));
                }
              }}
            >
              <option value={STATIC}>Typed value</option>
              {BIND_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {BIND_SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
            {binding ? (
              <BindKeyInput
                fieldLabel={field.label}
                binding={binding}
                listId={`${selectId}-keys`}
                options={suggestions(binding.source, live.site)}
                onCommit={(key) =>
                  onChange(withBinding(node, field.key, { source: binding.source, key }))
                }
              />
            ) : (
              <span />
            )}
            {binding && (
              <p className="emvb-bind-live" data-emvb-bind-live="">
                {value === undefined ? (
                  <>No value here, so the typed value shows.</>
                ) : (
                  <>
                    Live: <b>{value}</b>
                  </>
                )}
              </p>
            )}
          </div>
        );
      })}
      {Object.values(node.bind ?? {}).some((b) => b.source === "param") && <PreviewQuery />}
    </section>
  );
}

function BindKeyInput({
  fieldLabel,
  binding,
  listId,
  options,
  onCommit,
}: {
  fieldLabel: string;
  binding: Binding;
  listId: string;
  options: string[];
  onCommit: (key: string) => void;
}) {
  const [draft, setDraft] = React.useState(binding.key);
  React.useEffect(() => setDraft(binding.key), [binding.key]);
  const valid = KEY.test(draft);
  const commit = () => {
    if (valid && draft !== binding.key) onCommit(draft);
    if (!valid) setDraft(binding.key);
  };
  return (
    <>
      <input
        className="emvb-native-input"
        aria-label={`${fieldLabel} ${binding.source === "param" ? "parameter name" : "field name"}`}
        aria-invalid={valid ? undefined : true}
        list={options.length > 0 ? listId : undefined}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
    </>
  );
}

/** The URL parameters the canvas previews with; they never reach the published page. */
function PreviewQuery() {
  const live = useLiveData();
  return (
    <label className="emvb-bind-row" data-emvb-preview-query="">
      <span className="emvb-bind-label">Preview URL parameters (editor only)</span>
      <input
        className="emvb-native-input"
        style={{ gridColumn: "1 / -1" }}
        placeholder="plan=pro&name=Ada"
        value={live.query}
        onChange={(event) => live.setQuery(event.target.value)}
      />
    </label>
  );
}
