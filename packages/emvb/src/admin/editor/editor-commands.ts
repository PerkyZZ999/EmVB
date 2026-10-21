import type { PasteMode, PopupDevice, WrapType } from "../../core/index.ts";

/** Where an editor command is offered. Shortcuts call `runCommand` for the same ids. */
export type CommandSurface = "palette" | "layers" | "overlay" | "device";

export type EditorCommand = {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  disabled?: boolean;
  danger?: boolean;
  surfaces: readonly CommandSurface[];
  run: () => void;
};

/** The actions a surface can invoke. Each surface fills the ones it shows. */
export type CommandRunners = {
  duplicate?: (id: string) => void;
  remove?: (id: string) => void;
  wrap?: (id: string, type: WrapType) => void;
  moveUp?: (id: string) => void;
  moveDown?: (id: string) => void;
  copy?: (id: string) => void;
  paste?: (id: string | null, mode?: PasteMode) => void;
  copyStyle?: (id: string) => void;
  pasteStyle?: (id: string | null) => void;
  pasteBlocked?: string | null;
  pasteStyleBlocked?: string | null;
  toggleHidden?: () => void;
  save?: () => void;
  publish?: () => void;
  preview?: () => void;
  undo?: () => void;
  redo?: () => void;
  deselect?: () => void;
  openSiteStyles?: () => void;
  openA11y?: () => void;
  openTimeline?: () => void;
  openShare?: () => void;
  openWeight?: () => void;
  setDevice?: (device: PopupDevice) => void;
  openShortcuts?: () => void;
  rename?: () => void;
  /** Opens Save as section for an element (W-876). */
  saveSection?: (id: string) => void;
  /** Set when the selection is an Image element the image editor can open (W-486). */
  editImage?: () => void;
};

export type CommandInput = {
  surface: CommandSurface;
  targetId: string | null;
  isRoot: boolean;
  isParent: boolean;
  device: PopupDevice;
  /** Duplicate and wrap. False on the root and when nothing is selected. */
  canDuplicate: boolean;
  /** Delete and the sibling moves. False on the root. */
  canDelete: boolean;
  runners: CommandRunners;
  a11yHint?: string;
};

type Spec = {
  id: string;
  labels: Partial<Record<CommandSurface, string>>;
  hint?: string;
  keywords?: string;
  surfaces: readonly CommandSurface[];
  danger?: boolean;
};

