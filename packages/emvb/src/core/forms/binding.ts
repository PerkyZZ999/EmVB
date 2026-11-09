import {
  isFormNode,
  LAYOUT_SCHEMA_VERSION,
  type Layout,
  type LayoutNode,
} from "../schema/layout.ts";
import { loneAbTests } from "../audience/variants.ts";
import { audienceSummary } from "../audience/rules.ts";
import { forEachNode, nodeChildren, someNode } from "../tree-ops.ts";
import { stableJson } from "../stable-json.ts";
import { fieldsOf, type FormDefinitions } from "./definition.ts";

export type MissingRequiredField = {
  formNodeId: string;
  formId: string;
  field: string;
};

function boundFields(form: LayoutNode): Set<string> {
  const names = new Set<string>();
  forEachNode(form, (node) => {
    if (
      node.type === "text-input" ||
      node.type === "textarea" ||
      node.type === "select" ||
      node.type === "checkbox" ||
      node.type === "radio"
    ) {
      const field = (node.props as { field?: string }).field;
      if (field) names.add(field);
    }
  });
  return names;
}

/**
 * Required fields on the forms-plugin definition that have no EmVB input bound (R-040).
 */
export function findMissingRequiredFields(
  layout: Layout,
  definitions: FormDefinitions,
): MissingRequiredField[] {
  const missing: MissingRequiredField[] = [];
  forEachNode(layout.root, (node) => {
    if (!isFormNode(node) || !node.props.formId) return;
    const definition = definitions.get(node.props.formId);
    if (!definition) return;
    const bound = boundFields(node);
    // W-595: a hidden field is sent by the form itself, with no control.
    for (const field of fieldsOf(definition)) if (field.type === "hidden") bound.add(field.name);
    for (const field of fieldsOf(definition)) {
      if (field.required && !bound.has(field.name)) {
        missing.push({ formNodeId: node.id, formId: node.props.formId, field: field.name });
      }
    }
  });
  return missing;
}

export function layoutHasForm(layout: Layout): boolean {
  return someNode(layout.root, (node) => isFormNode(node) && node.props.formId.trim() !== "");
}

/** A field as the forms plugin defines it; only what the checks below read. */
export type RequiredFieldInfo = { name: string; label: string; required: boolean; type?: string };

/**
 * A required field visitors can't fill (W-511): `missing` has no control in the form; `hidden`
 * has its controls hidden on some device, where the form then can never be sent (the forms
 * client checks the hidden control and writes its error where nobody sees it).
 */
export type RequiredFieldIssue =
  | { kind: "missing"; formNodeId: string; field: string; label: string }
  | {
      kind: "hidden";
      formNodeId: string;
      field: string;
      label: string;
      /** The bound control (the first one, when the field is bound more than once). */
      nodeId: string;
      devices: string[];
    }
  | {
      kind: "audience";
      formNodeId: string;
      field: string;
      label: string;
      nodeId: string;
      /** Who sees it, e.g. "Only CA · returning", or "Variant B of A/B test hero". */
      who: string;
    };

const FIELD_TYPES = new Set(["text-input", "textarea", "select", "checkbox", "radio"]);
const DEVICE_ORDER = ["desktop", "laptop", "tablet", "mobile"];

/** Each bound field's controls, with the devices each is hidden on (itself or an ancestor). */
type Control = { nodeId: string; hidden: Set<string>; who?: string; split?: string };

/**
 * W-513: who an element is limited to, by a Visitors rule or as one arm of an A/B test, or
 * undefined when everyone sees it.
 */
/**
 * W-550: the exact visitors split a node makes, e.g. "ab:hero:a" or "aud:1:{rules}". Two
 * controls cover everyone when they are the two halves of one split; labels alone can't tell
 * (they cut long country lists and leave out the time zone).
 */
function splitKey(node: LayoutNode, lone: ReadonlySet<string>): string | undefined {
  const audience = node.audience;
  if (audience) {
    const { hide, ...rules } = audience;
    return `aud:${hide ? 1 : 0}:${stableJson(rules)}`;
  }
  if (node.variant && !lone.has(node.variant.test)) {
    return `ab:${node.variant.test}:${node.variant.arm}`;
  }
  return undefined;
}

function restriction(node: LayoutNode, lone: ReadonlySet<string>): string | undefined {
  const audience = node.audience;
  if (audience) {
    const { hide, timeZone: _zone, ...rules } = audience;
    if (hide || Object.values(rules).some((rule) => rule !== undefined)) {
      return audienceSummary(audience);
    }
  }
  // W-628: a test missing an arm isn't run, so its remaining arm reaches everyone.
  if (node.variant && !lone.has(node.variant.test)) {
    return `Variant ${node.variant.arm.toUpperCase()} of A/B test ${node.variant.test}`;
  }
  return undefined;
}

