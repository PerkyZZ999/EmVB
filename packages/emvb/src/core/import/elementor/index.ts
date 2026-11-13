/**
 * Elementor import (W-945, D-069): Elementor JSON (`_elementor_data`, a template export or one
 * copied element) → an EmVB layout and a report. Pure and synchronous; the editor passes its
 * icon sets in. The result is always a layout EmVB accepts: anything that fails validation is
 * pruned (and reported) instead of failing the import.
 */
import { LAYOUT_SCHEMA_VERSION, type Layout, type LayoutNode } from "../../schema/layout.ts";
import { nodeChildren } from "../../tree-ops.ts";
import type { ThemePartType } from "../../theme/part-types.ts";
import { nestingIssues } from "../../nesting.ts";
import { validateLayout } from "../../validate.ts";
import { atomicElement } from "./atomic.ts";
import { readSnapshots } from "./snapshots.ts";
import { customCss, wordRules } from "./css.ts";
import { type CounterItem, counterItems, counterOf } from "./counter-steps.ts";
import { ImportContext, type ImportNote, type ImportOptions, type StyleClass } from "./context.ts";
import {
  boxReader,
  deviceStyles,
  entrance,
  flexReader,
  type Device,
  hiddenOn,
  mergeStyles,
  type Style,
  wideHidden,
  widthReader,
} from "./style.ts";
import { isRecord, num, type Settings, slider, str } from "./values.ts";
import {
  box,
  dynamicTag,
  type Env,
  genericWidget,
  href,
  type N,
  node,
  unwrap,
  WIDGETS,
} from "./widgets.ts";

export type { ImportNote, ImportOptions } from "./context.ts";

/** Pasted or uploaded JSON larger than this is refused before parsing. */
export const MAX_IMPORT_CHARS = 8 * 1024 * 1024;
/** Elementor elements read per import; the rest is reported as left out. */
export const MAX_IMPORT_ELEMENTS = 5000;
/** Elementor nesting deeper than this is left out (EmVB allows 24 levels; wrappers add some). */
const MAX_WALK_DEPTH = 16;

export type ElementorImport =
  | {
      ok: true;
      layout: Layout;
      /** The template's title, when the export has one. */
      title?: string;
      /** The theme-part type an Elementor theme-builder template maps to. */
      partType?: ThemePartType;
      /** Elementor elements read, and how many produced EmVB elements. */
      elements: number;
      mapped: number;
      notes: ImportNote[];
      /** Font families the page uses; the site must load them. */
      fonts: string[];
      /**
       * W-951: SVG files the export points to whose markup wasn't given; with it (`svg` option)
       * they import as recolourable icons, without it as images.
       */
      svgFiles: string[];
      /** W-958: WordPress page ids the page links to (their address comes from `pageLink`). */
      pageLinks: number[];
      /** W-958: images on the old site the page uses (`media` gives their library copies). */
      images: string[];
      /** W-958: with `classes`, the EmVB classes the page's elements point at, to add to the site. */
      classes: StyleClass[];
    }
  | { ok: false; error: string };

const PART_TYPES: Record<string, ThemePartType> = {
  header: "header",
  footer: "footer",
  popup: "popup",
  single: "single_post",
  "single-post": "single_post",
  "single-page": "single_page",
  archive: "archive",
  "search-results": "search_results",
  "error-404": "error_404",
  "loop-item": "loop_item",
};

type Source = {
  elements: unknown[];
  title?: string;
  type?: string;
  pageSettings?: Settings;
  /** The export's own record: Elementor 4 exports carry `global_classes` and `global_variables`. */
  record?: Settings;
};

/** Finds the Elementor elements in what the person pasted or uploaded. */
function readSource(input: unknown): Source | { error: string } {
  let value = input;
  if (typeof value === "string") {
    if (value.length > MAX_IMPORT_CHARS)
      return { error: "This file is larger than 8 MB. Export one page or template at a time." };
    const text = value.trim();
    if (text.startsWith("<"))
      return {
        error:
          "This looks like a WordPress XML export. Export the page from Elementor as a template (JSON) instead.",
      };
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      return {
        error:
          "This isn't valid JSON. Paste an Elementor template export or the page's _elementor_data.",
      };
    }
  }
  for (let unwrapDepth = 0; unwrapDepth < 3; unwrapDepth++) {
    if (Array.isArray(value)) return { elements: value };
    if (!isRecord(value)) break;
    if (
      isRecord(value["settings"]) &&
      ("system_colors" in value["settings"] || "custom_colors" in value["settings"])
    ) {
      return {
        error:
          "This is a site kit (site-settings.json). Add it under Site kit, and paste a page or template here.",
      };
    }
    if (Array.isArray(value["content"])) {
      return {
        elements: value["content"],
        record: value,
        ...titleOf(value["title"]),
        ...(str(value["type"]) ? { type: str(value["type"]) } : {}),
        ...(isRecord(value["page_settings"]) ? { pageSettings: value["page_settings"] } : {}),
      };
    }
    if (typeof value["elType"] === "string") return { elements: [value] };
    if (Array.isArray(value["elements"]) && value["type"] === "elementor")
      return { elements: value["elements"] };
    const nested = value["_elementor_data"] ?? value["content"];
    if (typeof nested === "string" && nested.length <= MAX_IMPORT_CHARS) {
      try {
        value = JSON.parse(nested) as unknown;
        continue;
      } catch {
        break;
      }
    }
    if (Array.isArray(nested)) return { elements: nested };
    break;
  }
  return {
    error:
      "No Elementor content was found. Paste an Elementor template export (.json) or the page's _elementor_data.",
  };
}

