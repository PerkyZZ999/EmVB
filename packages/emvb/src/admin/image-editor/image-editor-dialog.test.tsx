import { afterEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";

/**
 * photocn's hook needs WebGL, which happy-dom lacks, so engine.ts is swapped for a fake editor API
 * (the plan's "panel ↔ params with a mocked editor object"). Calls are recorded.
 */
type Calls = [string, ...unknown[]][];
let calls: Calls = [];
let hookOptions: Record<string, unknown> | undefined;
let plan: { ok: boolean; message?: string } = { ok: true };
let waitForDownload: Promise<void> | undefined;
const zeroAdjust = () => ({
  lights: {
    brightness: 0,
    exposure: 0,
    gamma: 0,
    contrast: 0,
    shadows: 0,
    highlights: 0,
    bloom: 0,
  },
  colors: { temperature: 0, tint: 0, vibrance: 0, saturation: 0, sepia: 0 },
  effects: { clarity: 0, noise: 0, vignette: 0 },
});
const defaultBlur = () => ({
  bokehStrength: 0,
  bokehLensOut: 0.5,
  gaussianStrength: 0,
  gaussianLensOut: 0.5,
  centerX: 0.5,
  centerY: 0.5,
});
const fresh = () => ({
  tool: "adjust",
  canUndo: false,
  canRedo: false,
  edited: false,
  editingCorners: false,
  straighten: 0,
  status: "ready",
  adjust: zeroAdjust() as Record<string, Record<string, number>>,
  filter: null as string | null,
  strength: 1,
  blur: defaultBlur(),
  curves: null as unknown[] | null,
  out: { width: 640, height: 480 },
});
const state = fresh();
const listeners = new Set<() => void>();
let version = 0;
const change = (patch: Partial<typeof state>) => {
  Object.assign(state, patch);
  version++;
  for (const fn of listeners) fn();
};
const record =
  (name: string, then?: (...args: unknown[]) => void) =>
  (...args: unknown[]) => {
    calls.push([name, ...args]);
    then?.(...args);
  };

function fakeApi() {
  const ref = <T,>() => ({ current: null as T | null });
  return {
    status: state.status,
    error: state.status === "error" ? new Error("Broken file") : undefined,
    disabled: false,
    isLoading: false,
    isReady: state.status === "ready",
    hasImage: true,
    imageSrc: "blob:x",
    tool: state.tool,
    setTool: record("setTool", (tool) => change({ tool: tool as string })),
    history: {
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      undo: record("undo"),
      redo: record("redo"),
    },
    compare: { active: false, setActive: record("compare") },
    recipes: {
      current: state.edited ? { version: 1, lights: { exposure: 0.2 } } : null,
      apply: async (recipe: unknown) => {
        calls.push(["applyRecipe", recipe]);
      },
    },
    exportImage: async (options: Record<string, unknown>) => {
      calls.push(["exportImage", options]);
      const width = (options.width as number | undefined) ?? state.out.width;
      const height = (options.height as number | undefined) ?? state.out.height;
      return {
        blob: new Blob(["webp"], { type: "image/webp" }),
        type: "image/webp",
        width,
        height,
        filename: "x",
      };
    },
    download: async (options: unknown) => {
      calls.push(["download", options]);
      await waitForDownload;
      return { blob: new Blob([]), type: "image/png", width: 1, height: 1, filename: "x" };
    },
    resetAll: record("resetAll"),
    commit: record("commit"),
    patch: record("patch", (section, patch) => {
      const opt = (patch as { opt?: { label: string } }).opt;
      if (section === "filters" && opt) change({ filter: opt.label, strength: 1 });
    }),
    adjust: {
      value: state.adjust,
      setLights: record("setLights", (v) =>
        change({ adjust: { ...state.adjust, lights: v as never } }),
      ),
      setColors: record("setColors", (v) =>
        change({ adjust: { ...state.adjust, colors: v as never } }),
      ),
      setEffects: record("setEffects", (v) =>
        change({ adjust: { ...state.adjust, effects: v as never } }),
      ),
      resetSection: record("resetSection"),
      reset: record("resetAdjust"),
    },
    filters: {
      value: { label: state.filter, strength: state.strength },
      presets: ["Aden", "Crema", "Kodak"].map((label) => ({
        label,
        load: async () => ({ label, type: "MTX" }),
      })),
      loading: null,
      select: record("selectFilter", (p) => change({ filter: p === null ? null : String(p) })),
      setStrength: record("setStrength", (v) => change({ strength: v as number })),
      reset: record("resetFilters"),
    },
    blur: {
      value: state.blur,
      set: record("setBlur", (v) => change({ blur: v as never })),
      setCenter: record("setCenter", (c) => change({ blur: { ...state.blur, ...(c as object) } })),
      commitCenter: record("commitCenter"),
      reset: record("resetBlur"),
    },
    curves: {
      value: state.curves,
      histogram: null,
      set: record("setCurves", (v) => change({ curves: v as unknown[] })),
      commit: record("commitCurves"),
      reset: record("resetCurves"),
    },
    histogram: { data: { pixels: 38400 }, canvasRef: ref<HTMLCanvasElement>() },
    engine: {
      imageInput: {
        fileInfo: { name: "01M4X9JVR25AERTZ0000000000.jpg", type: "image/jpeg", size: 52_224 },
        image: { naturalWidth: 640, naturalHeight: 480 },
        blob: null,
      },
      exif: {
        status: "loaded",
        error: null,
        metadata: {
          format: "JPEG",
          tiff: { Make: { value: "Canon" }, Model: { value: "EOS 40D" } },
          exif: { DateTimeOriginal: { hvalue: "2008:05:30 15:56:01" } },
          gps: { GPSLatitude: { hvalue: "43.4675" }, GPSLongitude: { hvalue: "11.8851" } },
        },
      },
    },
    rootRef: fakeApi.rootRef,
    stageRef: ref<HTMLDivElement>(),
    canvasRef: ref<HTMLCanvasElement>(),
    canvasKey: 0,
    geometry: {
      value: {
        straighten: state.straighten,
        perspectiveX: 0,
        perspectiveY: 0,
        aspectRatio: null,
        corners: null,
      },
      isDefault: state.straighten === 0,
      orientedSize: null,
      polygon: null,
      outputSize: state.out,
      crop: { x: 0, y: 0, width: 1, height: 1 },
      bounds: { x: 0, y: 0, width: 1, height: 1 },
      displayRect: { x: 0, y: 0, width: 1, height: 1 },
      view: state.tool === "compose" ? "full" : "crop",
      aspectRatio: "free",
      portrait: false,
      aspectRatioOptions: (hookOptions?.aspectRatioOptions as unknown[]) ?? [
        { value: "free", label: "Freeform" },
        { value: "1:1", label: "Square" },
      ],
      editingCorners: state.editingCorners,
      setEditingCorners: record("setEditingCorners", (on) =>
        change({ editingCorners: Boolean(on) }),
      ),
      setAspectRatio: record("setAspectRatio"),
      toggleOrientation: record("toggleOrientation"),
      rotate: record("rotate"),
      flip: record("flip"),
      setStraighten: record("setStraighten", (v) => change({ straighten: v as number })),
      setPerspective: record("setPerspective"),
      setCrop: record("setCrop"),
      resetCorners: record("resetCorners"),
      commit: record("commit"),
      cancel: record("cancel"),
      done: record("done", () => change({ tool: "adjust" })),
      reset: record("reset"),
    },
  };
}
fakeApi.rootRef = { current: null as HTMLDivElement | null };

const Context = React.createContext<ReturnType<typeof fakeApi> | null>(null);
mock.module(new URL("./engine.ts", import.meta.url).pathname, () => ({
  planEngine: async () =>
    plan.ok ? { ok: true, renderMode: "worker" } : { ok: false, message: plan.message },
  useImageEditorState: (options: Record<string, unknown>) => {
    hookOptions = options;
    React.useSyncExternalStore(
      (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      () => version,
    );
    return fakeApi();
  },
  ImageEditorProvider: ({
    editor,
    children,
  }: {
    editor: ReturnType<typeof fakeApi>;
    children: React.ReactNode;
  }) => <Context.Provider value={editor}>{children}</Context.Provider>,
  useImageEditor: () => React.useContext(Context),
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  aspectRatioOptions: [
    { value: "free", label: "Freeform" },
    { value: "original", label: "Original" },
    { value: "1:1", label: "Square" },
    { value: "3:2", label: "3:2" },
  ],
  drawRgbHistogram: () => undefined,
  fitRectInPolygon: (rect: unknown) => rect,
  rectInsidePolygon: () => true,
}));
const { default: ImageEditorDialog } = await import("./ImageEditorDialog.tsx");

const realFetch = globalThis.fetch;
const serveImage = () => {
  globalThis.fetch = (async () =>
    new Response("img", { headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch;
};
const realWidth = window.innerWidth;

afterEach(async () => {
  globalThis.fetch = realFetch;
  await cleanup();
  calls = [];
  hookOptions = undefined;
  plan = { ok: true };
  waitForDownload = undefined;
  Object.assign(state, fresh());
  Object.defineProperty(window, "innerWidth", { value: realWidth, configurable: true });
});

let openChanges: boolean[] = [];
type OnSave = NonNullable<React.ComponentProps<typeof ImageEditorDialog>["onSave"]>;
const open = async (imageProps: Record<string, unknown>, onSave?: OnSave) => {
  openChanges = [];
  await mount(
    <ImageEditorDialog
      open
      onOpenChange={(next) => openChanges.push(next)}
      imageProps={imageProps}
      {...(onSave ? { onSave } : {})}
    />,
  );
  // The load and the plan each resolve a turn later; settle them one after another.
  await [1, 2, 3, 4, 5].reduce((prev) => prev.then(settle), Promise.resolve());
  const root = document.querySelector<HTMLElement>("[data-emvb-image-editor]");
  if (!root) throw new Error("editor not rendered");
  return root;
};
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const click = async (sel: string) => {
  const el = q<HTMLButtonElement>(sel);
  if (!el) throw new Error(`no ${sel}`);
  el.click();
  await settle();
};

describe("image editor in photocn's layout (W-483)", () => {
  test("opens a library picture with photocn's arrangement: toolbar, canvas, sidebar", async () => {
    serveImage();
    const root = await open({ src: "/_emdash/api/media/file/shop.jpg", alt: "Shop front" });
    expect(root.dataset.emvbImageEditor).toBe("ready");
    expect(root.dataset.emvbRenderMode).toBe("worker");
    expect(root.dataset.layout).toBe("desktop");
    expect(hookOptions?.renderMode).toBe("worker");
    expect(hookOptions?.defaultTool).toBe("adjust");
    expect(q("[data-slot=editor-toolbar] [data-emvb-image-undo]")).not.toBeNull();
    expect(q("[data-slot=editor-sidebar] [data-slot=editor-toolbar]")).not.toBeNull();
    expect(
      q("[data-slot=editor-sidebar] [data-slot=image-editor-histogram]")?.textContent,
    ).toContain("38,400");
    expect(q("[data-emvb-image-editor-file]")?.textContent).toBe("shop.jpg640 × 480 px");
    expect(q("[data-emvb-image-canvas]")?.getAttribute("aria-label")).toBe("shop.jpg");
    expect(q<HTMLButtonElement>("[data-emvb-image-save]")?.disabled).toBe(true);
    expect(q("[data-emvb-image-panel]")?.dataset.emvbImagePanel).toBe("adjust");
  });

  test("the switcher shows every tool as a pressed toggle, and arrows move through it", async () => {
    serveImage();
    await open({ src: "/a.jpg", alt: "A" });
    const tools = [
      ...document.querySelectorAll<HTMLButtonElement>(
        "[data-slot=editor-sidebar] [data-emvb-image-tool]",
      ),
    ];
    expect(tools.map((t) => t.getAttribute("aria-label"))).toEqual([
      "Adjust",
      "Crop",
      "Curves",
      "Effects",
      "Filters",
      "Blender",
      "Blur",
      "Metadata",
    ]);
    expect(tools[0]?.getAttribute("aria-pressed")).toBe("true");
    tools[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await settle();
    expect(q("[data-emvb-image-panel]")?.dataset.emvbImagePanel).toBe("compose");
    tools[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    await settle();
    expect(q("[data-emvb-image-panel]")?.dataset.emvbImagePanel).toBe("metadata");
    // W-680: Alt/Ctrl/Cmd + arrows belong to the browser.
    tools[5]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true, bubbles: true }),
    );
    await settle();
    expect(q("[data-emvb-image-panel]")?.dataset.emvbImagePanel).toBe("metadata");
  });

  test("undo, redo and reset follow the editor's history", async () => {
    serveImage();
    await open({ src: "/a.jpg", alt: "A" });
    expect(q<HTMLButtonElement>("[data-emvb-image-undo]")?.disabled).toBe(true);
    expect(q<HTMLButtonElement>("[data-emvb-image-reset]")?.disabled).toBe(true);
    change({ canUndo: true, edited: true });
    await settle();
    await click("[data-emvb-image-undo]");
    await click("[data-emvb-image-reset]");
    expect(calls.map((c) => c[0])).toEqual(["undo", "resetAll"]);
  });

  test("the crop panel drives photocn's geometry", async () => {
    serveImage();
    await open({ src: "/a.jpg", alt: "A", width: 1200, height: 800 });
    // "Fit this element" sits after Original in photocn's presets.
    expect(
      ((hookOptions?.aspectRatioOptions ?? []) as { value: string }[]).map((o) => o.value),
    ).toEqual(["free", "original", "3:2", "1:1"]);
    await click('[data-slot=editor-sidebar] [data-emvb-image-tool="compose"]');
    expect(q("[data-emvb-image-panel]")?.dataset.emvbImagePanel).toBe("compose");
    await click('[data-emvb-image-rotate="right"]');
    await click('[data-emvb-image-rotate="left"]');
    await click('[data-emvb-image-flip="horizontal"]');
    await click("[data-emvb-image-orientation]");
    const slider = q<HTMLInputElement>('[data-emvb-image-slider="straighten"]');
    if (!slider) throw new Error("no slider");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(slider, "2.5");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("pointerup", { bubbles: true }));
    await settle();
    expect(q(".emvb-ie-slider-value")?.textContent).toBe("+2.5°");
    await click(".emvb-ie-slider-value");
    await click("[data-emvb-image-corners]");
    await click("[data-emvb-image-crop-done]");
    expect(calls).toEqual([
      ["setTool", "compose"],
      ["rotate", 1],
      ["rotate", -1],
      ["flip", "horizontal"],
      ["toggleOrientation"],
      ["setStraighten", 2.5, { transient: true }],
      ["commit"],
      ["setStraighten", 0, { transient: true }],
      ["commit"],
      ["setEditingCorners", true],
      ["done"],
    ]);
    expect(q("[data-emvb-image-panel]")?.dataset.emvbImagePanel).toBe("adjust");
  });

  test("Esc leaves the corner handles before it closes the editor", async () => {
    serveImage();
    await open({ src: "/a.jpg", alt: "A" });
    change({ tool: "compose", editingCorners: true });
    await settle();
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    q("[data-emvb-image-panel]")?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settle();
    expect(openChanges).not.toContain(false);
    expect(calls).toContainEqual(["setEditingCorners", false]);
  });

  test("a narrow editor uses the compact layout: tools at the bottom, the panel in a sheet", async () => {
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    serveImage();
    const root = await open({ src: "/a.jpg", alt: "A" });
    expect(root.dataset.layout).toBe("compact");
    expect(q("[data-emvb-image-sheet]")?.dataset.emvbImageSheet).toBe("closed");
    await click('.emvb-ie-compact > nav [data-emvb-image-tool="compose"]');
    expect(q("[data-emvb-image-sheet]")?.dataset.emvbImageSheet).toBe("open");
    expect(q("[data-emvb-image-sheet] [data-emvb-image-panel]")?.dataset.emvbImagePanel).toBe(
      "compose",
    );
    // Tapping the active tool again closes the sheet.
    await click('.emvb-ie-compact > nav [data-emvb-image-tool="compose"]');
    expect(q("[data-emvb-image-sheet]")?.dataset.emvbImageSheet).toBe("closed");
  });

  test("W-743: compact sheet Close returns focus to the current outer tool", async () => {
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    serveImage();
    await open({ src: "/a.jpg", alt: "A" });
    const outerTool = (tool: string) => `.emvb-ie-compact > nav [data-emvb-image-tool="${tool}"]`;
    const close = '[data-emvb-image-sheet] [aria-label="Close panel"]';
    const closeAndCheck = async (tool: string) => {
      q<HTMLButtonElement>(close)?.focus();
      expect(document.activeElement === q(close)).toBe(true);
      await click(close);
      expect(q("[data-emvb-image-sheet]")?.dataset.emvbImageSheet).toBe("closed");
      expect(document.activeElement === q(outerTool(tool))).toBe(true);
      expect(q(outerTool(tool))?.getAttribute("aria-pressed")).toBe("true");
    };
    await click(outerTool("compose"));
    await closeAndCheck("compose");
    await click(outerTool("compose"));
    await click('[data-emvb-image-sheet] [data-emvb-image-tool="metadata"]');
    await closeAndCheck("metadata");
    expect(calls).toEqual([
      ["setTool", "compose"],
      ["setTool", "metadata"],
    ]);
  });

  test("a picture on another website gets the upload-a-copy message, without photocn", async () => {
    await open({ src: "https://cdn.example.com/a.jpg", alt: "A" });
    expect(q("[data-emvb-image-editor]")?.dataset.emvbImageEditor).toBe("error");
    expect(q("[data-emvb-image-error]")?.textContent).toContain(
      "Upload a copy to the media library",
    );
    expect(q("[data-emvb-image-error] button")?.textContent).toBe("Back to the page");
    expect(hookOptions).toBeUndefined();
  });

  test("a browser without WebGL 2 is told so", async () => {
    serveImage();
    plan = { ok: false, message: "This browser can't edit images: it has no WebGL 2." };
    await open({ src: "/a.jpg", alt: "A" });
    expect(q("[data-emvb-image-error]")?.textContent).toContain("no WebGL 2");
    expect(hookOptions).toBeUndefined();
  });

  test("W-719: an interrupted transfer explains recovery and Try again opens the picture", async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (url: string) => {
      seen.push(url);
      if (seen.length === 1) {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new TypeError("Transfer interrupted"));
            },
          }),
          { headers: { "content-type": "image/jpeg" } },
        );
      }
      return new Response("img", { headers: { "content-type": "image/jpeg" } });
    }) as unknown as typeof fetch;

    await open({ src: "/a.jpg", alt: "A" });
    expect(q("[data-emvb-image-editor]")?.dataset.emvbImageEditor).toBe("error");
    expect(q("[data-emvb-image-error]")?.getAttribute("role")).toBe("alert");
    expect(q("[data-emvb-image-error] p")?.textContent).toBe(
      "Couldn't load the picture. Check your connection and try again.",
    );
    expect(q("[data-emvb-image-error] button")?.textContent).toBe("Try again");
    expect(hookOptions).toBeUndefined();

    await React.act(async () => {
      await click("[data-emvb-image-error] button");
      await [1, 2, 3, 4, 5].reduce((prev) => prev.then(settle), Promise.resolve());
    });
    expect(q("[data-emvb-image-editor]")?.dataset.emvbImageEditor).toBe("ready");
    expect(q("[data-emvb-image-error]")?.textContent ?? null).toBeNull();
    expect(seen).toEqual(["/a.jpg", "/a.jpg"]);
    expect(openChanges).toEqual([]);
  });

  test("a picture photocn can't decode shows the error badge", async () => {
    serveImage();
    state.status = "error";
    const root = await open({ src: "/a.jpg", alt: "A" });
    expect(root.dataset.emvbImageEditor).toBe("error");
    expect(q(".emvb-ie-badge")?.textContent).toContain("Broken file");
  });
});