function boundControls(form: LayoutNode): Map<string, Control[]> {
  // A/B arms are siblings, so a test's arms inside a form are all inside it.
  const lone = loneAbTests({ schemaVersion: LAYOUT_SCHEMA_VERSION, root: form } as Layout);
  const found = new Map<string, Control[]>();
  const walk = (
    node: LayoutNode,
    inherited: ReadonlySet<string>,
    limited: { who: string; split?: string } | undefined,
  ) => {
    const own = (node as { hiddenOn?: readonly string[] }).hiddenOn ?? [];
    const hidden = own.length ? new Set([...inherited, ...own]) : inherited;
    let scope = limited;
    if (!scope) {
      const who = restriction(node, lone);
      if (who) scope = { who, split: splitKey(node, lone) };
    }
    if (FIELD_TYPES.has(node.type)) {
      const field = (node.props as { field?: unknown }).field;
      if (typeof field === "string" && field) {
        const control: Control = { nodeId: node.id, hidden: new Set(hidden) };
        if (scope) {
          control.who = scope.who;
          if (scope.split) control.split = scope.split;
        }
        found.set(field, [...(found.get(field) ?? []), control]);
      }
    }
    for (const child of nodeChildren(node)) walk(child, hidden, scope);
  };
  // The form's own hiddenOn or audience hides the whole form, which loses no answers: not counted.
  for (const child of nodeChildren(form)) walk(child, new Set(), undefined);
  return found;
}

/**
 * Two controls that split the visitors between them (A and B of one test, or "Only X" and
 * "Hidden for X") still reach everyone.
 */
function coversEveryone(controls: readonly Control[]): boolean {
  const splits = new Set(controls.map((control) => control.split));
  for (const key of splits) {
    if (!key) continue;
    const ab = /^ab:(.*):([ab])$/.exec(key);
    if (ab && splits.has(`ab:${ab[1]}:${ab[2] === "a" ? "b" : "a"}`)) return true;
    if (key.startsWith("aud:0:") && splits.has(`aud:1:${key.slice(6)}`)) return true;
  }
  return false;
}

/** W-511: required fields of the form element's definition that visitors can't fill. */
export function requiredFieldIssues(
  form: LayoutNode,
  fields: readonly RequiredFieldInfo[],
): RequiredFieldIssue[] {
  const controls = boundControls(form);
  const issues: RequiredFieldIssue[] = [];
  for (const field of fields) {
    // W-595: a hidden field is sent by the form itself, with no control.
    if (!field.required || field.type === "hidden") continue;
    const label = field.label.trim() || field.name;
    const bound = controls.get(field.name);
    if (!bound?.length) {
      issues.push({ kind: "missing", formNodeId: form.id, field: field.name, label });
      continue;
    }
    // Hidden on a device only when every control for the field is hidden there.
    const devices = DEVICE_ORDER.filter((device) => bound.every((c) => c.hidden.has(device)));
    if (devices.length) {
      issues.push({
        kind: "hidden",
        formNodeId: form.id,
        field: field.name,
        label,
        nodeId: (bound[0] as { nodeId: string }).nodeId,
        devices,
      });
      continue;
    }
    // W-513: only some visitors see every control for the field; the rest can't send the form.
    const first = bound[0] as Control;
    if (bound.every((control) => control.who !== undefined) && !coversEveryone(bound)) {
      issues.push({
        kind: "audience",
        formNodeId: form.id,
        field: field.name,
        label,
        nodeId: first.nodeId,
        who: first.who as string,
      });
    }
  }
  return issues;
}

/** The sentence the editor and describe_page show for one issue (W-511). */
export function requiredFieldIssueText(issue: RequiredFieldIssue): string {
  if (issue.kind === "missing") {
    return `“${issue.label}” is required by the form but has no field here, so the form can't be sent. Add a field bound to ${issue.field}, or make it optional in Forms.`;
  }
  if (issue.kind === "audience") {
    return `“${issue.label}” is required but shown only to some visitors (${issue.who}), so everyone else can't send the form. Remove the rule from the field, or make it optional in Forms.`;
  }
  const where =
    issue.devices.length === 3 ? "on every device" : `on ${issue.devices.join(" and ")}`;
  return `“${issue.label}” is required but hidden ${where}, so visitors there can't send the form. Show the field there, or make it optional in Forms.`;
}
