import { z } from "zod";
import { boundedArray } from "./bounded-array.ts";
import { addNode, moveNode, type Refusal } from "./arrange.ts";
import { cleanClassName, nameKey } from "./design/classes.ts";
import { isExtensionType, liveElement, validateExtensionProps } from "./extensions/index.ts";
import { MAX_PROPOSAL_BYTES, MAX_PROPOSAL_DEPTH, MAX_PROPOSAL_OPS } from "./limits.ts";
import { nestingIssues } from "./nesting.ts";
import { isRecord } from "./record.ts";
import { type DesignSystem } from "./schema/design.ts";
import {
  isParentNode,
  KNOWN_ELEMENT_TYPES,
  NodeId,
  type Layout,
  type LayoutNode,
} from "./schema/layout.ts";
import { findNode, forEachNode, removeNode, updateNode } from "./tree-ops.ts";
import { byteLength, summarizeIssues, validateDesign, validateLayout } from "./validate.ts";
import { proposalSafetyRefusal } from "./proposals-safety.ts";

const Revision = z.string().min(1).max(256);
export const ProposalTarget = z.strictObject({
  collection: z.string().regex(/^[a-z][a-z0-9_-]{0,127}$/),
  id: z.string().min(1).max(128),
});
const Value = z.record(z.string(), z.unknown());
const Position = { parentId: NodeId, index: z.number().int().min(0).max(2000) };
const DesignId = z.string().regex(/^[a-z0-9-]{1,40}$/);
export const ProposalOperation = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("insert"), ...Position, node: Value }),
  z.strictObject({ kind: z.literal("move"), id: NodeId, ...Position }),
  z.strictObject({ kind: z.literal("update"), id: NodeId, set: Value }),
  z.strictObject({ kind: z.literal("delete"), id: NodeId }),
  z.strictObject({ kind: z.literal("class"), id: DesignId, value: Value.nullable() }),
  z.strictObject({
    kind: z.literal("variable"),
    group: z.enum(["colors", "fonts", "fontSizes", "spacings"]),
    id: DesignId,
    value: Value.nullable(),
  }),
]);
const ProposalSchema = z.strictObject({
  version: z.literal(1),
  target: ProposalTarget,
  baseRevision: Revision,
  /** Effective style stamp: draft when present, otherwise published; null for an empty site. */
  baseDesignRevision: Revision.nullable(),
  ops: boundedArray(ProposalOperation, MAX_PROPOSAL_OPS, 1),
});
export type Proposal = z.infer<typeof ProposalSchema>;
export type ProposalBase = {
  revision: string;
  layout: unknown;
  designRevision: string | null;
  design: unknown;
};
export type ProposalRecord = { proposal: Proposal; createdAt: string };
export type ProposalRefusal = Refusal & {
  code: "INVALID_PROPOSAL" | "STALE_BASE" | "NOT_FOUND" | "PROPOSALS_FULL";
  opIndex?: number;
  expectedRevision?: string | null;
  currentRevision?: string | null;
};
const refuse = (reason: string, opIndex?: number): ProposalRefusal => ({
  ok: false,
  code: "INVALID_PROPOSAL",
  reason,
  ...(opIndex === undefined ? {} : { opIndex }),
});

/** Bound JSON before recursive schema parsing or serialization, including hand-written port calls. */
function jsonRefusal(raw: unknown): string | undefined {
  const stack = [{ value: raw, depth: 0 }];
  const seen = new Set<object>();
  let count = 0;
  while (stack.length) {
    const { value, depth } = stack.pop() as { value: unknown; depth: number };
    if (++count > MAX_PROPOSAL_BYTES || depth > MAX_PROPOSAL_DEPTH)
      return "Proposal nesting or size limit exceeded.";
    if (typeof value === "string" && value.length > MAX_PROPOSAL_BYTES)
      return "Proposal string exceeds size limit.";
    if (value === null || typeof value === "string" || typeof value === "boolean") continue;
    if (typeof value === "number" && Number.isFinite(value)) continue;
    if (typeof value !== "object" || seen.has(value)) return "Proposals must be finite JSON trees.";
    seen.add(value);
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      return "Proposals must contain plain JSON objects.";
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) return "Unsafe proposal key.";
      stack.push({ value: item, depth: depth + 1 });
    }
  }
  return byteLength(raw) > MAX_PROPOSAL_BYTES
    ? `Proposal exceeds ${MAX_PROPOSAL_BYTES} bytes.`
    : undefined;
}