const titleOf = (value: unknown): { title?: string } => {
  const title = str(value)?.trim().slice(0, 200);
  return title ? { title } : {};
};

const ACRONYMS = new Set(["html", "css", "cta", "toc", "wp", "faq"]);

const label = (type: string) =>
  type
    .replace(/^e-/, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
    .slice(0, 60) || "Element";

const isValidHtmlId = (id: string) => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id);

class Walker {
  constructor(readonly ctx: ImportContext) {}

  readonly walk = (elements: unknown, env: Env): N[] => {
    const list = Array.isArray(elements) ? elements : [];
    const out: N[] = [];
    const labels = (id: string) => this.ctx.atomic.classes.get(id)?.label;
    for (let i = 0; i < list.length; i++) {
      // W-961: consecutive paragraphs numbered by a CSS counter become one numbered List.
      const item = counterOf(list[i], this.ctx.counterItems, labels);
      if (item) {
        let end = i;
        while (
          end + 1 < list.length &&
          counterOf(list[end + 1], this.ctx.counterItems, labels)?.counter === item.counter
        )
          end++;
        out.push(...this.counterList(list.slice(i, end + 1), item, env));
        i = end;
        continue;
      }
      out.push(...this.element(list[i], env));
    }
    return out;
  };

  /** W-961: the steps as one numbered List with the first step's style, or as they were. */
  private counterList(run: readonly unknown[], item: CounterItem, env: Env): N[] {
    const parts = run.flatMap((raw) => this.element(raw, env));
    const texts = parts.map((part) =>
      isRecord(part["props"]) ? part["props"]["text"] : undefined,
    );
    if (parts.length === 0 || parts.length > 200 || !texts.every((t) => typeof t === "string"))
      return parts;
    const first = parts[0] as N;
    const list = node(this.ctx, "list", {
      items: texts as string[],
      ordered: true,
      ...(item.marker === "decimal" ? {} : { marker: item.marker }),
    });
    for (const key of ["style", "devices", "states", "hiddenOn", "classes"] as const) {
      if (first[key] !== undefined) list[key] = first[key];
    }
    list["editorLabel"] = "Numbered steps";
    this.ctx.note(
      "approximated",
      "Numbered steps",
      "Paragraphs numbered by your site's CSS (a counter) became one numbered List; check its spacing.",
    );
    return [list];
  }

  element(raw: unknown, env: Env): N[] {
    const ctx = this.ctx;
    if (!isRecord(raw)) return [];
    ctx.elements++;
    if (ctx.elements > MAX_IMPORT_ELEMENTS || ctx.overBudget) {
      ctx.note(
        "skipped",
        "Page",
        "The page is larger than EmVB imports at once; the rest was left out. Import its sections separately.",
      );
      return [];
    }
    if (env.depth > MAX_WALK_DEPTH) {
      ctx.note("skipped", "Page", "Elements nested deeper than EmVB allows were left out.");
      return [];
    }
    const s = isRecord(raw["settings"]) ? raw["settings"] : {};
    const elType = str(raw["elType"]) ?? "";
    let nodes: N[];
    let name: string;
    const atomicType = elType === "widget" ? (str(raw["widgetType"]) ?? "") : elType;
    const atomic = atomicType.startsWith("e-")
      ? atomicElement(raw, ctx, ctx.atomic, env)
      : undefined;
    if (atomic) {
      if (atomic.length === 0) return [];
      ctx.mapped++;
      return atomic;
    }
    if (elType === "widget") {
      const type = str(raw["widgetType"]) ?? "";
      name = label(type);
      nodes = this.widget(type, s, raw, env, name);
    } else if (elType === "section") {
      name = "Section";
      nodes = this.section(raw, s, env);
    } else if (elType === "column") {
      name = "Column";
      nodes = this.column(raw, s, env, 10);
    } else if (elType === "container") {
      name = "Container";
      nodes = this.container(raw, s, env);
    } else if (elType.startsWith("e-")) {
      name = label(elType);
      nodes = this.widget(elType, s, raw, env, name);
    } else {
      name = label(elType || "element");
      ctx.note(
        "unmapped",
        name,
        `Element type "${elType.slice(0, 40)}" isn't known; its children were kept.`,
      );
      nodes = this.walk(raw["elements"], env);
    }
    if (nodes.length === 0) return [];
    ctx.mapped++;
    const widget = elType === "widget" || elType.startsWith("e-");
    return this.common(nodes, s, name, widget);
  }

