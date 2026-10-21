import { MAX_NODES } from "../limits.ts";
import { loneAbTests, variantShows } from "../audience/variants.ts";
import { audienceShows, audienceSummary } from "../audience/rules.ts";
import { generateCss } from "../css/generate.ts";
import { printCss } from "../css/print.ts";
import { cssScopeToken, scopeClassName, scopeCss, scopeWrapperCss } from "../css/scope.ts";
import { ELEMENTS } from "../elements/index.ts";
import { controlId } from "../elements/field-id.ts";
import { layoutHasForm } from "../forms/binding.ts";
import { nodeChildren, someNode } from "../tree-ops.ts";
import { layoutHasMenuDropdown, layoutHasTabs } from "../tabs/presence.ts";
import type { DesignSystem } from "../schema/design.ts";
import {
  FORM_FIELD_TYPES,
  isFormNode,
  isLoopNode,
  isParentNode,
  isSectionNode,
  isTabsNode,
  type Layout,
  type LayoutNode,
  type PaginationNode,
} from "../schema/layout.ts";
import {
  cssLength,
  stateDeclarations,
  styleClassName,
  styleDeclarations,
  withInheritedLayers,
  type Declaration,
  type StateDeclarations,
} from "../sanitize/css.ts";
import { STYLE_STATES } from "../schema/state-names.ts";
import { resolveEmbedUrl } from "../sanitize/embed-url.ts";
import { resolvePostForRender, type ThemeDynamicData } from "../theme/dynamic.ts";
import type { FormDefinitions } from "../forms/definition.ts";
import type { PopupDevice } from "../theme/popup-rules.ts";
import type { RenderContext, RenderMode } from "./context.ts";
import { isDynamicPostNode, renderDynamicPost } from "./dynamic-post.ts";
import { renderForm, withFieldOptions } from "./form.ts";
import { renderLoop } from "./loop.ts";
import { renderPagination } from "./pagination.ts";
import { renderSection } from "./section.ts";
import { renderTabs } from "./tabs.ts";
import { serialize, type VNode } from "./vnode.ts";
import { classStylesInListOrder, resolveCascade } from "../design/cascade.ts";
import { applyBindings, hasBindings, type BindingData } from "../data/bindings.ts";
import {
  applyBackgroundVideo,
  applyBoxLink,
  customAttributes,
  safeBackgroundVideo,
} from "./extras.ts";

export type { RenderMode } from "./context.ts";
export { FORMS_SUBMIT_PATH } from "./form.ts";

export type RenderWarning = {
  nodeId: string;
  code: "unknown-type" | "rejected-style" | "unknown-variable";
  detail: string;
};
export type RenderResult = {
  vnode: VNode;
  html: string;
  css: string;
  needsFormsRuntime: boolean;
  needsTabsRuntime: boolean;
  /** A Menu has a dropdown: hosts load `EmVBMenuRuntime` (W-197). */
  needsMenuRuntime: boolean;
  /** The site's text direction when set in Site styles, for the host's `<html dir>` (W-230). */
  dir?: "ltr" | "rtl" | "auto";
  warnings: RenderWarning[];
};

const ID = /^[A-Za-z0-9_-]{4,24}$/;
const HTML_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/** A focal-point percentage, or the fallback when that axis is unset. Anything else is dropped. */
function focalPercent(value: unknown, fallback: number): number | undefined {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    return undefined;
  }
  return value;
}

/** `object-position` only when both axes are whole percentages. A string here would break the sheet. */
function objectPosition(x: unknown, y: unknown): string | undefined {
  if (x === undefined && y === undefined) return undefined;
  const px = focalPercent(x, 50);
  const py = focalPercent(y, 50);
  if (px === undefined || py === undefined) return undefined;
  return `${px}% ${py}%`;
}

/** `@container (min-width)` only for a whole pixel width in the schema's range. */
function containerQueryMin(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 3840) {
    return undefined;
  }
  return value;
}

