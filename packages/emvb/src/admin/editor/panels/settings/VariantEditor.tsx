import {
  createVariantB,
  endAbTest,
  type Arranged,
  type Layout,
  type LayoutNode,
} from "../../../../core/index.ts";

/** Types that can't be an A/B arm: items of a list that has its own rules, and the root. */
const NO_VARIANT = new Set(["tab-panel", "accordion-item", "loop-empty", "option"]);

/**
 * Edge A/B test (W-312): make this element arm A and a copy arm B. The server picks one per
 * visitor and a cookie keeps it, so nothing flickers and no script loads.
 */
export function VariantEditor({
  node,
  isRoot,
  onChange,
  onArrange,
}: {
  node: LayoutNode;
  isRoot: boolean;
  onChange: (node: LayoutNode) => void;
  onArrange?: (run: (layout: Layout) => Arranged) => void;
}) {
  if (isRoot || NO_VARIANT.has(node.type) || !onArrange) return null;
  const v = node.variant;
  return (
    <section className="emvb-bind" data-emvb-variant-editor="">
      <h3 className="emvb-bind-title">A/B test</h3>
      {!v ? (
        <>
          <p className="emvb-helper">
            Show half of your visitors a different version. The server picks the version, so nothing
            flickers and no script loads.
          </p>
          <button
            type="button"
            className="emvb-link-button"
            data-emvb-create-variant=""
            onClick={() => onArrange((layout) => createVariantB(layout, node.id))}
          >
            Create variant B
          </button>
        </>
      ) : (
        <>
          <p className="emvb-helper" data-emvb-variant-arm={v.arm}>
            Variant {v.arm.toUpperCase()} of test <b>{v.test}</b>. The canvas shows every variant;
            visitors see one.
          </p>
          {v.arm === "b" && (
            <label className="emvb-bind-row">
              <span className="emvb-bind-label">Visitors who see B (%)</span>
              <input
                className="emvb-native-input"
                type="number"
                min={1}
                max={99}
                value={v.split ?? 50}
                data-emvb-variant-split=""
                onChange={(event) => {
                  const n = Math.round(Number(event.currentTarget.value));
                  if (!Number.isFinite(n) || n < 1 || n > 99) return;
                  onChange({ ...node, variant: { ...v, split: n } } as LayoutNode);
                }}
              />
            </label>
          )}
          <button
            type="button"
            className="emvb-link-button"
            data-emvb-end-test=""
            onClick={() => onArrange((layout) => endAbTest(layout, node.id))}
          >
            Keep this variant and end the test
          </button>
        </>
      )}
    </section>
  );
}