  /** Motion, visibility, id, classes and custom CSS: shared by every element type. */
  private common(nodes: N[], s: Settings, name: string, isWidget: boolean): N[] {
    const ctx = this.ctx;
    let [target] = nodes;
    if (isWidget) {
      const adv = deviceStyles(s, ctx, name, [
        boxReader("_"),
        widthReader("_element_custom_width"),
      ]);
      const own = (nodes.length === 1 ? (target?.["style"] as Style | undefined) : undefined) ?? {};
      const overlaps = adv.style ? Object.keys(adv.style).some((key) => key in own) : false;
      const single = nodes.length === 1 && !overlaps && !(adv.devices && target?.["devices"]);
      if (single && target) {
        if (adv.style) target["style"] = { ...own, ...adv.style };
        if (adv.devices) target["devices"] = adv.devices;
      } else if (adv.style || adv.devices || nodes.length > 1) {
        target = box(ctx, nodes, adv.style ?? {});
        if (adv.devices) target["devices"] = adv.devices;
        nodes = [target];
      }
    }
    if (nodes.length !== 1 || !target) return nodes;
    const motion = entrance(s, ctx, name);
    if (motion) {
      const style = { ...(target["style"] as Style | undefined) };
      style["motion"] = { ...(style["motion"] as Style | undefined), entrance: motion };
      target["style"] = style;
    }
    const hidden = hiddenOn(s);
    if (hidden) target["hiddenOn"] = hidden;
    const wide = wideHidden(s);
    if (wide !== undefined) {
      const style = { ...(target["style"] as Style | undefined) };
      style["wide"] = { ...(style["wide"] as Style | undefined), hidden: wide };
      target["style"] = style;
    }
    const id = str(s["_element_id"]) ?? str(s["css_id"]);
    if (id) {
      if (isValidHtmlId(id) && !ctx.htmlIds.has(id) && !target["htmlId"]) {
        ctx.htmlIds.add(id);
        target["htmlId"] = id;
      } else {
        ctx.note(
          "skipped",
          name,
          `The CSS id "${id.slice(0, 40)}" was left out (not a valid or unique id).`,
        );
      }
    }
    if (str(s["_css_classes"]) || str(s["css_classes"])) {
      ctx.note(
        "skipped",
        "CSS classes",
        "Elementor CSS classes weren't imported; EmVB classes are made in the editor.",
      );
    }
    const css = str(s["custom_css"]);
    if (css?.trim()) {
      const style = { ...(target["style"] as Style | undefined), ...customCss(css, ctx, name) };
      if (Object.keys(style).length > 0) target["style"] = style;
    }
    if (
      str(s["hover_animation"]) ||
      str(s["_hover_animation"]) ||
      str(s["button_hover_animation"])
    ) {
      ctx.note("approximated", name, "Hover animations aren't imported.");
    }
    // W-954: Elementor 3 flex child settings (`_flex_size`, `_flex_align_self`, `_flex_order`).
    const flexItem = v3FlexItem(s);
    if (flexItem) target["style"] = { ...(target["style"] as Style | undefined), ...flexItem };
    // W-953: Elementor 3 transforms (`_transform_*_effect`, and `_hover` for the hover state).
    const transform = v3Transform(s, "");
    const hoverTransform = v3Transform(s, "_hover");
    if (transform) target["style"] = { ...(target["style"] as Style | undefined), transform };
    if (hoverTransform) {
      const states = { ...(target["states"] as Record<string, Style> | undefined) };
      states["hover"] = { ...states["hover"], transform: hoverTransform };
      target["states"] = states;
    }
    if (s["motion_fx_motion_fx_scrolling"] === "yes" || s["motion_fx_motion_fx_mouse"] === "yes") {
      ctx.note(
        "approximated",
        name,
        "Scrolling and mouse motion effects weren't imported; add scroll motion in the editor.",
      );
    }
    if (s["sticky"] && s["sticky"] !== "")
      ctx.note("approximated", name, "Sticky positioning wasn't imported.");
    return nodes;
  }