const setRange = async (sel: string, v: string) => {
  const el = q<HTMLInputElement>(sel);
  if (!el) throw new Error(`no ${sel}`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("pointerup", { bubbles: true }));
  await settle();
};
const typeInto = async (sel: string, v: string) => {
  const el = q<HTMLInputElement>(sel);
  if (!el) throw new Error(`no ${sel}`);
  el.focus();
  el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  await settle();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await settle();
};
const key = async (el: Element | null, k: string, init: KeyboardEventInit = {}) => {
  if (!el) throw new Error("no element for key");
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));
  el.dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true, ...init }));
  await settle();
};
const tab = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (t) => t.textContent?.replace(" channel", "").trim() === name,
  );

describe("tone tools in photocn's panels (W-484)", () => {
  test("Adjust: labelled sliders with typed values, sections as tabs, a reset per section", async () => {
    serveImage();
    await open({ src: "/a.jpg", alt: "A" });
    const range = q<HTMLInputElement>('[data-emvb-image-slider="brightness"]');
    expect(range?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(document.getElementById(range?.getAttribute("aria-labelledby") ?? "")?.textContent).toBe(
      "Brightness",
    );
    expect(q('[data-emvb-image-number="brightness"]')?.getAttribute("aria-label")).toBe(
      "Brightness value",
    );
    await setRange('[data-emvb-image-slider="brightness"]', "0.25");
    expect(q<HTMLInputElement>('[data-emvb-image-number="brightness"]')?.value).toBe("+0.25");
    await typeInto('[data-emvb-image-number="contrast"]', "-0.4");
    expect(calls.filter((c) => c[0] === "setLights").map((c) => c[1])).toEqual([
      expect.objectContaining({ brightness: 0.25, contrast: 0 }),
      expect.objectContaining({ brightness: 0.25, contrast: -0.4 }),
    ]);
    expect(calls.some((c) => c[0] === "commit")).toBe(true);
    // A typed value past the end is held to it.
    await typeInto('[data-emvb-image-number="gamma"]', "7");
    expect(calls.at(-2)).toEqual(["setLights", expect.objectContaining({ gamma: 1 })]);
    await click('[data-emvb-image-section-reset="lights"]');
    expect(calls.at(-1)).toEqual(["resetSection", "lights"]);
    tab("Color")?.click();
    await settle();
    expect(q("[data-emvb-image-section]")?.dataset.emvbImageSection).toBe("colors");
    await setRange('[data-emvb-image-slider="saturation"]', "-0.5");
    expect(calls.at(-2)).toEqual(["setColors", expect.objectContaining({ saturation: -0.5 })]);
    await click("[data-emvb-image-panel-reset]");
    expect(calls.at(-1)).toEqual(["resetAdjust"]);
  });

  test("Effects opens the adjustments on their Effects tab, as in photocn", async () => {
    serveImage();
    await open({ src: "/a.jpg", alt: "A" });
    await click('[data-slot=editor-sidebar] [data-emvb-image-tool="effects"]');
    expect(q("[data-emvb-image-panel]")?.dataset.emvbImagePanel).toBe("effects");
    expect(q("[data-emvb-image-section]")?.dataset.emvbImageSection).toBe("effects");
    await setRange('[data-emvb-image-slider="vignette"]', "0.3");
    expect(calls.at(-2)).toEqual(["setEffects", expect.objectContaining({ vignette: 0.3 })]);
  });

  test("Filters: None and the looks as pressed buttons; Strength only once a look is on", async () => {
    serveImage();
    await open({ src: "/a.jpg", alt: "A" });
    await click('[data-slot=editor-sidebar] [data-emvb-image-tool="filters"]');
    const chips = [...document.querySelectorAll<HTMLElement>("[data-emvb-image-filter]")];
    expect(chips.map((c) => c.textContent)).toEqual(["None", "Aden", "Crema", "Kodak"]);
    expect(chips[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(q('[data-emvb-image-slider="filter-strength"]')).toBeNull();
    await click('[data-emvb-image-filter="Crema"]');
    await settle();
    expect(calls).toContainEqual([
      "patch",
      "filters",
      { opt: { label: "Crema", type: "MTX" }, mix: 0 },
    ]);
    expect(q('[data-emvb-image-filter="Crema"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(q<HTMLInputElement>('[data-emvb-image-number="filter-strength"]')?.value).toBe("100%");
    await typeInto('[data-emvb-image-number="filter-strength"]', "40");
    expect(calls).toContainEqual(["setStrength", 0.4]);
    await click('[data-emvb-image-filter="None"]');
    expect(calls).toContainEqual(["selectFilter", null]);
  });

  test("Curves: each point is a keyboard slider; + adds, Delete removes, levels can be typed", async () => {
    serveImage();
    await open({ src: "/a.jpg", alt: "A" });
    await click('[data-slot=editor-sidebar] [data-emvb-image-tool="curves"]');
    const points = () => [...document.querySelectorAll<SVGElement>("[data-curve-index]")];
    expect(points()).toHaveLength(5);
    expect(points()[2]?.getAttribute("role")).toBe("slider");
    expect(points()[2]?.getAttribute("aria-valuetext")).toBe("input 128, output 128");
    expect(q("[data-emvb-image-panel-reset]")?.hasAttribute("disabled")).toBe(true);
    const mid = points()[2];
    (mid as unknown as HTMLElement).focus();
    mid?.dispatchEvent(new FocusEvent("focus"));
    await settle();
    await key(mid ?? null, "ArrowUp", { shiftKey: true });
    const moved = calls.find((c) => c[0] === "setCurves")?.[1] as [number, number][][];
    expect(moved[0]?.[2]?.[1]).toBeCloseTo(0.5 + 10 / 255, 5);
    expect(calls).toContainEqual(["commitCurves"]);
    expect(points()[2]?.getAttribute("aria-valuetext")).toBe("input 128, output 138");
    // Typed Output level for the focused point.
    await typeInto("[data-emvb-image-level=output]", "200");
    expect(points()[2]?.getAttribute("aria-valuenow")).toBe("200");
    // + adds a point after it, Delete removes one; the end points stay.
    await key(points()[2] ?? null, "+");
    expect(points()).toHaveLength(6);
    await key(points()[3] ?? null, "Delete");
    expect(points()).toHaveLength(5);
    await key(points()[0] ?? null, "Delete");
    expect(points()).toHaveLength(5);
    expect(q("[data-emvb-image-panel-reset]")?.hasAttribute("disabled")).toBe(false);
    // Channels are tabs; a channel starts on the identity curve.
    tab("R")?.click();
    await settle();
    expect(q("[data-emvb-image-curve]")?.getAttribute("data-emvb-image-curve")).toBe("r");
    expect(points()[2]?.getAttribute("aria-valuetext")).toBe("input 128, output 128");
  });

  test("Blur: kinds as tabs, percentage sliders, and a sharp spot that moves with the arrows", async () => {
    serveImage();
    await open({ src: "/a.jpg", alt: "A" });
    await click('[data-slot=editor-sidebar] [data-emvb-image-tool="blur"]');
    expect(q("[data-emvb-image-panel-reset]")?.hasAttribute("disabled")).toBe(true);
    await typeInto('[data-emvb-image-number="bokeh-strength"]', "60");
    expect(calls).toContainEqual(["setBlur", expect.objectContaining({ bokehStrength: 0.6 })]);
    tab("Gaussian")?.click();
    await settle();
    expect(q("[data-emvb-image-section]")?.dataset.emvbImageSection).toBe("gaussian");
    await setRange('[data-emvb-image-slider="gaussian-radius"]', "80");
    expect(calls.at(-2)).toEqual(["setBlur", expect.objectContaining({ gaussianLensOut: 0.8 })]);
    await setRange('[data-emvb-image-slider="center-x"]', "30");
    expect(calls.at(-2)).toEqual(["setBlur", expect.objectContaining({ centerX: 0.3 })]);
  });
});

describe("save a copy (W-485)", () => {
  const settleAll = () => [1, 2, 3, 4, 5].reduce((prev) => prev.then(settle), Promise.resolve());

  for (const size of [15, 10001]) {
    test(`W-718: an unsupported custom save size ${size} is rejected before rendering and can recover`, async () => {
      serveImage();
      let saved = 0;
      await open({ src: "/a.jpg", alt: "A" }, async () => {
        saved++;
      });
      await React.act(async () => click("[data-emvb-image-save]"));
      await React.act(async () => typeInto("[data-emvb-image-export-width]", String(size)));
      await React.act(async () => click("[data-emvb-image-export-save]"));
      await settleAll();
      expect(calls.some(([name]) => name === "exportImage")).toBe(false);
      expect(saved).toBe(0);
      expect(q("[data-emvb-image-export-error]")?.textContent).toContain("between 16 and 10000 px");
      expect(q("[data-emvb-image-export-save]")?.textContent).toBe("Save copy");
      await React.act(async () => click("[data-emvb-image-export-full]"));
      await React.act(async () => click("[data-emvb-image-export-save]"));
      await settleAll();
      expect(saved).toBe(1);
      expect(openChanges).toContain(false);
    });
  }

  for (const size of [16, 10000]) {
    test(`W-718: custom save size boundary ${size} remains supported`, async () => {
      serveImage();
      const records: unknown[] = [];
      await open({ src: "/a.jpg", alt: "A" }, async (_file, copy) => {
        records.push(copy.edit);
      });
      await React.act(async () => click("[data-emvb-image-save]"));
      await React.act(async () => typeInto("[data-emvb-image-export-width]", String(size)));
      await React.act(async () => click("[data-emvb-image-export-save]"));
      await settleAll();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ output: { maxSide: size } });
      expect(openChanges).toContain(false);
    });
  }

  test("W-718: Download retains sizes outside the stored copy's custom-size range", async () => {
    serveImage();
    let saved = 0;
    await open({ src: "/a.jpg", alt: "A" }, async () => {
      saved++;
    });
    await React.act(async () => click("[data-emvb-image-save]"));
    await React.act(async () => typeInto("[data-emvb-image-export-width]", "10001"));
    await React.act(async () => click("[data-emvb-image-download]"));
    await settleAll();
    expect(calls.find(([name]) => name === "download")?.[1]).toMatchObject({ width: 10001 });
    expect(saved).toBe(0);
    expect(q("[data-emvb-image-export-error]")?.textContent ?? null).toBeNull();
  });

  for (const [shape, full, maximum] of [
    ["portrait", { width: 480, height: 640 }, { width: 12288, height: 16384 }],
    ["landscape", { width: 640, height: 480 }, { width: 16384, height: 12288 }],
  ] as const) {
    for (const side of ["width", "height"] as const) {
      test(`W-717: ${shape} export ${side} keeps both dimensions within the existing limit`, async () => {
        serveImage();
        change({ out: full });
        await open({ src: "/a.jpg", alt: "A" }, async () => undefined);
        await React.act(async () => click("[data-emvb-image-save]"));
        const width = q<HTMLInputElement>("[data-emvb-image-export-width]");
        const height = q<HTMLInputElement>("[data-emvb-image-export-height]");
        if (!width || !height) throw new Error("No export dimensions");
        const field = side === "width" ? width : height;
        await React.act(async () => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
            field,
            "16384",
          );
          field.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect({ width: Number(width.value), height: Number(height.value) }).toEqual(maximum);
        expect(Number(width.max)).toBe(maximum.width);
        expect(Number(height.max)).toBe(maximum.height);
        expect(calls.some(([name]) => name === "exportImage" || name === "download")).toBe(false);
      });
    }
  }

  test("Save copy opens photocn's export step with WebP 85% and the longest side at 2560", async () => {
    serveImage();
    change({ out: { width: 4000, height: 3000 }, edited: true });
    await open({ src: "/_emdash/api/media/file/shop.jpg", alt: "Shop" }, async () => undefined);
    expect(q<HTMLButtonElement>("[data-emvb-image-save]")?.disabled).toBe(false);
    await click("[data-emvb-image-save]");
    await settleAll();
    const dialog = q("[data-slot=image-editor-export-dialog]");
    expect(dialog?.textContent).toContain("Export image");
    expect(dialog?.textContent).toContain("WebP (recommended)");
    expect(q<HTMLInputElement>("[data-emvb-image-number=export-quality]")?.value).toBe("85%");
    expect(q<HTMLInputElement>("[data-emvb-image-export-width]")?.value).toBe("2560");
    expect(q<HTMLInputElement>("[data-emvb-image-export-height]")?.value).toBe("1920");
    expect(q("[data-emvb-image-export-note]")?.textContent).toBe("64% of the crop");
    await click("[data-emvb-image-export-full]");
    expect(q<HTMLInputElement>("[data-emvb-image-export-width]")?.value).toBe("4000");
    expect(q("[data-emvb-image-export-note]")?.textContent).toBe("Full resolution");
  });

  test("saving uploads a WebP named after the original with the edit record, then closes", async () => {
    serveImage();
    change({ out: { width: 4000, height: 3000 }, edited: true });
    const saved: { file: File; copy: Parameters<OnSave>[1] }[] = [];
    await open(
      { src: "/_emdash/api/media/file/shop.jpg", mediaId: "m1", alt: "Shop" },
      async (file, copy) => {
        saved.push({ file, copy });
      },
    );
    await click("[data-emvb-image-save]");
    await click("[data-emvb-image-export-save]");
    await settleAll();
    expect(calls.find((c) => c[0] === "exportImage")?.[1]).toEqual({
      format: "webp",
      quality: 0.85,
      width: 2560,
      height: 1920,
    });
    expect(saved).toHaveLength(1);
    const [first] = saved;
    if (!first) throw new Error("not saved");
    const { file, copy } = first;
    expect(file.name).toBe("shop-edited.webp");
    expect(file.type).toBe("image/webp");
    expect({ w: copy.width, h: copy.height }).toEqual({ w: 2560, h: 1920 });
    expect(copy.edit).toMatchObject({
      v: 1,
      engine: "photocn",
      originalMediaId: "m1",
      originalSrc: "/_emdash/api/media/file/shop.jpg",
      recipe: { version: 1, lights: { exposure: 0.2 } },
      output: { format: "webp", quality: 0.85, maxSide: 2560, stripGps: true },
    });
    expect(openChanges).toContain(false);
  });

  test("a failed upload keeps the editor open with the reason and a Retry", async () => {
    serveImage();
    change({ edited: true });
    let tries = 0;
    await open({ src: "/a.jpg", alt: "A" }, async () => {
      tries++;
      throw new Error("The server is busy.");
    });
    await click("[data-emvb-image-save]");
    await click("[data-emvb-image-export-save]");
    await settleAll();
    expect(q("[data-emvb-image-export-error]")?.textContent).toBe(
      "Couldn't save the copy. The server is busy.",
    );
    expect(q("[data-emvb-image-export-save]")?.textContent).toBe("Retry");
    expect(openChanges).not.toContain(false);
    await click("[data-emvb-image-export-save]");
    await settleAll();
    expect(tries).toBe(2);
  });

  test("W-716: Escape cannot dismiss a saving export or hide its failure and Retry", async () => {
    serveImage();
    change({ edited: true });
    const pending = Promise.withResolvers<void>();
    let tries = 0;
    await open({ src: "/a.jpg", alt: "A" }, async () => {
      if (++tries === 1) await pending.promise;
    });
    try {
      await React.act(async () => click("[data-emvb-image-save]"));
      await React.act(async () => click("[data-emvb-image-export-save]"));
      await settleAll();
      expect(tries).toBe(1);
      expect(q<HTMLButtonElement>("[data-emvb-image-export-save]")?.disabled).toBe(true);
      await React.act(async () =>
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        ),
      );
      await settleAll();
      expect(Boolean(q("[data-emvb-image-export]"))).toBe(true);
      await React.act(async () => pending.reject(new Error("Temporary upload failure")));
      await settleAll();
      expect(q("[data-emvb-image-export-error]")?.textContent).toContain(
        "Temporary upload failure",
      );
      expect(q("[data-emvb-image-export-save]")?.textContent).toBe("Retry");
      await React.act(async () => click("[data-emvb-image-export-save]"));
      await settleAll();
      expect(tries).toBe(2);
      expect(openChanges).toContain(false);
    } finally {
      await React.act(async () => pending.resolve());
    }
  });

  for (const save of [false, true]) {
    test(`W-716: Escape can dismiss the export ${save ? "after a failed save" : "before saving"}`, async () => {
      serveImage();
      change({ edited: true });
      await open({ src: "/a.jpg", alt: "A" }, async () => {
        throw new Error("Try later");
      });
      await React.act(async () => click("[data-emvb-image-save]"));
      if (save) await React.act(async () => click("[data-emvb-image-export-save]"));
      await settleAll();
      await React.act(async () =>
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        ),
      );
      await settleAll();
      expect(Boolean(q("[data-emvb-image-export]"))).toBe(false);
      expect(openChanges).not.toContain(false);
    });
  }

  test("W-716: Escape can dismiss a pending download without closing the image editor", async () => {
    serveImage();
    const pending = Promise.withResolvers<void>();
    waitForDownload = pending.promise;
    await open({ src: "/a.jpg", alt: "A" }, async () => undefined);
    try {
      await React.act(async () => click("[data-emvb-image-save]"));
      await React.act(async () => click("[data-emvb-image-download]"));
      expect(calls.filter(([name]) => name === "download")).toHaveLength(1);
      await React.act(async () =>
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        ),
      );
      await settleAll();
      expect(Boolean(q("[data-emvb-image-export]"))).toBe(false);
      expect(openChanges).not.toContain(false);
    } finally {
      await React.act(async () => pending.resolve());
    }
  });

  test("re-opening an edited picture loads the original and puts the recipe back", async () => {
    let fetched = "";
    globalThis.fetch = (async (url: string) => {
      fetched = String(url);
      return new Response("img", { headers: { "content-type": "image/jpeg" } });
    }) as unknown as typeof fetch;
    const recipe = { version: 1, lights: { exposure: 0.3 }, filters: { label: "crema" } };
    await open({
      src: "/_emdash/api/media/file/shop-edited.webp",
      edit: {
        v: 1,
        engine: "photocn",
        engineVersion: "0.1.2",
        recipe,
        originalSrc: "/_emdash/api/media/file/shop.jpg",
        output: { format: "webp", quality: 0.85, stripGps: true },
        editedAt: "2026-10-14T12:00:00.000Z",
      },
    });
    await settleAll();
    expect(fetched).toBe("/_emdash/api/media/file/shop.jpg");
    expect(calls.filter((c) => c[0] === "applyRecipe")).toEqual([["applyRecipe", recipe]]);
  });

  test("without a save handler the button stays off", async () => {
    serveImage();
    await open({ src: "/a.jpg", alt: "A" });
    expect(q<HTMLButtonElement>("[data-emvb-image-save]")?.disabled).toBe(true);
  });
});

