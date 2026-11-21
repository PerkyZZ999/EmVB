import type { ExtensionManifest } from "../../../core/index.ts";
import { useExtensions, useExtensionSourceValuesContext } from "../extensions-context.tsx";

/**
 * W-927 / D-067: Kumo-slot area for declarative extension panels. EmVB renders the
 * panel copy with existing EmVB/Kumo tokens; extensions may not inject global admin CSS.
 * W-1088 (#36): a panel that names a source lists that source's values read-only, as plain text.
 */
export function ExtensionPanels() {
  const extensions = useExtensions();
  const panels = extensions.flatMap((ext) => ext.panels.map((panel) => ({ ext, panel })));
  if (panels.length === 0) return null;
  return (
    <div className="emvb-ext-panels emvb-add-group" data-emvb-ext-panels="">
      <h3 className="emvb-add-group-title">Extensions</h3>
      {panels.map(({ ext, panel }) => (
        <div key={panel.id} className="emvb-ext-panel" data-emvb-ext-panel={panel.id}>
          <h4 className="emvb-panel-title">{panel.label}</h4>
          {panel.description ? <p className="emvb-helper">{panel.description}</p> : null}
          <p className="emvb-helper">
            From {ext.label}
            {panel.source ? ` · source “${panel.source}”` : ""}
          </p>
          {panel.source ? <SourceValues ext={ext} name={panel.source} /> : null}
        </div>
      ))}
    </div>
  );
}

/** One source's values as a read-only list of labels and values. */
function SourceValues({ ext, name }: { ext: ExtensionManifest; name: string }) {
  const all = useExtensionSourceValuesContext();
  const source = ext.sources.find((s) => s.name === name);
  if (!source) return null;
  const id = `ext:${ext.id}/${name}`;
  if (!all) return <p className="emvb-helper">Loading values…</p>;
  const values = all.get(id);
  if (!values) {
    return (
      <p className="emvb-helper" data-emvb-ext-source-unavailable="">
        This source&apos;s values couldn&apos;t be read on this server.
      </p>
    );
  }
  const entries = Object.entries(values);
  if (entries.length === 0) return <p className="emvb-helper">This source has no values.</p>;
  return (
    <dl className="emvb-ext-source" data-emvb-ext-source={id} aria-label={`${source.label} values`}>
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