// One row per command. A surface shows a row when its name is in `surfaces` and `shown` agrees.
// Labels stay per surface: the palette, Layers and the overlay do not share wording.
const SPECS: readonly Spec[] = [
  { id: "rename", labels: { layers: "Rename" }, surfaces: ["layers"] },
  {
    id: "copy",
    labels: { layers: "Copy", overlay: "Copy" },
    surfaces: ["layers", "overlay"],
  },
  {
    id: "paste",
    labels: { layers: "Paste", overlay: "Paste" },
    surfaces: ["layers", "overlay"],
  },
  { id: "paste-inside", labels: { layers: "Paste inside" }, surfaces: ["layers"] },
  {
    id: "copy-style",
    labels: { layers: "Copy style", overlay: "Copy style" },
    surfaces: ["layers", "overlay"],
  },
  {
    id: "paste-style",
    labels: { layers: "Paste style", overlay: "Paste style" },
    surfaces: ["layers", "overlay"],
  },
  {
    id: "duplicate",
    labels: {
      layers: "Duplicate",
      overlay: "Duplicate element",
      palette: "Duplicate selected element",
    },
    hint: "Ctrl/Cmd+D",
    surfaces: ["layers", "overlay", "palette"],
  },
  {
    id: "delete",
    labels: {
      layers: "Delete",
      overlay: "Delete element",
      palette: "Delete selected element",
    },
    hint: "Delete",
    surfaces: ["layers", "overlay", "palette"],
    danger: true,
  },
  {
    id: "save-section",
    labels: { layers: "Save as section…", palette: "Save selected element as a section…" },
    keywords: "my sections saved reuse synced template block segment",
    surfaces: ["layers", "palette"],
  },
  { id: "move-up", labels: { layers: "Move up" }, surfaces: ["layers"] },
  { id: "move-down", labels: { layers: "Move down" }, surfaces: ["layers"] },
  {
    id: "wrap-flexbox",
    labels: { palette: "Wrap in Flexbox" },
    keywords: "wrap box container",
    surfaces: ["palette"],
  },
  {
    id: "wrap-grid",
    labels: { palette: "Wrap in Grid" },
    keywords: "wrap box columns",
    surfaces: ["palette"],
  },
  {
    id: "wrap-div",
    labels: { palette: "Wrap in Div block" },
    keywords: "wrap box",
    surfaces: ["palette"],
  },
  { id: "save", labels: { palette: "Save draft" }, hint: "Ctrl/Cmd+S", surfaces: ["palette"] },
  { id: "publish", labels: { palette: "Publish" }, surfaces: ["palette"] },
  { id: "preview", labels: { palette: "Preview" }, keywords: "open view", surfaces: ["palette"] },
  { id: "undo", labels: { palette: "Undo" }, hint: "Ctrl/Cmd+Z", surfaces: ["palette"] },
  { id: "redo", labels: { palette: "Redo" }, hint: "Ctrl/Cmd+Shift+Z", surfaces: ["palette"] },
  {
    id: "deselect",
    labels: { palette: "Clear selection" },
    hint: "Esc",
    surfaces: ["palette"],
  },
  {
    id: "site-styles",
    labels: { palette: "Open Site styles" },
    keywords: "design variables classes colors fonts",
    surfaces: ["palette"],
  },
  {
    id: "a11y",
    labels: { palette: "Check accessibility" },
    keywords: "a11y contrast alt headings audit",
    surfaces: ["palette"],
  },
  {
    id: "timeline",
    labels: { palette: "Version timeline" },
    keywords: "history revisions restore diff",
    surfaces: ["palette"],
  },
  {
    id: "share",
    labels: { palette: "Share as a playground link" },
    keywords: "copy link url playground share send",
    surfaces: ["palette"],
  },
  {
    id: "weight",
    labels: { palette: "Show page weight" },
    keywords: "performance budget size speed",
    surfaces: ["palette"],
  },
  { id: "device-desktop", labels: { palette: "View on desktop" }, surfaces: ["palette"] },
  { id: "device-tablet", labels: { palette: "View on tablet" }, surfaces: ["palette"] },
  { id: "device-mobile", labels: { palette: "View on mobile" }, surfaces: ["palette"] },
  {
    id: "edit-image",
    labels: { palette: "Edit image" },
    keywords: "photo picture crop rotate adjust filter curves blur",
    surfaces: ["palette"],
  },
  { id: "shortcuts", labels: { palette: "Keyboard shortcuts" }, surfaces: ["palette"] },
  { id: "hide-on-device", labels: {}, surfaces: ["device"] },
];

const ORDER: Record<CommandSurface, readonly string[]> = {
  layers: [
    "rename",
    "copy",
    "paste",
    "paste-inside",
    "duplicate",
    "save-section",
    "copy-style",
    "paste-style",
    "move-up",
    "move-down",
    "delete",
  ],
  overlay: ["duplicate", "copy", "paste", "copy-style", "paste-style", "delete"],
  palette: [
    "wrap-flexbox",
    "wrap-grid",
    "wrap-div",
    "save",
    "publish",
    "preview",
    "undo",
    "redo",
    "edit-image",
    "duplicate",
    "save-section",
    "delete",
    "deselect",
    "site-styles",
    "a11y",
    "timeline",
    "share",
    "weight",
    "device-desktop",
    "device-tablet",
    "device-mobile",
    "shortcuts",
  ],
  device: ["hide-on-device"],
};

const CLIP_IDS = new Set(["copy", "paste", "paste-inside", "copy-style", "paste-style"]);
const WRAP_IDS = new Set(["wrap-flexbox", "wrap-grid", "wrap-div"]);
const MOVE_IDS = new Set(["move-up", "move-down", "delete"]);