describe("the Metadata tool (W-486)", () => {
  test("shows photocn's rows, the EXIF badge and what a saved copy keeps", async () => {
    serveImage();
    change({ tool: "metadata" });
    await open({ src: "/_emdash/api/media/file/01M4X9JVR25AERTZ0000000000.jpg", alt: "Garden" });
    const panel = q("[data-emvb-image-panel=metadata]");
    expect(panel).not.toBeNull();
    expect(q("[data-emvb-image-exif]")?.textContent).toBe("EXIF ready");
    const rows = [...document.querySelectorAll("[data-emvb-image-meta]")].map((r) => [
      r.querySelector("th")?.textContent,
      r.querySelector("td")?.textContent,
    ]);
    expect(rows).toEqual([
      ["Name", "Garden"],
      ["Type", "image/jpeg"],
      ["Size", "51.0 KB"],
      ["Dimensions", "640 x 480"],
      ["Format", "JPEG"],
      ["Captured", "2008:05:30 15:56:01"],
      ["Camera", "Canon EOS 40D"],
      ["GPS", "43.4675, 11.8851"],
    ]);
    expect(q("[data-emvb-image-meta-gps]")?.textContent).toContain("A JPEG copy has it removed");
  });
});

describe("announcements and the edit summary (W-487)", () => {
  test("the Metadata panel says what the edits are, and the live region announces the tool", async () => {
    serveImage();
    change({ tool: "metadata", edited: true });
    await open({ src: "/_emdash/api/media/file/01M4X9JVR25AERTZ0000000000.jpg" });
    expect(q("[data-emvb-image-meta-edits]")?.textContent).toContain("Exposure +20");
    change({ tool: "adjust" });
    await Promise.resolve();
    expect(q("[data-emvb-image-live]")?.textContent).toBe("Adjust tool");
  });
});
