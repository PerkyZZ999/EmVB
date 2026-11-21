import {
  fieldByName,
  fieldsOf,
  type FormDefinitions,
  type PublicFormDefinition,
  type PublicFormField,
} from "../forms/definition.ts";
import type { FormNode, LayoutNode, TextInputNode } from "../schema/layout.ts";
import { typedInputAttrs } from "../elements/input-limits.ts";
import { selectPrompt } from "../elements/select-prompt.ts";
import type { ThemeDynamicData } from "../theme/dynamic.ts";
import { nodeChildren } from "../tree-ops.ts";
import type { RenderContext } from "./context.ts";
import type { VNode } from "./vnode.ts";

export const FORMS_SUBMIT_PATH = "/_emdash/api/plugins/emdash-forms/submit";

/** What a paused form shows on the page (W-326). */
export const FORM_PAUSED_TEXT = "This form isn't accepting responses right now.";

const honeypot = (inputId: string): VNode => ({
  tag: "div",
  attrs: {
    class: "ec-form-hp",
    "aria-hidden": "true",
  },
  children: [
    {
      tag: "label",
      attrs: { for: inputId },
      children: ["Leave blank"],
    },
    {
      tag: "input",
      attrs: {
        type: "text",
        id: inputId,
        name: "_hp",
        tabindex: "-1",
        autocomplete: "off",
      },
      children: [],
    },
  ],
});

/** An EmDash Forms markup shell (D-006) around the form's fields; unbound forms only preview in the editor. */
/** The text of the form's first Submit button, as the page renders it. */
function firstSubmitLabel(nodes: readonly LayoutNode[]): string | undefined {
  for (const child of nodes) {
    if (child.type === "submit") {
      return (child.props as { label?: string }).label?.trim() || "Submit";
    }
    const found = firstSubmitLabel(nodeChildren(child));
    if (found !== undefined) return found;
  }
  return undefined;
}

export function renderForm(
  node: FormNode,
  attrs: Record<string, string>,
  ctx: RenderContext,
  dynamic: ThemeDynamicData | undefined,
): VNode | undefined {
  const formId = node.props.formId.trim();
  // Unbound forms: no live <form>/ec-form shell (avoids broken preview; public stays zero-JS).
  if (!formId) {
    if (ctx.mode === "public") return undefined;
    return {
      tag: "div",
      attrs: {
        ...attrs,
        class: `${attrs.class} emvb-form-unbound`.trim(),
        "data-emvb-form-unbound": "",
      },
      children: ["Bind a form in settings to preview it here."],
    };
  }
  // W-326: a paused form says so, in place of fields that can't be sent (the forms plugin refuses
  // its submissions), with no form, inputs or Submit button.
  if (ctx.definitions.get(formId)?.status === "paused") {
    return {
      tag: "div",
      attrs: {
        ...attrs,
        class: `${attrs.class} emvb-form-paused`.trim(),
        role: "status",
        "data-emvb-form-paused": "",
      },
      children: [{ tag: "p", attrs: {}, children: [FORM_PAUSED_TEXT] }],
    };
  }
  // W-203: the forms client puts this label back on the button after each submit, so it must be
  // the label the page shows, not the form definition's.
  const submitLabel =
    firstSubmitLabel(node.children) ??
    ctx.definitions.get(formId)?.settings.submitLabel ??
    "Submit";
  const previousForm = ctx.formId;
  ctx.formId = formId;
  const stepped = node.children.some((child) => child.type === "form-step");
  const page: VNode = {
    tag: "div",
    attrs: { "data-page": "0" },
    children: stepped ? [] : ctx.children(node.children, dynamic),
  };
  // W-1065: a form with steps has a page per step instead of one around everything.
  const pages = stepped ? steppedChildren(node, ctx, dynamic) : [page];
  ctx.formId = previousForm;
  return {
    tag: "form",
    attrs: {
      ...attrs,
      class: `${attrs.class} ec-form`.trim(),
      method: "POST",
      action: FORMS_SUBMIT_PATH,
      "data-ec-form": "",
      "data-form-id": formId,
      // W-297: the forms client checks each control itself and writes the message next to the
      // field, as the server's errors are; without this the browser's bubble would come first.
      novalidate: "",
      "data-submit-label": submitLabel,
    },
    children: [
      ...pages,
      { tag: "input", attrs: { type: "hidden", name: "formId", value: formId }, children: [] },
      ...hiddenFields(ctx.definitions.get(formId)),
      // One id per form element, so the same form placed twice keeps unique ids (W-187), also
      // when one form element renders twice, from a synced section or a loop item (W-249).
      honeypot(ctx.uniqueId(`emvb-hp-${node.id}`)),
      {
        tag: "div",
        attrs: { class: "ec-form-status", "data-form-status": "", "aria-live": "polite" },
        children: [],
      },
    ],
  };
}