  private widget(type: string, s: Settings, raw: Settings, env: Env, name: string): N[] {
    const ctx = this.ctx;
    const map = WIDGETS[type];
    if (type.startsWith("wp-widget-")) {
      ctx.note("skipped", name, "WordPress widgets weren't imported.");
      return [];
    }
    const nodes = map ? map(s, ctx, name, env, raw) : genericWidget(type, unwrapAll(s), ctx, name);
    const dynamic = s["__dynamic__"];
    if (isRecord(dynamic)) {
      for (const key of Object.keys(dynamic).slice(0, 50)) {
        const tag = dynamicTag(s, key);
        const handled =
          (key === "title" &&
            (tag === "post-title" || tag === "archive-title" || tag === "page-title") &&
            type === "heading") ||
          (key === "image" && tag === "post-featured-image" && type === "image");
        if (!handled && tag)
          ctx.note("approximated", name, `Dynamic tag "${tag}" kept its fixed fallback value.`);
      }
    }
    return nodes;
  }

  /** Legacy Section → a full-width band with a row of columns, `content_width` wide when boxed. */
  private section(raw: Settings, s: Settings, env: Env): N[] {
    const ctx = this.ctx;
    const GAPS: Record<string, number> = {
      no: 0,
      narrow: 5,
      default: 10,
      extended: 15,
      wide: 20,
      wider: 30,
    };
    const gapSetting = str(s["gap"]) ?? "default";
    const gap =
      gapSetting === "custom"
        ? (slider(s["gap_columns_custom"])?.value ?? 10)
        : (GAPS[gapSetting] ?? 10);
    const boxed = str(s["layout"]) !== "full_width";
    const width = slider(s["content_width"]) ?? { value: 1140, unit: "px" as const };
    const columns = (Array.isArray(raw["elements"]) ? raw["elements"] : []).flatMap((c) =>
      isRecord(c) && c["elType"] === "column"
        ? this.counted(
            c,
            () =>
              this.column(
                c,
                isRecord(c["settings"]) ? c["settings"] : {},
                { ...env, parentRow: true, depth: env.depth + 2 },
                gap,
              ),
            env,
          )
        : this.element(c, { ...env, parentRow: true, depth: env.depth + 2 }),
    );
    const positions: Record<string, string> = {
      top: "flex-start",
      middle: "center",
      bottom: "flex-end",
    };
    const rowStyle: Style = {
      flexDirection: "row",
      gap: { value: 0, unit: "px" },
      width: { value: 100, unit: "%" },
      alignItems: positions[str(s["content_position"]) ?? ""] ?? "stretch",
      ...(boxed ? { maxWidth: width, marginLeft: "auto", marginRight: "auto" } : {}),
    };
    const row = box(ctx, columns, rowStyle);
    row["devices"] = {
      mobile: {
        flexDirection:
          str(s["reverse_order_mobile"]) === "reverse-mobile" ? "column-reverse" : "column",
      },
    };
    const ds = deviceStyles(s, ctx, "Section", [
      boxReader(""),
      (x, d) => {
        const out: Style = {};
        const height = str(x[`height${d}`]);
        if (height === "full") out["minHeight"] = { value: 100, unit: "vh" };
        else if (height === "min-height") {
          const min = slider(x[`custom_height${d}`]);
          if (min) out["minHeight"] = min;
        }
        return out;
      },
    ]);
    const style: Style = { gap: { value: 0, unit: "px" }, ...ds.style };
    if (style["minHeight"])
      style["justifyContent"] = positions[str(s["column_position"]) ?? "middle"] ?? "center";
    const tag = str(s["html_tag"]);
    const outer = node(
      ctx,
      "container",
      tag && ["section", "header", "footer", "main", "article", "aside", "nav", "div"].includes(tag)
        ? { tag }
        : { tag: "section" },
      {
        style,
        children: [row],
        editorLabel: "Section",
      },
    );
    if (ds.devices) outer["devices"] = ds.devices;
    return [outer];
  }

  /** Runs `build` as one counted element (for columns built directly by their section). */
  private counted(c: Settings, build: () => N[], env: Env): N[] {
    void env;
    this.ctx.elements++;
    const nodes = build();
    if (nodes.length > 0) this.ctx.mapped++;
    return this.common(nodes, isRecord(c["settings"]) ? c["settings"] : {}, "Column", false);
  }

