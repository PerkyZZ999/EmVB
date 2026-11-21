import { Select } from "@cloudflare/kumo";
import * as React from "react";
import { imageFieldsOf, type FieldDescriptor, type LayoutNode } from "../../../../core/index.ts";
import { requestJson, type Fetcher } from "../../../api.ts";
import { FIELD } from "../../../ui.ts";
import { DraftTextField } from "./DraftTextField.tsx";
import { propsOf, withProp } from "./node-props.ts";

const AUTO = "__auto__";
const CURRENT = "__current__";

type SchemaField = { slug: string; type: string; label?: string | null };

/** The collection's image fields from EmDash's schema API; null when it can't be read. */
async function loadImageFields(
  fetcher: Fetcher,
  collection: string,
): Promise<{ slug: string; label: string }[] | null> {
  try {
    const data = await requestJson<{ item?: { fields?: SchemaField[] } }>(
      fetcher,
      `/_emdash/api/schema/collections/${encodeURIComponent(collection)}?includeFields=true`,
    );
    return imageFieldsOf(data.item?.fields ?? []);
  } catch {
    return null;
  }
}

/**
 * W-1090 (#32): a collection Loop's Image field, picked from the collection's image fields.
 * Unset is Automatic: `featured_image`, else the collection's first image field, as published
 * pages read it. A name not in the list (typed before, or a field since removed) stays chosen.
 * Without a collection, or when the schema can't be read, it is the plain text field.
 */
export function ImageFieldControl({
  field,
  node,
  collection,
  fetcher,
  onChange,
}: {
  field: FieldDescriptor;
  node: LayoutNode;
  collection: string | undefined;
  fetcher: Fetcher;
  onChange: (node: LayoutNode) => void;
}) {
  // Keyed by collection, so a changed Collection never shows the previous one's fields.
  const [loaded, setLoaded] = React.useState<{
    collection: string;
    fields: { slug: string; label: string }[] | null;
  } | null>(null);

  React.useEffect(() => {
    if (!collection) return;
    let cancelled = false;
    void loadImageFields(fetcher, collection).then((next) => {
      if (!cancelled) setLoaded({ collection, fields: next });
    });
    return () => {
      cancelled = true;
    };
  }, [fetcher, collection]);

  const fields = loaded && loaded.collection === collection ? loaded.fields : null;
  if (!collection || !fields || fields.length === 0) {
    return <DraftTextField field={field} node={node} onChange={onChange} />;
  }

  const raw = propsOf(node)[field.key];
  const value = typeof raw === "string" ? raw : "";
  const known = fields.some((f) => f.slug === value);
  const automatic = `Automatic (${fields[0]?.label ?? ""})`;
  const labelOf = (current: string) => {
    if (current === AUTO) return automatic;
    if (current === CURRENT) return `${value} (not an image field here)`;
    return fields.find((f) => f.slug === current)?.label ?? current;
  };
  return (
    <div data-emvb-field={field.key} data-emvb-image-field="list">
      <Select
        label={field.label}
        className={FIELD}
        value={value === "" ? AUTO : known ? value : CURRENT}
        renderValue={(current: unknown) => labelOf(String(current))}
        onValueChange={(next) => {
          if (!next || next === CURRENT) return;
          onChange(withProp(node, field.key, next === AUTO ? undefined : String(next)));
        }}
      >
        <Select.Option value={AUTO}>{automatic}</Select.Option>
        {!known && value ? <Select.Option value={CURRENT}>{labelOf(CURRENT)}</Select.Option> : null}
        {fields.map((f) => (
          <Select.Option key={f.slug} value={f.slug}>
            {f.label}
          </Select.Option>
        ))}
      </Select>
      <p className="emvb-helper">
        The image Post image shows. Automatic uses the featured image, or else the collection's
        first image field.
      </p>
    </div>
  );
}