/** W-1065: what the Next and Previous buttons say when the form element doesn't set it. */
const FORM_STEP_LABELS = { next: "Next", prev: "Previous" } as const;

const stepLabel = (value: string | undefined, fallback: string) => value?.trim() || fallback;

/** A Previous or Next button, hidden until the forms script shows it. */
const stepButton = (data: string, text: string, cls: string): VNode => ({
  tag: "button",
  attrs: { type: "button", class: cls, [data]: "", hidden: "" },
  children: [text],
});

/**
 * W-1065: a form with steps, in the forms plugin's multi-page markup. Each step is a page
 * (`data-page`, in order); the plugin's script shows one at a time, checks a page's fields before
 * Next, and writes "Step 2 of 3" into `data-ec-progress`. Its Previous and Next buttons are
 * hidden until the script shows them, so without it every step shows, as one long form, and the
 * Submit button sends it. Anything outside the steps (an intro, the Submit button) stays put.
 */
function steppedChildren(
  node: FormNode,
  ctx: RenderContext,
  dynamic: ThemeDynamicData | undefined,
): VNode[] {
  const out: VNode[] = [];
  let page = 0;
  let lastStep = -1;
  for (const child of node.children) {
    for (const vnode of ctx.children([child], dynamic)) {
      if (child.type !== "form-step") {
        out.push(vnode);
        continue;
      }
      const titled = vnode.children.some(
        (part) => typeof part !== "string" && part.tag === "legend",
      );
      out.push({
        ...vnode,
        attrs: {
          ...vnode.attrs,
          class: `${vnode.attrs.class ?? ""} ec-form-page`.trim(),
          "data-page": String(page),
          // The forms script moves focus here when the step opens (astro/forms/enhance.ts).
          tabindex: "-1",
          ...(titled ? {} : { "aria-label": `Step ${page + 1}` }),
        },
      });
      page += 1;
      lastStep = out.length - 1;
    }
  }
  if (lastStep === -1) return out;
  const nav: VNode = {
    tag: "div",
    attrs: { class: "emvb-form-step-nav" },
    children: [
      stepButton(
        "data-ec-prev",
        stepLabel(node.props.prevLabel, FORM_STEP_LABELS.prev),
        "emvb-form-step-prev",
      ),
      stepButton(
        "data-ec-next",
        stepLabel(node.props.nextLabel, FORM_STEP_LABELS.next),
        "emvb-form-step-next",
      ),
    ],
  };
  const progress: VNode = {
    tag: "p",
    attrs: { class: "emvb-form-step-progress", "data-ec-progress": "", "aria-live": "polite" },
    children: [],
  };
  const first = out.findIndex((vnode) => vnode.attrs["data-page"] === "0");
  out.splice(lastStep + 1, 0, nav);
  out.splice(first, 0, progress);
  return out;
}

/**
 * W-595: the definition's hidden fields (a source tag, a campaign id) have no control to place,
 * so the form carries them with their default value, as the forms plugin's own embed does.
 */
function hiddenFields(definition: PublicFormDefinition | undefined): VNode[] {
  if (!definition) return [];
  return fieldsOf(definition)
    .filter((field) => field.type === "hidden" && field.name)
    .map((field) => {
      const value = (field as { defaultValue?: unknown }).defaultValue;
      return {
        tag: "input",
        attrs: { type: "hidden", name: field.name, value: typeof value === "string" ? value : "" },
        children: [],
      };
    });
}

/** Replaces the children of every node matching `match`, anywhere in the tree. */
function replaceChildren(vnode: VNode, match: (node: VNode) => boolean, children: VNode[]): VNode {
  if (match(vnode)) return { ...vnode, children };
  return {
    ...vnode,
    children: vnode.children.map((child) =>
      typeof child === "string" ? child : replaceChildren(child, match, children),
    ),
  };
}