// Canvas iframe has no allow-scripts (D-011): live YouTube/Vimeo players fail there.
function videoPreview(node: LayoutNode, attrs: Record<string, string>): VNode | undefined {
  const target = resolveEmbedUrl((node.props as { url: string }).url);
  if (target?.kind !== "iframe") return undefined;
  const label =
    (node.props as { title?: string }).title?.trim() ||
    (target.provider === "youtube" ? "YouTube video" : "Vimeo video");
  return {
    tag: "div",
    attrs: {
      ...attrs,
      class: `${attrs.class} emvb-video-preview`.trim(),
      "data-emvb-video-preview": target.provider,
    },
    children: [`${label} — plays on the published page`],
  };
}

/**
 * Renders a validated layout to lean HTML and CSS (R-031, R-032). Walks defensively: unknown types
 * render nothing publicly and a placeholder in the editor (R-033); unsafe style values are dropped.
 */
/** `grid-template-columns` for a whole column count from 1 to 12; anything else emits nothing. */
const gridTracks = (columns: unknown): Declaration[] =>
  typeof columns === "number" && Number.isInteger(columns) && columns >= 1 && columns <= 12
    ? [{ property: "grid-template-columns", value: `repeat(${columns}, minmax(0, 1fr))` }]
    : [];

const GRID_TRACK =
  /^(?:1fr|2fr|3fr|auto|min-content|max-content|0|(?:\d+(?:\.\d+)?)(?:px|rem|em|%|vw|vh|ch))$/;

/** Custom tracks replace equal columns when every track is in the allowlist. */
const customTracks = (value: unknown): string | undefined => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return undefined;
  if (!value.every((track) => typeof track === "string" && GRID_TRACK.test(track)))
    return undefined;
  return value.join(" ");
};

const gridTemplate = (tracks: unknown, columns: unknown): Declaration[] => {
  const custom = customTracks(tracks);
  if (custom) return [{ property: "grid-template-columns", value: custom }];
  return gridTracks(columns);
};

/** A node with at least one child; tolerant of a malformed node without a children array. */
const hasChildren = (node: LayoutNode): boolean => {
  const children: unknown = (node as { children?: unknown }).children;
  return Array.isArray(children) && children.length > 0;
};