  /** Legacy Column: its width in %, its widgets in a column with 20px between them. */
  private column(raw: Settings, s: Settings, env: Env, gap: number): N[] {
    const ctx = this.ctx;
    const size = num(s["_inline_size"]) ?? num(s["_column_size"]) ?? 100;
    const children = this.walk(raw["elements"], { ...env, parentRow: false, depth: env.depth + 1 });
    const positions: Record<string, string> = {
      top: "flex-start",
      center: "center",
      bottom: "flex-end",
    };
    const ds = deviceStyles(s, ctx, "Column", [
      boxReader(""),
      (x, d) => {
        const out: Style = {};
        const inline = num(x[`_inline_size${d}`]);
        if (d === "") out["width"] = { value: Math.min(100, Math.max(1, size)), unit: "%" };
        else if (inline !== undefined)
          out["width"] = { value: Math.min(100, Math.max(1, inline)), unit: "%" };
        else if (d === "_mobile") out["width"] = { value: 100, unit: "%" };
        return out;
      },
    ]);
    const style: Style = { gap: { value: 20, unit: "px" }, ...ds.style };
    if (!["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].some((k) => k in style)) {
      for (const side of ["Top", "Right", "Bottom", "Left"])
        style[`padding${side}`] = { value: gap, unit: "px" };
    }
    const position = positions[str(s["content_position"]) ?? ""];
    if (position) style["justifyContent"] = position;
    const n = node(ctx, "container", {}, { style, children, editorLabel: "Column" });
    if (ds.devices) n["devices"] = ds.devices;
    return [n];
  }

  /** Flexbox or Grid Container; a boxed one is a full-width box around a centred inner box. */
  private container(raw: Settings, s: Settings, env: Env): N[] {
    const ctx = this.ctx;
    const grid = str(s["container_type"]) === "grid";
    const boxed = (str(s["content_width"]) ?? "boxed") === "boxed";
    const outerDs = deviceStyles(s, ctx, "Container", [boxReader(""), widthReader("width")]);
    const layoutDs = grid
      ? deviceStyles(s, ctx, "Container", [gridReader])
      : deviceStyles(s, ctx, "Container", [flexReader]);
    const outerStyle: Style = { ...outerDs.style };
    if (
      !["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].some((k) => k in outerStyle)
    ) {
      for (const side of ["Top", "Right", "Bottom", "Left"])
        outerStyle[`padding${side}`] = { value: 10, unit: "px" };
    }
    if (env.parentRow && !("width" in outerStyle)) outerStyle["width"] = { value: 100, unit: "%" };
    const innerStyle: Style = { ...layoutDs.style };
    const row =
      !grid &&
      (innerStyle["flexDirection"] === "row" || innerStyle["flexDirection"] === "row-reverse");
    const children = this.walk(raw["elements"], {
      ...env,
      parentRow: row,
      depth: env.depth + (boxed ? 2 : 1),
    });
    const tag = str(s["html_tag"]);
    const props: Record<string, unknown> = {
      ...(tag &&
      ["section", "header", "footer", "main", "article", "aside", "nav", "div"].includes(tag)
        ? { tag }
        : {}),
      ...(str(s["html_tag"]) === "a" ? href(s["link"], ctx) : {}),
    };
    if (tag && !props["tag"] && tag !== "a")
      ctx.note("approximated", "Container", `HTML tag "${tag.slice(0, 20)}" is shown as a div.`);
    const columns = grid ? gridColumns(s) : undefined;
    const layoutDevices = layoutDs.devices;

    if (!boxed) {
      const style = mergeStyles(outerStyle, innerStyle);
      const n = grid
        ? node(
            ctx,
            "grid",
            { ...gridProps(columns), ...(props["href"] ? { href: props["href"] } : {}) },
            { style, children },
          )
        : node(ctx, "container", props, { style, children });
      const devices = mergeDevices(outerDs.devices, layoutDevices);
      if (devices) n["devices"] = devices;
      return [n];
    }
    const boxedWidth = slider(s["boxed_width"]) ?? { value: 1140, unit: "px" as const };
    const minHeight = innerStyle["minHeight"];
    delete innerStyle["minHeight"];
    // W-959: and its Wide screen min height, like the other devices' below.
    const innerWide = innerStyle["wide"] as Style | undefined;
    if (innerWide && "minHeight" in innerWide) {
      const { minHeight: wideMin, ...rest } = innerWide;
      outerStyle["wide"] = { ...(outerStyle["wide"] as Style | undefined), minHeight: wideMin };
      if (Object.keys(rest).length > 0) innerStyle["wide"] = rest;
      else delete innerStyle["wide"];
    }
    const inner = grid
      ? node(ctx, "grid", gridProps(columns), {
          style: {
            ...innerStyle,
            width: { value: 100, unit: "%" },
            maxWidth: boxedWidth,
            marginLeft: "auto",
            marginRight: "auto",
          },
          children,
        })
      : node(
          ctx,
          "container",
          {},
          {
            style: {
              ...innerStyle,
              width: { value: 100, unit: "%" },
              maxWidth: boxedWidth,
              marginLeft: "auto",
              marginRight: "auto",
            },
            children,
          },
        );
    // Min height belongs to the outer box on every device, as on desktop.
    const outerDevices = { ...outerDs.devices };
    const innerDevices: { laptop?: Style; tablet?: Style; mobile?: Style } = {};
    // W-956: Laptop's layout values (direction, gap) go to the inner box too; they were dropped.
    for (const key of ["laptop", "tablet", "mobile"] as const) {
      const layout = layoutDevices?.[key];
      if (!layout) continue;
      const { minHeight: deviceMin, ...rest } = layout;
      if (deviceMin !== undefined)
        outerDevices[key] = { ...outerDevices[key], minHeight: deviceMin };
      if (Object.keys(rest).length > 0) innerDevices[key] = rest;
    }
    if (Object.keys(innerDevices).length > 0) inner["devices"] = innerDevices;
    const outer = node(ctx, "container", props, {
      style: {
        ...outerStyle,
        gap: { value: 0, unit: "px" },
        ...(minHeight ? { minHeight } : {}),
        // The inner box sits where the container's content would: centred when Elementor centres it.
        ...(minHeight ? { justifyContent: verticalOf(innerStyle, grid) } : {}),
      },
      children: [inner],
    });
    if (Object.keys(outerDevices).length > 0) outer["devices"] = outerDevices;
    return [outer];
  }
}

/** Grid props: three columns and one on phones unless the container says otherwise. */
const gridProps = (cols: Record<string, number> | undefined): Record<string, unknown> => ({
  columns: cols?.["d"] ?? 3,
  ...(cols?.["t"] ? { columnsTablet: cols["t"] } : {}),
  ...(cols?.["m"] ? { columnsMobile: cols["m"] } : { columnsMobile: 1 }),
});

/** Elementor 3 flex child settings → EmVB flex item keys. */
function v3FlexItem(s: Settings): Style | undefined {
  const out: Style = {};
  const sizeMode = str(s["_flex_size"]);
  if (sizeMode === "grow") out["flexGrow"] = 1;
  else if (sizeMode === "shrink") out["flexShrink"] = 1;
  else if (sizeMode === "none") {
    out["flexGrow"] = 0;
    out["flexShrink"] = 0;
  } else if (sizeMode === "custom") {
    const grow = num(s["_flex_grow"]);
    const shrink = num(s["_flex_shrink"]);
    if (grow !== undefined && grow >= 0 && grow <= 100) out["flexGrow"] = grow;
    if (shrink !== undefined && shrink >= 0 && shrink <= 100) out["flexShrink"] = shrink;
  }
  const align = str(s["_flex_align_self"]);
  const alignMap: Record<string, string> = {
    "flex-start": "flex-start",
    start: "flex-start",
    center: "center",
    "flex-end": "flex-end",
    end: "flex-end",
    stretch: "stretch",
  };
  if (align && alignMap[align]) out["alignSelf"] = alignMap[align];
  const order = str(s["_flex_order"]);
  if (order === "start") out["order"] = -99;
  else if (order === "end") out["order"] = 99;
  else if (order === "custom") {
    const n = num(s["_flex_order_custom"]);
    if (n !== undefined && Number.isInteger(n)) out["order"] = Math.min(99, Math.max(-99, n));
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Elementor 3 transform settings (`_transform_translateX_effect` …) for a state suffix. */
function v3Transform(s: Settings, state: "" | "_hover"): Record<string, number> | undefined {
  const sizeOf = (key: string) => {
    const value = s[`_transform_${key}_effect${state}`];
    return num(isRecord(value) ? value["size"] : value);
  };
  const out: Record<string, number> = {};
  const x = sizeOf("translateX");
  const y = sizeOf("translateY");
  const scale = sizeOf("scale");
  const rotate = sizeOf("rotateZ");
  if (x !== undefined && x !== 0) out["x"] = Math.round(Math.min(2000, Math.max(-2000, x)));
  if (y !== undefined && y !== 0) out["y"] = Math.round(Math.min(2000, Math.max(-2000, y)));
  if (scale !== undefined && scale !== 1)
    out["scale"] = Math.round(Math.min(4, Math.max(0.1, scale)) * 100);
  if (rotate !== undefined && rotate !== 0)
    out["rotate"] = Math.round(Math.min(360, Math.max(-360, rotate)));
  return Object.keys(out).length > 0 ? out : undefined;
}

function verticalOf(style: Style, grid: boolean): string {
  if (grid) return "flex-start";
  const column = style["flexDirection"] === "column" || style["flexDirection"] === "column-reverse";
  const value = column ? style["justifyContent"] : style["alignItems"];
  return value === "center" || value === "flex-end" ? (value as string) : "flex-start";
}

/** Grid gaps and minimum height per device (column counts are props, see gridColumns). */
const gridReader = (s: Settings, d: Device): Style => {
  const style: Style = {};
  const gaps = s[`grid_gaps${d}`];
  const gap = isRecord(gaps)
    ? slider({ size: gaps["column"] ?? gaps["size"], unit: gaps["unit"] })
    : undefined;
  if (gap) style["gap"] = gap;
  else if (d === "") style["gap"] = { value: 20, unit: "px" };
  const min = slider(s[`min_height${d}`]);
  if (min) style["minHeight"] = min;
  return style;
};

function mergeDevices(
  a?: { laptop?: Style; tablet?: Style; mobile?: Style },
  b?: { laptop?: Style; tablet?: Style; mobile?: Style },
) {
  if (!a && !b) return undefined;
  const out: { laptop?: Style; tablet?: Style; mobile?: Style } = {};
  for (const key of ["laptop", "tablet", "mobile"] as const) {
    const merged = { ...a?.[key], ...b?.[key] };
    if (Object.keys(merged).length > 0) out[key] = merged;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Grid column counts per device (`d`, `t`, `m`). */
function gridColumns(s: Settings): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [d, k] of [
    ["", "d"],
    ["_tablet", "t"],
    ["_mobile", "m"],
  ] as const) {
    const cols = s[`grid_columns_grid${d}`];
    const count = num(isRecord(cols) ? cols["size"] : cols);
    if (count !== undefined) out[k] = Math.min(12, Math.max(1, Math.round(count)));
  }
  return out;
}

function unwrapAll(s: Settings): Settings {
  const out: Settings = {};
  for (const [key, value] of Object.entries(s)) out[key] = unwrap(value);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Validation: prune what EmVB refuses, never fail the import for one bad value

type Found = { node: N; parent?: N; rest: string[] };

function locate(root: N, path: string): Found | undefined {
  if (!path.startsWith("root")) return undefined;
  const tokens = path
    .slice(4)
    .split(/\.|\[|\]/)
    .filter(Boolean);
  let current: N = root;
  let parent: N | undefined;
  let i = 0;
  while (i < tokens.length && tokens[i] === "children") {
    const kids = current["children"];
    const index = Number(tokens[i + 1]);
    if (!Array.isArray(kids) || !Number.isInteger(index) || !kids[index]) break;
    parent = current;
    current = kids[index] as N;
    i += 2;
  }
  return { node: current, ...(parent ? { parent } : {}), rest: tokens.slice(i) };
}

function prune(
  root: N,
  issue: { path: string; code: string; message: string },
  ctx: ImportContext,
  tried: Set<string>,
): boolean {
  if (issue.code === "too_large" || issue.code === "too_many_nodes") {
    const kids = root["children"] as N[];
    if (kids.length <= 1) return false;
    kids.pop();
    ctx.note(
      "skipped",
      "Page",
      "The page was larger than EmVB allows; its last sections were left out. Import them separately.",
    );
    return true;
  }
  const found = locate(root, issue.path);
  if (!found) return false;
  const { node: target, parent, rest } = found;
  const [head, k1, k2] = rest;
  if (
    head === "style" ||
    head === "states" ||
    head === "devices" ||
    head === "htmlId" ||
    head === "query" ||
    head === "hiddenOn"
  ) {
    const holder = target[head];
    if (head === "style" && k1 && isRecord(holder)) delete holder[k1];
    else if (
      (head === "states" || head === "devices") &&
      k1 &&
      k2 &&
      isRecord(holder) &&
      isRecord(holder[k1])
    )
      delete (holder[k1] as Settings)[k2];
    else delete target[head];
    ctx.note("approximated", "Styles", "Some style values EmVB can't use were left out.");
    return true;
  }
  if (head === "props" && k1 && !tried.has(`${target.id}.${k1}`)) {
    tried.add(`${target.id}.${k1}`);
    delete target.props[k1];
    return true;
  }
  if (!parent) return false;
  const kids = parent["children"] as N[];
  parent["children"] = kids.filter((kid) => kid !== target);
  ctx.note(
    "skipped",
    "Elements",
    `An element EmVB couldn't use was left out (${issue.message.slice(0, 120)}).`,
  );
  return true;
}

/** Elementor JSON → an EmVB layout and an import report. */
export function importElementor(input: unknown, options: ImportOptions = {}): ElementorImport {
  const source = readSource(input);
  if ("error" in source) return { ok: false, error: source.error };
  if (source.elements.length === 0) return { ok: false, error: "This export has no elements." };
  const ctx = new ImportContext(options);
  if (source.record) readSnapshots(source.record, ctx.atomic);
  if (isRecord(options.kit)) readSnapshots(options.kit, ctx.atomic);
  ctx.findOldSite(JSON.stringify([source.elements, source.pageSettings ?? {}]));
  {
    const kitCustom =
      isRecord(options.kit) && isRecord(options.kit["settings"])
        ? str(options.kit["settings"]["custom_css"])
        : undefined;
    const pageCustom = source.pageSettings ? str(source.pageSettings["custom_css"]) : undefined;
    ctx.wordRules = wordRules(`${kitCustom ?? ""}\n${pageCustom ?? ""}`);
    ctx.counterItems = counterItems(`${kitCustom ?? ""}\n${pageCustom ?? ""}`);
  }
  const walker = new Walker(ctx);
  const children = walker.walk(source.elements, { parentRow: false, depth: 1, walk: walker.walk });
  if (children.length === 0)
    return {
      ok: false,
      error:
        "Nothing in this export could be imported. See the report for what was left out." +
        (ctx.report()[0] ? ` (${ctx.report()[0]?.message})` : ""),
    };
  const page = source.pageSettings ?? {};
  const pageStyle = deviceStyles(page, ctx, "Page", [boxReader("")]);
  const pageCss = str(page["custom_css"]);
  // The kit's custom CSS sets site-wide text defaults on `body` (font, colour): the page root
  // takes them, below the page's own settings.
  const kitSettings =
    isRecord(options.kit) && isRecord(options.kit["settings"])
      ? options.kit["settings"]
      : undefined;
  const kitCss = kitSettings ? str(kitSettings["custom_css"]) : undefined;
  const kitStyle = kitCss ? customCss(kitCss, ctx, "Site kit") : {};
  const root = box(ctx, children, {
    flexDirection: "column",
    ...kitStyle,
    ...pageStyle.style,
    ...(pageCss ? customCss(pageCss, ctx, "Page") : {}),
  });
  if (pageStyle.devices) root["devices"] = pageStyle.devices;
  if (options.media) pointAtCopies(root, ctx);
  const candidate: Record<string, unknown> = { schemaVersion: LAYOUT_SCHEMA_VERSION, root };
  const tried = new Set<string>();
  for (let attempt = 0; attempt < 500; attempt++) {
    const checked = validateLayout(candidate);
    // The save hook also refuses misplaced elements (a field outside a form, …): prune those too.
    const misplaced = checked.ok ? nestingIssues(checked.layout, 1)[0] : undefined;
    if (checked.ok && !misplaced) {
      const partType = source.type ? PART_TYPES[source.type] : undefined;
      return {
        ok: true,
        layout: checked.layout,
        ...(source.title ? { title: source.title } : {}),
        ...(partType ? { partType } : {}),
        elements: ctx.elements,
        mapped: ctx.mapped,
        notes: ctx.report(),
        fonts: [...ctx.fonts].toSorted(),
        svgFiles: [...ctx.svgFiles],
        pageLinks: [...ctx.pageLinks].toSorted((a, b) => a - b),
        images: [...ctx.images],
        classes: usedClasses(checked.layout, ctx).map((cls) =>
          options.media ? (pointAtCopies(structuredClone(cls), ctx) as StyleClass) : cls,
        ),
      };
    }
    const issue = checked.ok ? misplaced : checked.issues[0];
    if (!issue || !prune(root, issue, ctx, tried)) {
      return {
        ok: false,
        error: `The imported page couldn't be made valid: ${issue?.message ?? "unknown problem"}`,
      };
    }
  }
  return { ok: false, error: "The imported page couldn't be made valid." };
}

/**
 * W-958: points every use of an old-site image at its media library copy: image sources (which
 * also get the library id), backgrounds and any other stored address equal to it.
 */
function pointAtCopies(value: unknown, ctx: ImportContext): unknown {
  if (typeof value === "string")
    return /^https?:\/\//i.test(value) ? (ctx.copied(value)?.url ?? value) : value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = pointAtCopies(value[i], ctx);
    return value;
  }
  if (!isRecord(value)) return value;
  const props = value["type"] === "image" && isRecord(value["props"]) ? value["props"] : undefined;
  const copy = props && typeof props["src"] === "string" ? ctx.copied(props["src"]) : undefined;
  for (const [key, inner] of Object.entries(value)) value[key] = pointAtCopies(inner, ctx);
  if (props && copy?.id) props["mediaId"] = copy.id;
  return value;
}

/** W-958: the imported classes still used once the page is valid (pruning can drop elements). */
function usedClasses(layout: Layout, ctx: ImportContext): StyleClass[] {
  const used = new Set<string>();
  const visit = (item: LayoutNode) => {
    for (const id of item.classes ?? []) used.add(id);
    nodeChildren(item).forEach(visit);
  };
  visit(layout.root);
  return [...ctx.imported.values()].flatMap((c) => (c && used.has(c.id) ? [c.cls] : []));
}