/** Applies `edit` to every element node in the tree, children first. */
function mapNodes(vnode: VNode, edit: (node: VNode) => VNode): VNode {
  return edit({
    ...vnode,
    children: vnode.children.map((child) =>
      typeof child === "string" ? child : mapNodes(child, edit),
    ),
  });
}

/** Definition types a Text input can take on; the rest stay `text`. */
const INPUT_TYPES = new Set(["email", "tel", "url", "number", "date"]);
const LENGTH_TYPES = new Set(["text", "email", "tel", "url", "textarea"]);
const isControl = (node: VNode) =>
  ["input", "select", "textarea"].includes(node.tag) && node.attrs.type !== "hidden";

/**
 * A `pattern` the browser can compile. A group that can repeat and that itself contains `|` or
 * another quantifier (`(a+)+`, `(a|aa)+`) is left off: it can hang the visitor's tab while they
 * type. A pattern that does not compile is left off too.
 */
function hasControlChar(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** How much of `pattern` at `index` is a quantifier, and whether it can repeat enough to hang. */
function quantifierAt(
  pattern: string,
  index: number,
): { consumed: number; dangerous: boolean; repeats: boolean } {
  const none = { consumed: 0, dangerous: false, repeats: false };
  const ch = pattern[index];
  if (ch === "+" || ch === "*") {
    const lazy = pattern[index + 1] === "?" ? 1 : 0;
    return { consumed: 1 + lazy, dangerous: true, repeats: true };
  }
  if (ch === "?") return { consumed: 1, dangerous: false, repeats: false };
  if (ch !== "{") return none;
  const match = /^\{(\d+)(?:\s*,\s*(\d+)?)?\}\??/.exec(pattern.slice(index));
  if (!match) return none;
  const min = Number(match[1]);
  const hasComma = match[0].includes(",");
  const max =
    match[2] === undefined ? (hasComma ? Number.POSITIVE_INFINITY : min) : Number(match[2]);
  if (max < min) return none;
  return { consumed: match[0].length, dangerous: max > 20, repeats: max > 1 };
}

/**
 * True when a group that contains `|` or a quantifier is itself repeated without a small bound.
 * `(abc)+` and `(https?:\/\/)?` stay allowed.
 */
function repeatsARiskyGroup(pattern: string): boolean {
  const stack: { risky: boolean }[] = [];
  let inClass = false;
  const mark = () => {
    const frame = stack[stack.length - 1];
    if (frame) frame.risky = true;
  };
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      continue;
    }
    if (ch === "(") {
      stack.push({ risky: false });
      // W-594: the `?` of `(?:`, `(?=`, `(?!`, `(?<=`, `(?<!` or `(?<name>` is not a quantifier.
      const prefix = /^\?(?::|=|!|<=|<!|<[A-Za-z_$][\w$]*>)/.exec(pattern.slice(i + 1));
      if (prefix) i += prefix[0].length;
      continue;
    }
    if (ch === ")") {
      const frame = stack.pop();
      if (!frame) return true;
      const quantifier = quantifierAt(pattern, i + 1);
      if (quantifier.dangerous && frame.risky) return true;
      if (quantifier.repeats || frame.risky) mark();
      i += quantifier.consumed;
      continue;
    }
    if (ch === "|" || ch === "+" || ch === "*" || ch === "?") {
      mark();
      continue;
    }
    if (ch === "{") {
      const quantifier = quantifierAt(pattern, i);
      if (quantifier.consumed === 0) continue;
      mark();
      i += quantifier.consumed - 1;
    }
  }
  return false;
}

function safeInputPattern(pattern: string): string | undefined {
  const value = pattern.trim();
  if (!value || value.length > 200 || hasControlChar(value)) return undefined;
  if (repeatsARiskyGroup(value)) return undefined;
  try {
    const compiled = new RegExp(value);
    compiled.test("");
  } catch {
    return undefined;
  }
  if (compilesAsPattern(value)) return value;
  const repaired = escapeClassLiterals(value);
  return compilesAsPattern(repaired) ? repaired : undefined;
}