function shown(id: string, input: CommandInput): boolean {
  const clip = !!input.runners.copy;
  if (id === "rename") return !!input.runners.rename;
  if (id === "edit-image") return !!input.runners.editImage;
  if (id === "save-section") return !!input.runners.saveSection && input.canDuplicate;
  if (id === "paste-inside") return clip && input.isParent;
  if (id === "paste") return clip && (input.surface !== "layers" || !input.isRoot);
  if (CLIP_IDS.has(id)) return clip;
  if (id === "duplicate" || WRAP_IDS.has(id)) return input.canDuplicate;
  if (MOVE_IDS.has(id)) return input.canDelete;
  return true;
}

function blocked(id: string, input: CommandInput): boolean {
  if (id === "paste" || id === "paste-inside") return !!input.runners.pasteBlocked;
  if (id === "paste-style") return !!input.runners.pasteStyleBlocked;
  // W-567: the root is the page itself and the page never hides it.
  if (id === "hide-on-device") return !input.targetId || !!input.isRoot;
  return false;
}

function labelFor(spec: Spec, input: CommandInput): string {
  if (spec.id === "hide-on-device") return `Hide on ${input.device}`;
  return spec.labels[input.surface] ?? spec.id;
}

/** Commands one surface shows for this target, in that surface's order. */
export function editorCommands(input: CommandInput): EditorCommand[] {
  const rank = new Map(ORDER[input.surface].map((id, index) => [id, index]));
  return SPECS.filter((spec) => spec.surfaces.includes(input.surface) && shown(spec.id, input))
    .toSorted((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999))
    .map((spec) => ({
      id: spec.id,
      label: labelFor(spec, input),
      hint: spec.id === "a11y" ? input.a11yHint : spec.hint,
      keywords: spec.keywords,
      disabled: blocked(spec.id, input),
      danger: spec.danger,
      surfaces: spec.surfaces,
      run: () => runCommand(input.runners, spec.id, input.targetId),
    }));
}

/** One implementation for the palette, Layers, the overlay, the device bar and shortcuts. */
export function runCommand(runners: CommandRunners, id: string, targetId: string | null): void {
  switch (id) {
    case "rename":
      runners.rename?.();
      return;
    case "edit-image":
      runners.editImage?.();
      return;
    case "copy":
      if (targetId) runners.copy?.(targetId);
      return;
    case "paste":
      runners.paste?.(targetId);
      return;
    case "paste-inside":
      runners.paste?.(targetId, "inside");
      return;
    case "copy-style":
      if (targetId) runners.copyStyle?.(targetId);
      return;
    case "paste-style":
      runners.pasteStyle?.(targetId);
      return;
    case "duplicate":
      if (targetId) runners.duplicate?.(targetId);
      return;
    case "save-section":
      if (targetId) runners.saveSection?.(targetId);
      return;
    case "delete":
      if (targetId) runners.remove?.(targetId);
      return;
    case "move-up":
      if (targetId) runners.moveUp?.(targetId);
      return;
    case "move-down":
      if (targetId) runners.moveDown?.(targetId);
      return;
    case "wrap-flexbox":
      if (targetId) runners.wrap?.(targetId, "flexbox");
      return;
    case "wrap-grid":
      if (targetId) runners.wrap?.(targetId, "grid");
      return;
    case "wrap-div":
      if (targetId) runners.wrap?.(targetId, "div-block");
      return;
    case "save":
      runners.save?.();
      return;
    case "publish":
      runners.publish?.();
      return;
    case "preview":
      runners.preview?.();
      return;
    case "undo":
      runners.undo?.();
      return;
    case "redo":
      runners.redo?.();
      return;
    case "deselect":
      runners.deselect?.();
      return;
    case "site-styles":
      runners.openSiteStyles?.();
      return;
    case "a11y":
      runners.openA11y?.();
      return;
    case "timeline":
      runners.openTimeline?.();
      return;
    case "share":
      runners.openShare?.();
      return;
    case "weight":
      runners.openWeight?.();
      return;
    case "device-desktop":
      runners.setDevice?.("desktop");
      return;
    case "device-tablet":
      runners.setDevice?.("tablet");
      return;
    case "device-mobile":
      runners.setDevice?.("mobile");
      return;
    case "shortcuts":
      runners.openShortcuts?.();
      return;
    case "hide-on-device":
      runners.toggleHidden?.();
      return;
    default:
      return;
  }
}