/** A short, stable hash of a node origin, for its suffixed rule id (W-250). */
function originHash(origin: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < origin.length; i += 1) {
    hash ^= origin.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** Form fields whose control carries an `emvb-field-<id>` HTML id (W-187). */
const FIELD_TYPES = new Set<string>(FORM_FIELD_TYPES.filter((type) => type !== "submit"));

const ID_ATTRS = ["id", "for", "aria-controls", "aria-labelledby", "aria-describedby"] as const;

/** Rewrites `base` (or `base-…`) to `next` in the id and id-reference attributes of a subtree. */
function renameIds(vnode: VNode, base: string, next: string): VNode {
  const attrs = { ...vnode.attrs };
  for (const key of ID_ATTRS) {
    const value = attrs[key];
    if (value === undefined) continue;
    attrs[key] = value
      .split(" ")
      .map((ref) =>
        ref === base || ref.startsWith(`${base}-`) ? next + ref.slice(base.length) : ref,
      )
      .join(" ");
  }
  return {
    ...vnode,
    attrs,
    children: vnode.children.map((child) =>
      typeof child === "string" ? child : renameIds(child, base, next),
    ),
  };
}

/** Elements synced sections may add to one render, all copies together (W-653): 20 full pages. */
const MAX_SECTION_ELEMENTS = 20 * MAX_NODES;

export function renderPage(
  layout: Layout,
  design: DesignSystem,
  opts: {
    mode?: RenderMode;
    formDefinitions?: FormDefinitions;
    dynamic?: ThemeDynamicData;
    /** Public renders: wrap the markup and scope the CSS to it, so sheets can't override each other (W-112). */
    scope?: string;
    /** Editor canvas: device rules follow this device, not the frame width (W-116). */
    previewDevice?: PopupDevice;
    /**
     * Theme parts (header, footer, popup, float) render apart from the page, so a synced section
     * on both gave form fields, honeypots and tab groups the same ids: a label in a popup focused
     * the page's field. Their generated ids get a suffix from `scope` (W-527).
     */
    partIds?: boolean;
    /** The page's language, e.g. "fr-CA": Post Dates are written in it (W-688). */
    lang?: string;
  } = {},
): RenderResult {
  const mode = opts.mode ?? "public";
  const baseDynamic = opts.dynamic;
  const warnings: RenderWarning[] = [];
  const usedTypes = new Set<string>();
  const localRules: {
    id: string;
    declarations: Declaration[];
    states: StateDeclarations;
    tablet?: Declaration[];
    mobile?: Declaration[];
    hiddenOn?: LayoutNode["hiddenOn"];
    query?: Declaration[];
    queryMin?: number;
  }[] = [];
  const layoutHasToc = treeHasType(layout.root, "toc");
  // W-799: each grid child's grid, so a span or start line that doesn't fit a device's columns
  // can be clamped there.
  const gridOf = new Map<string, LayoutNode>();
  someNode(layout.root, (current) => {
    if (current.type === "grid")
      for (const child of nodeChildren(current)) gridOf.set(child.id, current);
    return false;
  });
  const loneTests = loneAbTests(layout);
  // W-384: a table of contents lists the page's headings that actually render, with their
  // rendered text, so a hidden A/B arm or audience heading is not a dead link.
  const pageHeadings = layoutHasToc
    ? new Map(headingAnchors(layout.root).map((h) => [h.node, h.hiddenOn]))
    : undefined;
  const renderedHeadings: { id: string; text: string; tocClass?: string }[] = [];
  const emittedIds = new Set<string>();
  const tocNodes: { node: LayoutNode; vnode: VNode }[] = [];
  const knownVariables = new Set(design.variables.colors.map((c) => c.id));
  let backgroundVideo = false;

  const domIds = new Map<string, number>();
  const idSuffix = opts.partIds && opts.scope ? `-t${originHash(opts.scope)}` : "";
  // W-253: runtimes follow what renders, including synced section and loop item contents,
  // which the page's own layout doesn't hold.
  const rendered = { form: false, tabs: false, menuDropdown: false };
  let sectionBudget = MAX_SECTION_ELEMENTS;
  const ctx: RenderContext = {
    takeSectionBudget: (nodes) => {
      if (nodes > sectionBudget) return false;
      sectionBudget -= nodes;
      return true;
    },
    mode,
    ...(opts.lang ? { lang: opts.lang } : {}),
    definitions: opts.formDefinitions ?? new Map(),
    children: (nodes, dynamic) =>
      nodes
        .map((child) => visit(child, false, dynamic))
        .filter((child): child is VNode => child !== undefined),
    uniqueId: (base) => {
      const count = (domIds.get(base) ?? 0) + 1;
      domIds.set(base, count);
      return `${base}${count === 1 ? "" : `-r${count}`}${idSuffix}`;
    },
  };

  // W-250: the first origin (page, synced section, loop item part) to use each element id.
  const idOrigins = new Map<string, string>();
  /** The id in `.emvb-e-<id>`: suffixed when another layout already used this id here. */
  const ruleIdFor = (id: string, origin: string): string => {
    const first = idOrigins.get(id);
    if (first === undefined) idOrigins.set(id, origin);
    return first === undefined || first === origin ? id : `${id}-o${originHash(origin)}`;
  };

  const nodeAttrs = (
    node: LayoutNode,
    isRoot: boolean,
    id: string | undefined,
    nodeId: string,
    ruleId: string | undefined,
  ): Record<string, string> => {
    const classes = [...(isRoot ? ["emvb-root"] : []), `emvb-${node.type}`];
    for (const classId of node.classes ?? []) {
      const name = styleClassName(classId);
      if (name) classes.push(name);
    }
    // W-319: an element's own entrance or scroll motion keeps the other one its classes set.
    const fromClasses = resolveCascade(classStylesInListOrder(design.classes, node.classes ?? []));
    const classAnimation = {
      ...(fromClasses.entrance ? { entrance: fromClasses.entrance } : {}),
      ...(fromClasses.scrollMotion ? { scrollMotion: fromClasses.scrollMotion } : {}),
    };
    // W-569: and an own image, gradient or overlay keeps the layers its classes draw, as they
    // share one background-image stack and the local rule would otherwise replace them.
    const classLayers = {
      ...classAnimation,
      ...Object.fromEntries(
        (
          [
            "backgroundImage",
            "gradient",
            "overlay",
            "backgroundSize",
            "backgroundPosition",
            "backgroundRepeat",
          ] as const
        )
          .filter((key) => fromClasses[key] !== undefined)
          .map((key) => [key, fromClasses[key]]),
      ),
    };
    const own = node.style
      ? (withInheritedLayers(node.style, classLayers) as typeof node.style)
      : undefined;
    const { declarations, rejected } = styleDeclarations(own);
    // W-210: a device that sets one background layer keeps the layers it inherits.
    const base = { ...classLayers, ...own };
    const tabletStyle = node.devices?.tablet;
    const tablet = styleDeclarations(withInheritedLayers(tabletStyle, base));
    const mobile = styleDeclarations(
      withInheritedLayers(node.devices?.mobile, { ...base, ...tabletStyle }),
    );
    for (const key of [...rejected, ...tablet.rejected, ...mobile.rejected]) {
      warnings.push({ nodeId, code: "rejected-style", detail: key });
    }
    if (node.type === "spacer") {
      const height = cssLength((node as { props: { height: unknown } }).props.height);
      if (height) declarations.push({ property: "height", value: height });
    }
    if (node.type === "layout-section") {
      // The inner box's width (W-156): full width, or a length; unset keeps the 1140 px default.
      const props = (node as { props: { contentWidth?: unknown; fullWidth?: unknown } }).props;
      const width = props.fullWidth === true ? "none" : cssLength(props.contentWidth);
      if (width) declarations.push({ property: "--emvb-content-width", value: width });
    }
    if (node.type === "loop") {
      // W-308: grid and cards columns, as a custom property the Loop's base CSS reads.
      const columns = (node as { props: { columns?: unknown } }).props.columns;
      if (
        typeof columns === "number" &&
        Number.isInteger(columns) &&
        columns >= 1 &&
        columns <= 6
      ) {
        declarations.push({ property: "--emvb-loop-columns", value: String(columns) });
      }
    }
    if (node.container) declarations.push({ property: "container-type", value: "inline-size" });
    // W-523: a query container can't size to its content, so in a row (or with align-items other
    // than stretch) it collapsed to 0 px and its content vanished. Full width unless a width is set.
    if (node.container && node.style?.width === undefined && !node.classes?.length) {
      declarations.push({ property: "width", value: "100%" });
    }
    if (node.type === "image") {
      const focal = node.props as { focalX?: unknown; focalY?: unknown };
      const position = objectPosition(focal.focalX, focal.focalY);
      if (position) {
        declarations.push({ property: "object-position", value: position });
        declarations.push({ property: "object-fit", value: "cover" });
      }
    }
    if (node.type === "button") {
      const gap = (node.props as { iconGap?: unknown }).iconGap;
      if (typeof gap === "number" && Number.isInteger(gap) && gap >= 0 && gap <= 64) {
        declarations.push({ property: "gap", value: `${gap}px` });
      }
    }
    const queryStyle = node.query ? styleDeclarations(node.query.style) : undefined;
    for (const key of queryStyle?.rejected ?? []) {
      warnings.push({ nodeId, code: "rejected-style", detail: key });
    }
    if (node.type === "grid") {
      const props = (node as { props: Record<string, unknown> }).props;
      declarations.push(...gridTemplate(props["columnTracks"], props["columns"]));
      // Tablet and mobile counts go in their media queries (W-139). Custom tracks replace them.
      const tabletColumns = gridTemplate(props["columnTracksTablet"], props["columnsTablet"]);
      const mobileColumns = gridTemplate(props["columnTracksMobile"], props["columnsMobile"]);
      if (props["columnTracksTablet"] !== undefined || props["columnsTablet"] !== undefined) {
        tablet.declarations.unshift(...tabletColumns);
      }
      if (props["columnTracksMobile"] !== undefined || props["columnsMobile"] !== undefined) {
        mobile.declarations.unshift(...mobileColumns);
      }
    }
    const grid = gridOf.get(node.id);
    if (grid) {
      const counts = gridColumnCounts(grid);
      const tabletPlacement = { ...node.style, ...node.devices?.tablet };
      const levels = [
        node.style ?? {},
        tabletPlacement,
        { ...tabletPlacement, ...node.devices?.mobile },
      ];
      const fitted = levels.map((style, i) =>
        fitGridColumn(style.gridColumnStart, style.gridColumnSpan, counts[i] ?? 1),
      );
      if (fitted.some((f) => f.changed)) {
        const at = (i: number) => ({ property: "grid-column", value: fitted[i]?.value ?? "auto" });
        const kept = declarations.filter((d) => d.property !== "grid-column");
        declarations.splice(0, declarations.length, ...kept, at(0));
        tablet.declarations.push(at(1));
        mobile.declarations.push(at(2));
      }
    }
    const states = stateDeclarations(node.states);
    for (const key of states.rejected) {
      warnings.push({ nodeId, code: "rejected-style", detail: key });
    }
    for (const color of [node.style?.color, ...STYLE_STATES.map((s) => node.states?.[s]?.color)]) {
      if (typeof color === "object" && !knownVariables.has(color.var)) {
        warnings.push({ nodeId, code: "unknown-variable", detail: color.var });
      }
    }
    // W-567: the root is the page itself; hiding it on a device blanked the whole page there.
    const hiddenOn = isRoot ? undefined : node.hiddenOn;
    const responsive =
      tablet.declarations.length > 0 ||
      mobile.declarations.length > 0 ||
      (hiddenOn?.length ?? 0) > 0;
    const queryDeclarations = queryStyle?.declarations ?? [];
    const queryMin = containerQueryMin(node.query?.min);
    if (
      ruleId &&
      (declarations.length > 0 ||
        Object.keys(states.states).length > 0 ||
        responsive ||
        (queryDeclarations.length > 0 && queryMin !== undefined))
    ) {
      classes.push(`emvb-e-${ruleId}`);
      localRules.push({
        id: ruleId,
        declarations,
        states: states.states,
        tablet: tablet.declarations,
        mobile: mobile.declarations,
        hiddenOn,
        ...(node.type === "image" &&
        String((node.props as { caption?: unknown }).caption ?? "").trim() !== ""
          ? { figure: true }
          : {}),
        ...(queryDeclarations.length > 0 && queryMin !== undefined
          ? { query: queryDeclarations, queryMin }
          : {}),
      });
    }
    const attrs: Record<string, string> = { class: classes.join(" "), ...customAttributes(node) };
    if (mode === "editor" && id) attrs["data-emvb-id"] = id;
    const htmlId =
      node.htmlId && HTML_ID.test(node.htmlId)
        ? node.htmlId
        : node.type === "heading" && id && layoutHasToc
          ? `emvb-h-${id}`
          : undefined;
    // W-649: a Loop renders its item design once per entry; an id repeated on the page is invalid
    // and every Table of contents link or label would point at the first copy only.
    if (htmlId && !emittedIds.has(htmlId)) {
      emittedIds.add(htmlId);
      attrs.id = htmlId;
    }
    // W-230: the site's text direction on the root, also a fallback when the host's <html> has none.
    if (node.dir === "ltr" || node.dir === "rtl" || node.dir === "auto") attrs.dir = node.dir;
    else if (isRoot && design.direction) attrs.dir = design.direction;
    return attrs;
  };

  function visit(
    stored: LayoutNode,
    isRoot: boolean,
    dynamic: ThemeDynamicData | undefined = baseDynamic,
  ): VNode | undefined {
    // W-307: bound fields read their live value; the typed value is the fallback.
    const node = stored.bind ? applyBindings(stored, bindingData(dynamic)) : stored;
    // W-312: only the visitor's arm of an A/B test renders; the editor shows every arm.
    if (mode === "public" && !variantShows(stored, dynamic?.abArms, loneTests)) return undefined;
    // W-313: visitor-aware elements render only for their audience; the editor shows them all.
    if (mode === "public" && !audienceShows(stored, dynamic?.visitor)) return undefined;
    const id = ID.test(node.id) ? node.id : undefined;
    const nodeId = id ?? "(invalid id)";
    const type: string = node.type;
    if (!Object.hasOwn(ELEMENTS, type)) {
      warnings.push({ nodeId, code: "unknown-type", detail: type });
      if (mode === "public") return undefined;
      return {
        tag: "div",
        attrs: { class: "emvb-unknown", ...(id ? { "data-emvb-id": id } : {}) },
        children: [`Unknown element "${type}"`],
      };
    }
    usedTypes.add(type);
    if (isFormNode(node) && node.props.formId.trim()) rendered.form = true;
    if (isTabsNode(node)) rendered.tabs = true;
    if (type === "menu-item" && hasChildren(node)) rendered.menuDropdown = true;
    const ruleId = id === undefined ? undefined : ruleIdFor(id, dynamic?.idOrigin ?? "");
    const attrs = nodeAttrs(node, isRoot, id, nodeId, ruleId);
    if (mode === "editor" && hasBindings(stored)) attrs["data-emvb-bound"] = "";
    if (mode === "editor" && stored.audience) {
      attrs["data-emvb-audience"] = audienceSummary(stored.audience);
    }
    if (mode === "editor" && stored.variant) {
      attrs["data-emvb-variant"] = `${stored.variant.test} · ${stored.variant.arm.toUpperCase()}`;
    }
    const def = ELEMENTS[type as keyof typeof ELEMENTS];
    if (isFormNode(node)) return finish(node, renderForm(node, attrs, ctx, dynamic));
    if (isLoopNode(node)) return finish(node, renderLoop(node, attrs, ctx, dynamic));
    if (node.type === "pagination") {
      return finish(node, renderPagination(node as PaginationNode, attrs, dynamic, mode));
    }
    if (isSectionNode(node)) return finish(node, renderSection(node, attrs, ctx, dynamic));
    if (isDynamicPostNode(node)) {
      return finish(
        node,
        renderDynamicPost(
          node,
          attrs,
          resolvePostForRender(dynamic, mode),
          mode,
          dynamic?.inLoopItem === true,
          ctx.lang,
        ),
      );
    }
    if (isTabsNode(node)) return finish(node, renderTabs(node, id, attrs, ctx, dynamic));
    if (node.type === "toc") {
      const built = def.build(node as never, attrs, []);
      const vnode = { ...built, children: [] as (VNode | string)[] };
      tocNodes.push({ node, vnode });
      return finish(node, vnode);
    }
    if (node.type === "heading" && pageHeadings?.has(stored) && attrs.id) {
      const text = String((node.props as { text?: unknown }).text ?? "").trim();
      // W-409: a heading hidden on every device has nothing to jump to.
      const hiddenEverywhere = (["desktop", "tablet", "mobile"] as const).every((device) =>
        node.hiddenOn?.includes(device),
      );
      if (text && !hiddenEverywhere && !renderedHeadings.some((h) => h.id === attrs.id)) {
        // W-793: a heading hidden on some devices (itself or an ancestor) hides its contents
        // entry there too, or the entry was a dead link on those devices.
        const hiddenOn = pageHeadings.get(stored) ?? [];
        const tocId = `toc-${node.id}`;
        if (hiddenOn.length > 0) {
          localRules.push({ id: tocId, declarations: [], states: {}, hiddenOn: [...hiddenOn] });
        }
        renderedHeadings.push({
          id: attrs.id,
          text,
          ...(hiddenOn.length > 0 ? { tocClass: `emvb-e-${tocId}` } : {}),
        });
      }
    }
    if (isParentNode(node)) {
      return finish(node, def.build(node as never, attrs, ctx.children(node.children, dynamic)));
    }
    if (mode === "editor" && node.type === "video") {
      const preview = videoPreview(node, attrs);
      if (preview) return finish(node, preview);
    }
    const built = withFieldOptions(
      def.build(node as never, attrs, []),
      node,
      ctx.definitions,
      ctx.formId,
    );
    return finish(node, FIELD_TYPES.has(type) && id ? uniqueField(built, controlId(id)) : built);
  }

  /** W-249: a field rendered again (synced section, loop item) moves its control to a new id. */
  function uniqueField(vnode: VNode, base: string): VNode {
    const unique = ctx.uniqueId(base);
    return unique === base ? vnode : renameIds(vnode, base, unique);
  }

  function videoOf(node: LayoutNode): string | undefined {
    let found: string | undefined;
    for (const style of classStylesInListOrder(design.classes, node.classes ?? [])) {
      const safe = safeBackgroundVideo(style?.backgroundVideo);
      if (safe) found = safe;
    }
    const own = safeBackgroundVideo(node.style?.backgroundVideo);
    return own ?? found;
  }

  function finish(node: LayoutNode, vnode: VNode | undefined): VNode | undefined {
    if (!vnode) return undefined;
    const src = videoOf(node);
    if (src) backgroundVideo = true;
    return applyBackgroundVideo(applyBoxLink(node, vnode), src);
  }

  function bindingData(dynamic: ThemeDynamicData | undefined): BindingData {
    return {
      post: resolvePostForRender(dynamic, mode),
      ...(dynamic?.site ? { site: dynamic.site } : {}),
      ...(dynamic?.params ? { params: dynamic.params } : {}),
      ...(dynamic?.origin ? { origin: dynamic.origin } : {}),
    };
  }

  const page = visit(layout.root, true) ?? {
    tag: "div",
    attrs: { class: "emvb-root" },
    children: [],
  };
  for (const toc of tocNodes) {
    toc.vnode.children = tocChildren(toc.node, renderedHeadings, mode);
    // W-430: with no headings the public page had an empty "Table of contents" navigation
    // landmark (or just its title). It's left as a plain empty box instead.
    if (mode !== "editor" && renderedHeadings.length === 0) {
      toc.vnode.tag = "div";
      delete toc.vnode.attrs["aria-label"];
      toc.vnode.children = [];
    }
  }
  const baseCss = new Map(Object.entries(ELEMENTS).map(([type, def]) => [type, def.baseCss]));
  const css = generateCss({
    design,
    usedTypes,
    baseCss,
    localRules,
    previewStates: mode === "editor",
    backgroundVideo,
    ...(mode === "editor" && opts.previewDevice ? { previewDevice: opts.previewDevice } : {}),
  });
  const scope = opts.scope === undefined ? undefined : cssScopeToken(opts.scope);
  const vnode = scope
    ? { tag: "div", attrs: { class: scopeClassName(scope) }, children: [page] }
    : page;
  const html = serialize(vnode);
  return {
    vnode,
    html,
    css: (scope ? scopeWrapperCss() + scopeCss(css, scope) : css) + printCss(),
    needsFormsRuntime: rendered.form || layoutHasForm(layout),
    needsTabsRuntime: rendered.tabs || layoutHasTabs(layout),
    needsMenuRuntime: rendered.menuDropdown || layoutHasMenuDropdown(layout),
    ...(design.direction ? { dir: design.direction } : {}),
    warnings,
  };
}

function treeHasType(node: LayoutNode, type: string): boolean {
  return someNode(node, (current) => current.type === type);
}

/**
 * The page's own heading nodes (not synced section or loop item contents). W-512: not those
 * inside an element hidden on every device, which never show, so a contents link has nothing
 * to jump to (W-409 covered only the heading's own visibility).
 */
function headingAnchors(root: LayoutNode): { node: LayoutNode; hiddenOn: PopupDevice[] }[] {
  const out: { node: LayoutNode; hiddenOn: PopupDevice[] }[] = [];
  const walk = (node: LayoutNode, inherited: PopupDevice[]) => {
    if (node !== root && HIDDEN_DEVICES.every((device) => node.hiddenOn?.includes(device))) return;
    const own = node === root ? [] : (node.hiddenOn ?? []);
    const hiddenOn = HIDDEN_DEVICES.filter((d) => inherited.includes(d) || own.includes(d));
    if (hiddenOn.length === HIDDEN_DEVICES.length) return;
    if (node.type === "heading") out.push({ node, hiddenOn });
    for (const child of nodeChildren(node)) walk(child, hiddenOn);
  };
  walk(root, []);
  return out;
}

const HIDDEN_DEVICES = ["desktop", "tablet", "mobile"] as const;

/** Columns set by custom tracks or a count, or undefined when neither is set. */
const columnCount = (tracks: unknown, columns: unknown): number | undefined =>
  Array.isArray(tracks) && tracks.length > 0
    ? tracks.length
    : Number.isInteger(columns) && (columns as number) >= 1
      ? (columns as number)
      : undefined;

/** A grid's column count on desktop, tablet and mobile; unset follows the next wider device. */
function gridColumnCounts(grid: LayoutNode): [number, number, number] {
  const props = grid.props as Record<string, unknown>;
  const desktop = columnCount(props["columnTracks"], props["columns"]) ?? 1;
  const tablet = columnCount(props["columnTracksTablet"], props["columnsTablet"]) ?? desktop;
  const mobile = columnCount(props["columnTracksMobile"], props["columnsMobile"]) ?? tablet;
  return [desktop, tablet, mobile];
}

/**
 * W-799: a span wider than the grid, or a start line past it, made the browser add columns, so on
 * a phone grid of 1 column a "span 3" child squeezed its siblings to a few pixels. The span is
 * capped at the count and a start line that no longer fits is dropped.
 */
function fitGridColumn(
  start: unknown,
  span: unknown,
  count: number,
): { value?: string; changed: boolean } {
  const across =
    Number.isInteger(span) && (span as number) >= 1 && (span as number) <= 12
      ? (span as number)
      : undefined;
  const line =
    Number.isInteger(start) && (start as number) >= 1 && (start as number) <= 13
      ? (start as number)
      : undefined;
  const width = Math.min(across ?? 1, count);
  const fits = line !== undefined && line + width - 1 <= count ? line : undefined;
  const changed = width !== (across ?? 1) || fits !== line;
  const value =
    fits !== undefined
      ? across !== undefined
        ? `${fits} / span ${width}`
        : String(fits)
      : across !== undefined
        ? `span ${width}`
        : undefined;
  return { value, changed };
}

function tocChildren(
  node: LayoutNode,
  items: { id: string; text: string; tocClass?: string }[],
  mode: RenderMode,
): (VNode | string)[] {
  const title =
    node.type === "toc"
      ? String((node.props as { title?: unknown }).title ?? "").trim() || undefined
      : undefined;
  const children: (VNode | string)[] = [];
  if (title) children.push({ tag: "p", attrs: { class: "emvb-toc-title" }, children: [title] });
  if (items.length === 0) {
    if (mode === "editor") {
      children.push({
        tag: "p",
        attrs: {},
        children: ["Headings on this page appear here."],
      });
    }
    return children;
  }
  children.push({
    tag: "ol",
    attrs: {},
    children: items.map((item): VNode => ({
      tag: "li",
      attrs: item.tocClass ? { class: item.tocClass } : {},
      children: [{ tag: "a", attrs: { href: `#${item.id}` }, children: [item.text] }],
    })),
  });
  return children;
}