export function readProposal(raw: unknown): { ok: true; proposal: Proposal } | ProposalRefusal {
  const reason = jsonRefusal(raw);
  if (reason) return refuse(reason);
  const parsed = ProposalSchema.safeParse(raw);
  if (!parsed.success)
    return refuse(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return { ok: true, proposal: parsed.data };
}

const UPDATE_KEYS = new Set([
  "props",
  "style",
  "states",
  "devices",
  "hiddenOn",
  "classes",
  "htmlId",
  "attributes",
  "editorLabel",
  "bind",
  "variant",
  "audience",
  "dir",
  "container",
  "query",
]);

function wrapperId(raw: Record<string, unknown>): string {
  const ids = new Set<unknown>();
  const stack: unknown[] = [raw];
  while (stack.length) {
    const node = stack.pop();
    if (!isRecord(node)) continue;
    ids.add(node.id);
    if (Array.isArray(node.children)) for (const child of node.children) stack.push(child);
  }
  let id = "proposal-wrapper";
  for (let n = 1; ids.has(id); n++) id = `proposal-wrapper-${n}`;
  return id;
}

function nodeRefusal(node: LayoutNode): string | undefined {
  let reason: string | undefined;
  forEachNode(node, (item) => {
    if (reason) return;
    if (
      !(KNOWN_ELEMENT_TYPES as readonly string[]).includes(item.type) &&
      !isExtensionType(item.type)
    ) {
      reason = `Unknown frozen element type: ${item.type}.`;
    }
    if (
      Object.hasOwn(item, "label") ||
      (item.type === "loop" && Object.hasOwn(item.props, "itemPartId"))
    ) {
      reason = "Use frozen schema names: editorLabel and props.partId.";
    }
    const extension = liveElement(item.type);
    if (extension && !validateExtensionProps(extension.element.schema, item.props).ok) {
      reason = `Invalid extension props for ${item.type}.`;
    }
  });
  return reason;
}

function editNode(
  layout: Layout,
  op: Extract<Proposal["ops"][number], { kind: "update" }>,
): Layout | ProposalRefusal {
  const found = findNode(layout, op.id);
  if (!found) return refuse(`Element ${op.id} is no longer on the page.`);
  if (
    Object.keys(op.set).length === 0 ||
    Object.keys(op.set).some((key) => !UPDATE_KEYS.has(key))
  ) {
    return refuse("An update needs editable frozen fields; id, type and children cannot change.");
  }
  if (Object.hasOwn(op.set, "props") && !isRecord(op.set.props))
    return refuse("props must be an object.");
  const next = { ...found } as Record<string, unknown>;
  for (const [key, value] of Object.entries(op.set)) {
    if (key === "props") next[key] = { ...found.props, ...(value as Record<string, unknown>) };
    else if (value === null) delete next[key];
    else next[key] = value;
  }
  const reason = nodeRefusal(next as LayoutNode);
  return reason ? refuse(reason) : updateNode(layout, op.id, () => next as LayoutNode);
}

type Named = { id: string; name: string };
function editNamed(
  list: Named[],
  id: string,
  raw: Record<string, unknown> | null,
): Named[] | ProposalRefusal {
  if (raw === null) {
    if (!list.some((v) => v.id === id)) return refuse(`No class or variable with id ${id}.`);
    return list.filter((v) => v.id !== id);
  }
  if (
    raw.id !== id ||
    typeof raw.name !== "string" ||
    !raw.name.trim() ||
    cleanClassName(raw.name) !== raw.name
  )
    return refuse(
      "Class/variable ids must match and names must be clean, nonblank and at most 60 characters.",
    );
  if (list.some((v) => v.id !== id && nameKey(v.name) === nameKey(raw.name as string)))
    return refuse(`The name ${raw.name} is already in use.`);
  const next = raw as Named;
  return list.some((v) => v.id === id)
    ? list.map((v) => (v.id === id ? next : v))
    : [...list, next];
}

function stale(
  expectedRevision: string | null,
  currentRevision: string | null,
  what: string,
): ProposalRefusal {
  return {
    ok: false,
    code: "STALE_BASE",
    expectedRevision,
    currentRevision,
    reason: `${what} base revision ${JSON.stringify(expectedRevision)} does not match current revision ${JSON.stringify(currentRevision)}. Rebase: read the current ${what.toLowerCase()} and submit a new proposal against that revision.`,
  };
}

/** Pure and atomic. Selection uses original op indexes and always runs in proposal order. */
export function applyProposal(
  base: ProposalBase,
  raw: unknown,
  selected?: readonly number[],
): { ok: true; layout: Layout; design: DesignSystem } | ProposalRefusal {
  const read = readProposal(raw);
  if (!read.ok) return read;
  const proposal = read.proposal;
  if (proposal.baseRevision !== base.revision)
    return stale(proposal.baseRevision, base.revision, "Page");
  if (
    proposal.ops.some((op) => op.kind === "class" || op.kind === "variable") &&
    proposal.baseDesignRevision !== base.designRevision
  )
    return stale(proposal.baseDesignRevision, base.designRevision, "Site styles");
  if (
    selected &&
    (new Set(selected).size !== selected.length ||
      selected.some((i) => !Number.isInteger(i) || i < 0 || i >= proposal.ops.length))
  )
    return refuse("Selected op indexes must be unique and in range.");
  const checkedLayout = validateLayout(base.layout);
  const checkedDesign = validateDesign(base.design);
  if (!checkedLayout.ok)
    return refuse(`Invalid base layout: ${summarizeIssues(checkedLayout.issues)}`);
  if (!checkedDesign.ok)
    return refuse(`Invalid base design: ${summarizeIssues(checkedDesign.issues)}`);
  let layout = checkedLayout.layout;
  let design = checkedDesign.design;
  for (const [opIndex, op] of proposal.ops.entries()) {
    if (selected && !selected.includes(opIndex)) continue;
    let reason: string | undefined;
    if (op.kind === "insert" || op.kind === "move") {
      const parent = findNode(layout, op.parentId);
      if (!parent || !isParentNode(parent) || op.index > parent.children.length)
        return refuse("Missing parent or insertion index outside its children.", opIndex);
    }
    switch (op.kind) {
      case "insert": {
        // Validate the raw subtree before arrange walks it; arrange is for already-checked nodes.
        const isolated = validateLayout({
          schemaVersion: layout.schemaVersion,
          root: { id: wrapperId(op.node), type: "container", props: {}, children: [op.node] },
        });
        if (!isolated.ok) {
          reason = summarizeIssues(isolated.issues);
          break;
        }
        const node = isolated.layout.root.children[0] as LayoutNode;
        reason = nodeRefusal(node);
        if (reason) break;
        const added = addNode(layout, node, op);
        if (!added.ok) reason = added.reason;
        else layout = added.layout;
        break;
      }
      case "move": {
        const moved = moveNode(layout, op.id, op.parentId, op.index);
        if (!moved.ok) reason = moved.reason;
        else layout = moved.layout;
        break;
      }
      case "update": {
        const edited = editNode(layout, op);
        if ("ok" in edited) reason = edited.reason;
        else layout = edited;
        break;
      }
      case "delete": {
        const removed = removeNode(layout, op.id);
        if (!removed.removed) reason = `Cannot delete missing element ${op.id} or the page root.`;
        else layout = removed.layout;
        break;
      }
      case "class": {
        const next = editNamed(design.classes ?? [], op.id, op.value);
        if ("ok" in next) reason = next.reason;
        else design = Object.assign({}, design, { classes: next as DesignSystem["classes"] });
        break;
      }
      case "variable": {
        const next = editNamed(design.variables[op.group] ?? [], op.id, op.value);
        if ("ok" in next) reason = next.reason;
        else
          design = Object.assign({}, design, {
            variables: Object.assign({}, design.variables, { [op.group]: next }),
          }) as DesignSystem;
        break;
      }
    }
    if (reason) return refuse(reason, opIndex);
    const validLayout = validateLayout(layout);
    const validDesign = validateDesign(design);
    if (!validLayout.ok) return refuse(summarizeIssues(validLayout.issues), opIndex);
    if (!validDesign.ok) return refuse(summarizeIssues(validDesign.issues), opIndex);
    const misplaced = nestingIssues(validLayout.layout);
    if (misplaced.length) return refuse(summarizeIssues(misplaced), opIndex);
    const unsafe = proposalSafetyRefusal(
      checkedLayout.layout,
      validLayout.layout,
      checkedDesign.design,
      validDesign.design,
    );
    if (unsafe) return refuse(unsafe, opIndex);
    layout = validLayout.layout;
    design = validDesign.design;
  }
  return { ok: true, layout, design };
}
