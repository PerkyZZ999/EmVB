import { useExtensions } from "../extensions-context.tsx";

/**
 * W-927 / D-067: Kumo-slot area for declarative extension panels. EmVB renders the
 * panel copy with existing EmVB/Kumo tokens; extensions may not inject global admin CSS.
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
        </div>
      ))}
    </div>
  );
}
