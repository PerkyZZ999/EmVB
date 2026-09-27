import { Input, Select, Tabs } from "@cloudflare/kumo";
import { WarningCircleIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  MAX_TEXT_LENGTH,
  type DesignSystem,
  type LayoutNode,
  type StyleProps,
} from "../../../core/index.ts";
import { FIELD } from "../../ui.ts";
import { ColorControl } from "./ColorControl.tsx";

type HeadingNode = Extract<LayoutNode, { type: "heading" }>;
type ContainerNode = Extract<LayoutNode, { type: "container" }>;

export const ELEMENT_NAMES: Record<string, string> = {
  heading: "Heading",
  container: "Container",
  spacer: "Spacer",
  divider: "Divider",
  text: "Text",
  label: "Label",
  link: "Link",
  button: "Button",
  list: "List",
};

type Props<N extends LayoutNode> = {
  node: N;
  design: DesignSystem;
  onChange: (node: LayoutNode) => void;
  onDesignChange: (design: DesignSystem) => Promise<void>;
};

const withStyle = <N extends LayoutNode>(node: N, patch: Partial<StyleProps>): N => {
  const style: Record<string, unknown> = { ...node.style, ...patch };
  for (const key of Object.keys(style)) if (style[key] === undefined) delete style[key];
  return { ...node, style: Object.keys(style).length > 0 ? (style as StyleProps) : undefined };
};

/** Right panel with an element selected (IA): Content and Style tabs. */
export function ElementPanel(props: Props<LayoutNode> & { rejection: string | null }) {
  const { node, rejection } = props;
  const [tab, setTab] = React.useState(node.type === "container" ? "style" : "content");
  return (
    <div className="emvb-panel-body" data-emvb-panel="element" data-emvb-element={node.type}>
      <h2 className="emvb-panel-title">{ELEMENT_NAMES[node.type] ?? node.type}</h2>
      {rejection && (
        <p className="emvb-inline-error" role="alert">
          <WarningCircleIcon size={16} aria-hidden="true" />
          {rejection}
        </p>
      )}
      <Tabs
        variant="segmented"
        className="emvb-tabs"
        tabs={[
          { value: "content", label: "Content" },
          { value: "style", label: "Style" },
        ]}
        value={tab}
        onValueChange={setTab}
      />
      {node.type === "heading" && tab === "content" && <HeadingContent {...props} node={node} />}
      {node.type === "heading" && tab === "style" && <HeadingStyle {...props} node={node} />}
      {node.type === "container" && tab === "content" && (
        <p className="emvb-helper">A container holds other elements. Arrange them in Style.</p>
      )}
      {node.type === "container" && tab === "style" && <ContainerStyle {...props} node={node} />}
    </div>
  );
}

function HeadingContent({ node, onChange }: Props<HeadingNode>) {
  const tooLong = node.props.text.length > MAX_TEXT_LENGTH;
  return (
    <>
      <Input
        label="Text"
        className={FIELD}
        value={node.props.text}
        error={
          tooLong
            ? `Headings can be up to ${MAX_TEXT_LENGTH} characters. Shorten the text.`
            : undefined
        }
        onChange={(event) =>
          onChange({ ...node, props: { ...node.props, text: event.target.value } })
        }
      />
      <Select
        label="Level"
        className={FIELD}
        value={node.props.level}
        onValueChange={(level) =>
          onChange({ ...node, props: { ...node.props, level: Number(level) } })
        }
        renderValue={(level: unknown) => `H${String(level)}`}
      >
        {[1, 2, 3, 4, 5, 6].map((level) => (
          <Select.Option key={level} value={level}>
            H{level}
          </Select.Option>
        ))}
      </Select>
    </>
  );
}

function HeadingStyle({ node, design, onChange, onDesignChange }: Props<HeadingNode>) {
  return (
    <ColorControl
      label="Color"
      value={node.style?.color}
      design={design}
      onChange={(color) => onChange(withStyle(node, { color }))}
      onDesignChange={onDesignChange}
    />
  );
}

function ContainerStyle({ node, onChange }: Props<ContainerNode>) {
  const direction = node.style?.flexDirection ?? "column";
  const gap = node.style?.gap;
  const [gapDraft, setGapDraft] = React.useState(gap ? String(gap.value) : "");
  const [gapError, setGapError] = React.useState<string | null>(null);
  const commitGap = () => {
    if (gapDraft.trim() === "") {
      setGapError(null);
      onChange(withStyle(node, { gap: undefined }));
      return;
    }
    const value = Number(gapDraft);
    if (!Number.isFinite(value) || value < 0) {
      setGapError("Gap can't be negative. Enter 0 or more.");
      return;
    }
    if (value > 10_000) {
      setGapError("Gap can be up to 10000 px. Enter a smaller number.");
      return;
    }
    setGapError(null);
    onChange(withStyle(node, { gap: { value, unit: gap?.unit ?? "px" } }));
  };
  return (
    <>
      <Select
        label="Direction"
        className={FIELD}
        value={direction}
        onValueChange={(value) =>
          onChange(withStyle(node, { flexDirection: value === "row" ? "row" : "column" }))
        }
        renderValue={(value: unknown) => (value === "row" ? "Row" : "Column")}
      >
        <Select.Option value="column">Column</Select.Option>
        <Select.Option value="row">Row</Select.Option>
      </Select>
      <Input
        label={`Gap (${gap?.unit ?? "px"})`}
        className={`${FIELD} emvb-mono`}
        inputMode="numeric"
        value={gapDraft}
        error={gapError ?? undefined}
        onChange={(event) => setGapDraft(event.target.value)}
        onBlur={commitGap}
        onKeyDown={(event) => {
          if (event.key === "Enter") commitGap();
        }}
      />
    </>
  );
}