/**
 * W-538: browsers compile `pattern` as `^(?:…)$` with the `v` flag, which refuses a common
 * pattern such as `[A-Za-z0-9_-]+` (a `-` or `(` left bare in a class). The browser then drops
 * the check with a console error, so the field went unchecked.
 */
function compilesAsPattern(value: string): boolean {
  try {
    return new RegExp(`^(?:${value})$`, "v").source.length > 0;
  } catch {
    return false;
  }
}

/** Escapes, inside character classes, the literals `v` mode wants escaped: a loose `-`, ()[]{}/|. */
function escapeClassLiterals(value: string): string {
  let out = "";
  let inClass = false;
  let classStart = 0;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i] as string;
    if (ch === "\\") {
      out += ch + (value[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (!inClass) {
      if (ch === "[") {
        inClass = true;
        out += ch;
        if (value[i + 1] === "^") {
          out += "^";
          i += 1;
        }
        classStart = i + 1;
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === "]") {
      inClass = false;
      out += ch;
      continue;
    }
    if (ch === "-") {
      const loose = i === classStart || value[i + 1] === "]";
      out += loose ? "\\-" : ch;
      continue;
    }
    out += "()[{}/|".includes(ch) ? `\\${ch}` : ch;
  }
  return out;
}

function lengthLimit(value: unknown, round: (n: number) => number): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const whole = round(value);
  return whole >= 0 ? String(whole) : undefined;
}

/**
 * W-297: what the forms plugin's own embed puts on a control: the input type (so phones show the
 * right keyboard), `required`, and the length, range and pattern limits, plus a visible mark on
 * the label. Without them the forms client found nothing to check before sending.
 */
function withFieldMeta(vnode: VNode, node: LayoutNode, meta: PublicFormField): VNode {
  const own = node.type === "text-input" ? (node as TextInputNode).props : undefined;
  // W-1065: a plain text field may be asked for as a number or a date; the forms plugin takes
  // either as text. A field with its own type (email, number, date) keeps it.
  const type =
    node.type === "text-input" && INPUT_TYPES.has(meta.type)
      ? meta.type
      : meta.type === "text"
        ? own?.inputType
        : undefined;
  const rules = meta.validation ?? {};
  const kind = type ?? (node.type === "textarea" ? "textarea" : meta.type);
  const limits: Record<string, string> = {};
  if (node.type === "text-input" || node.type === "textarea") {
    if (LENGTH_TYPES.has(kind)) {
      // W-588: the browser drops a minlength/maxlength that isn't a whole number >= 0, so a
      // fractional limit is rounded inward and a negative or non-finite one is left off.
      const lo = lengthLimit(rules.minLength, Math.ceil);
      const hi = lengthLimit(rules.maxLength, Math.floor);
      if (lo !== undefined) limits.minlength = lo;
      if (hi !== undefined) limits.maxlength = hi;
    }
    if (own && (kind === "number" || kind === "date")) {
      // W-578: unless the element sets a step, a number takes decimals, as the forms plugin does.
      Object.assign(limits, typedInputAttrs(kind, own, kind === "number" ? rules : {}));
    } else if (kind === "number") {
      if (rules.min !== undefined) limits.min = String(rules.min);
      if (rules.max !== undefined) limits.max = String(rules.max);
      limits.step = "any";
    }
    if (node.type === "text-input" && kind !== "number" && kind !== "date" && rules.pattern) {
      const pattern = safeInputPattern(rules.pattern);
      if (pattern) limits.pattern = pattern;
    }
  }
  const mark: VNode = {
    tag: "span",
    attrs: { class: "emvb-form-required", "aria-hidden": "true" },
    children: [" *"],
  };
  return mapNodes(vnode, (child) => {
    if (isControl(child)) {
      // The element's own number or date limits were for the type it asked for, not this one.
      const { min: _min, max: _max, step: _step, ...rest } = child.attrs;
      return {
        ...child,
        attrs: {
          ...(own ? rest : child.attrs),
          ...(type ? { type } : {}),
          ...(meta.required ? { required: "" } : {}),
          ...limits,
        },
      };
    }
    if (!meta.required || (child.tag !== "label" && child.tag !== "legend")) return child;
    if (child.attrs.class === "emvb-form-label") {
      return { ...child, children: [...child.children, mark] };
    }
    // The checkbox label wraps the input and the label text; the mark follows the text.
    // W-441: the same hidden mark as other labels; a plain " *" was read out as "star".
    if (child.attrs.class === "emvb-form-checkbox-label") {
      let last = -1;
      child.children.forEach((part, i) => {
        if (typeof part === "string") last = i;
      });
      if (last === -1) return child;
      const children = [...child.children];
      children.splice(last + 1, 0, mark);
      return { ...child, children };
    }
    return child;
  });
}

/** Fills a field from the form it sits in: options, type, limits. Other forms are left alone. */
function withDefinedField(
  vnode: VNode,
  node: LayoutNode,
  definitions: FormDefinitions,
  formId?: string,
): VNode {
  const field = (node.props as { field?: unknown }).field;
  if (typeof field !== "string" || !formId) return vnode;
  const definition = definitions.get(formId);
  if (!definition) return vnode;
  const meta = fieldByName(definition, field);
  if (!meta) return vnode;
  return withFieldMeta(withOptions(vnode, node, meta), node, meta);
}

/** Fills a field from the form it sits in, and carries its show condition (W-596). */
export function withFieldOptions(
  vnode: VNode,
  node: LayoutNode,
  definitions: FormDefinitions,
  formId?: string,
): VNode {
  const built = withDefinedField(vnode, node, definitions, formId);
  const field = (node.props as { field?: unknown }).field;
  if (built === vnode || typeof field !== "string" || !formId) return built;
  const meta = fieldByName(definitions.get(formId), field);
  return meta ? withCondition(built, meta) : built;
}

const CONDITION_OPS = new Set(["eq", "neq", "filled", "empty"]);

/**
 * W-596: a field the definition shows only on a condition (`other` when Topic is Other) carries
 * it as the plugin's embed does; the forms client then hides and disables it, so its `required`
 * no longer blocks the form while it can't be filled.
 */
function withCondition(vnode: VNode, meta: PublicFormField): VNode {
  const raw = (meta as { condition?: unknown }).condition;
  if (!raw || typeof raw !== "object") return vnode;
  const { field, op, value } = raw as Record<string, unknown>;
  if (typeof field !== "string" || !field || typeof op !== "string" || !CONDITION_OPS.has(op)) {
    return vnode;
  }
  const condition = typeof value === "string" ? { field, op, value } : { field, op };
  return { ...vnode, attrs: { ...vnode.attrs, "data-condition": JSON.stringify(condition) } };
}

/** The fieldset that holds a radio group's options. */
const radioGroup = (child: VNode) =>
  child.tag === "fieldset" && (child.attrs.class ?? "").includes("emvb-radio-group");

/** A select or radio field filled with the definition's options. */
function withOptions(vnode: VNode, node: LayoutNode, meta: PublicFormField): VNode {
  const field = meta.name;
  if ((node.type !== "select" && node.type !== "radio") || !meta.options?.length) return vnode;
  if (node.type === "select") {
    return replaceChildren(vnode, (child) => child.tag === "select", [
      {
        tag: "option",
        attrs: { value: "" },
        children: [selectPrompt(node.props as { placeholder?: string })],
      },
      ...meta.options.map((option): VNode => ({
        tag: "option",
        attrs: { value: option.value },
        children: [option.label],
      })),
    ]);
  }
  // W-524: the group's <legend> stays; only the placeholder option is replaced.
  const legend = findNode(vnode, radioGroup)?.children.filter(
    (child): child is VNode => typeof child !== "string" && child.tag === "legend",
  );
  return replaceChildren(vnode, radioGroup, [
    ...(legend ?? []),
    ...meta.options.map((option): VNode => ({
      tag: "label",
      attrs: { class: "emvb-form-radio-label" },
      children: [
        {
          tag: "input",
          attrs: { type: "radio", name: field, value: option.value },
          children: [],
        },
        ` ${option.label}`,
      ],
    })),
  ]);
}

/** The first element node `match` accepts, depth first. */
function findNode(vnode: VNode, match: (node: VNode) => boolean): VNode | undefined {
  if (match(vnode)) return vnode;
  for (const child of vnode.children) {
    if (typeof child === "string") continue;
    const found = findNode(child, match);
    if (found) return found;
  }
  return undefined;
}
