import { Button, Checkbox, Select } from "@cloudflare/kumo";
import { FileArrowUpIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  type ElementorImport,
  importElementor,
  mergeSectionClasses,
  remapClassIds,
  MAX_IMPORT_CHARS,
  THEME_PART_TYPE_LABELS,
  THEME_PART_TYPES,
  type ThemePartType,
} from "../../core/index.ts";
import { THEME_PARTS_COLLECTION } from "../../constants.ts";
import { ApiError, type Fetcher } from "../api.ts";
import { createPage, listPages, type PageSummary } from "../content-api.ts";
import { loadSiteMenus } from "../menus-api.ts";
import type { MenuLink } from "../../core/import/elementor/context.ts";
import { editorUrl } from "../editor/exit.ts";
import { loadIconSet } from "../editor/icons/library.ts";
import { createThemePart } from "../theme-api.ts";
import { saveDesign } from "../design-api.ts";
import { loadDesign } from "../editor/useEditorData.ts";
import { BUTTON, FIELD } from "../ui.ts";
import { CreateDialog } from "./CreateDialog.tsx";
import { ImportReport } from "./ImportReport.tsx";
import { type Copy, fileNameOf, ImportImageCopies } from "./ImportImageCopies.tsx";
import {
  ImportPageLinks,
  type PageLinks,
  readPageLinks,
  writePageLinks,
} from "./ImportPageLinks.tsx";

type IconMap = ReadonlyMap<string, string>;
const NO_ICONS: IconMap = new Map();

/** Font Awesome from the editor's icon library, so imported icons are real SVG (W-945). */
function loadIcons(): Promise<IconMap> {
  return loadIconSet("fontawesome").then(
    (icons) => new Map(icons.map((icon) => [icon.id, icon.markup])),
    () => NO_ICONS,
  );
}

/** The Elementor report: Elementor elements, and the fonts the page uses. */
function ElementorReport({
  result,
  partType,
}: {
  result: ElementorImport | undefined;
  partType?: ThemePartType;
}) {
  const summary = result?.ok
    ? `Ready to import ${result.mapped} of ${result.elements} Elementor elements` +
      (partType ? ` as a ${THEME_PART_TYPE_LABELS[partType].toLowerCase()}.` : ".")
    : "";
  return (
    <ImportReport result={result} summary={summary}>
      {result?.ok && result.fonts.length > 0 && (
        <p className="emvb-helper">{`Fonts used: ${result.fonts.join(", ")}. Make sure your site loads them.`}</p>
      )}
    </ImportReport>
  );
}

/** An SVG file read for the import (W-951); the importer applies the icon cap and sanitizer. */
const MAX_SVG_FILE = 65_536;
/** Files fetched in one go; an export with more names them in the report. */
const MAX_SVG_FETCHES = 100;

/** Fetches an SVG file without cookies; undefined when the site refuses (CORS) or it's too big. */
async function fetchSvg(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, {
      credentials: "omit",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return undefined;
    const text = await response.text();
    return text.length <= MAX_SVG_FILE && /<svg[\s>]/i.test(text) ? text : undefined;
  } catch {
    return undefined;
  }
}

/** Reads a chosen file as text, refusing one larger than the importer reads. */
async function readJsonFile(file: File): Promise<string> {
  if (file.size > MAX_IMPORT_CHARS)
    throw new Error("This file is larger than 8 MB. Export one page or template at a time.");
  return file.text();
}

/**
 * Import from Elementor (W-945, D-069): choose or paste an Elementor export, see what will be
 * kept, changed or left out, then create a draft page (or theme part) and open it.
 */
export function ImportElementorDialog({
  fetcher,
  open,
  onOpenChange,
  target,
}: {
  fetcher: Fetcher;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: "page" | "part";
}) {
  const [json, setJson] = React.useState("");
  const [fileName, setFileName] = React.useState<string>();
  const [fileError, setFileError] = React.useState<string>();
  const [kit, setKit] = React.useState<unknown>();
  const [kitName, setKitName] = React.useState<string>();
  const [kitError, setKitError] = React.useState<string>();
  const [defaults, setDefaults] = React.useState(true);
  // W-958: Elementor classes become site classes only when asked (off by default).
  const [useClasses, setUseClasses] = React.useState(false);
  const [icons, setIcons] = React.useState<IconMap>();
  const [partType, setPartType] = React.useState<ThemePartType>("section");
  // W-951: SVG markup by the address the export uses, fetched or chosen.
  const [svgs, setSvgs] = React.useState<ReadonlyMap<string, string>>(new Map());
  const [svgStatus, setSvgStatus] = React.useState<string>();
  const [fetching, setFetching] = React.useState(false);
  const svgRef = React.useRef<HTMLInputElement>(null);
  // W-958: where links to WordPress pages (by id) go, remembered across imports.
  const [pageLinks, setPageLinks] = React.useState<PageLinks>(readPageLinks);
  const [pages, setPages] = React.useState<PageSummary[]>();
  // W-958: old-site images copied into the media library, by their old address.
  const [copies, setCopies] = React.useState<ReadonlyMap<string, Copy>>(new Map());
  // A new import starts the image copy row afresh (its status line and file input).
  const [session, setSession] = React.useState(0);
  // W-1026: the site's own menus (from its WordPress import) for imported Nav Menus, by name.
  // A menu the site doesn't have is kept as no links, so it is asked for once.
  const [siteMenus, setSiteMenus] = React.useState<ReadonlyMap<string, MenuLink[]>>(new Map());
  const iconsLoad = React.useRef<Promise<IconMap> | undefined>(undefined);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const kitRef = React.useRef<HTMLInputElement>(null);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setJson("");
      setFileName(undefined);
      setFileError(undefined);
      setKit(undefined);
      setKitName(undefined);
      setKitError(undefined);
      setDefaults(true);
      setUseClasses(false);
      setPartType("section");
      setSvgs(new Map());
      setSvgStatus(undefined);
      setPageLinks(readPageLinks());
      setCopies(new Map());
      setSession((n) => n + 1);
      setSiteMenus(new Map());
    }
  }

  React.useEffect(() => {
    if (!open || iconsLoad.current) return;
    iconsLoad.current = loadIcons();
    let live = true;
    void iconsLoad.current.then((map) => {
      if (live) setIcons(map);
    });
    return () => {
      live = false;
    };
  }, [open]);

  const options = React.useCallback(
    (map: IconMap | undefined) => ({
      kit,
      defaults,
      classes: useClasses,
      icon: (id: string) => map?.get(id),
      svg: (url: string) => svgs.get(url),
      pageLink: (id: number) => pageLinks[id],
      media: (url: string) => copies.get(url),
      menu: (name: string) => siteMenus.get(name),
    }),
    [kit, defaults, useClasses, svgs, pageLinks, copies, siteMenus],
  );
  const result = React.useMemo(
    () => (json.trim() ? importElementor(json, options(icons)) : undefined),
    [json, icons, options],
  );
  const suggestedPart = result?.ok ? result.partType : undefined;
  const missingSvgs = result?.ok ? result.svgFiles : [];
  const linkedPages = result?.ok ? result.pageLinks : [];
  const oldImages = result?.ok ? result.images.filter((url) => !copies.has(url)) : [];

  // W-1026: fetch each menu the export's Nav Menus name once; the import re-runs with them.
  const wantedMenus = (result?.ok ? result.menus : []).filter((name) => !siteMenus.has(name));
  const wantedKey = wantedMenus.join("\u0000");
  React.useEffect(() => {
    if (!wantedKey) return;
    const names = wantedKey.split("\u0000");
    let live = true;
    void loadSiteMenus(fetcher, names).then((found) => {
      if (!live) return;
      setSiteMenus(
        (current) => new Map([...current, ...names.map((n) => [n, found.get(n) ?? []] as const)]),
      );
    });
    return () => {
      live = false;
    };
  }, [wantedKey, fetcher]);
  const needsPages = linkedPages.length > 0 && pages === undefined;
  React.useEffect(() => {
    if (!needsPages) return;
    let live = true;
    listPages(fetcher).then(
      (list) => {
        if (live) setPages(list);
      },
      () => {
        if (live) setPages([]);
      },
    );
    return () => {
      live = false;
    };
  }, [needsPages, fetcher]);

  const fetchSvgs = async () => {
    setFetching(true);
    const urls = missingSvgs.slice(0, MAX_SVG_FETCHES);
    const found = await Promise.all(urls.map(async (url) => [url, await fetchSvg(url)] as const));
    const got = found.filter((entry): entry is readonly [string, string] => entry[1] !== undefined);
    setSvgs((current) => new Map([...current, ...got]));
    const failed = urls.length - got.length;
    setSvgStatus(
      failed === 0
        ? `Fetched ${got.length} SVG ${got.length === 1 ? "file" : "files"}.`
        : `Fetched ${got.length} of ${urls.length}. Your old site didn't allow the rest to be read from here: download them from its media library and add them with Add SVG files.`,
    );
    setFetching(false);
  };

  const addSvgs = async (files: readonly File[]) => {
    const wanted = new Map(missingSvgs.map((url) => [fileNameOf(url), url]));
    const usable = (file: File) => file.size <= MAX_SVG_FILE && wanted.has(file.name.toLowerCase());
    const unused = files.filter((file) => !usable(file)).map((file) => file.name);
    const added = await Promise.all(
      files
        .filter(usable)
        .map(
          async (file) => [wanted.get(file.name.toLowerCase()) ?? "", await file.text()] as const,
        ),
    );
    setSvgs((current) => new Map([...current, ...added]));
    setSvgStatus(
      `Added ${added.length} SVG ${added.length === 1 ? "file" : "files"}.` +
        (unused.length > 0
          ? ` Not used (not in this export, or over 64 KB): ${unused.join(", ")}.`
          : ""),
    );
  };
  React.useEffect(() => {
    if (suggestedPart) setPartType(suggestedPart);
  }, [suggestedPart]);

  const create = async (title: string, slug: string) => {
    // Icons may still be loading when the person is quick: wait, then import with them.
    const map = await (iconsLoad.current ?? Promise.resolve(NO_ICONS));
    const imported = json.trim() ? importElementor(json, options(map)) : undefined;
    if (!imported?.ok) {
      throw new ApiError(
        400,
        "IMPORT_EMPTY",
        imported ? imported.error : "Choose or paste an Elementor export first.",
      );
    }
    writePageLinks(pageLinks);
    let layout = imported.layout;
    if (imported.classes.length > 0) {
      // W-958 (D-060): never changes a class already on the site; identical ones are reused, a
      // different one with the same name is added as a numbered copy. Classes are saved first,
      // so the page never points at a class that failed to save.
      const loaded = await loadDesign(fetcher);
      const merge = mergeSectionClasses(loaded.design, imported.classes);
      if ("ok" in merge) throw new ApiError(400, "IMPORT_CLASSES", merge.reason);
      if (merge.added.length > 0 || merge.renamed.length > 0)
        await saveDesign(fetcher, merge.design, loaded.revision);
      layout = remapClassIds(layout, merge.ids);
    }
    if (target === "part") {
      const id = await createThemePart(fetcher, { title, slug, partType, layout });
      return editorUrl(id, THEME_PARTS_COLLECTION);
    }
    return editorUrl(await createPage(fetcher, { title, slug, layout }));
  };

  return (
    <CreateDialog
      name="import-elementor"
      heading="Import from Elementor"
      noun={target === "part" ? "theme part" : "page"}
      emptyTitle="Enter a title."
      slugPrefix={target === "part" ? `${partType}-` : ""}
      slugHint={
        target === "part"
          ? "Tells theme parts apart. Theme parts have no public address."
          : "The page's address on your site."
      }
      submitLabel="Import"
      open={open}
      onOpenChange={onOpenChange}
      create={create}
      {...(result?.ok && result.title ? { suggestedTitle: result.title } : {})}
    >
      <div className="emvb-import-source">
        <p className="emvb-helper">
          In Elementor, export the page or template (Templates → Saved Templates → Export), then
          choose the .json file or paste its contents. You see what will be kept before anything is
          created.
        </p>
        <div className="emvb-import-row">
          <Button
            type="button"
            variant="secondary"
            className={BUTTON}
            icon={<FileArrowUpIcon aria-hidden="true" />}
            onClick={() => fileRef.current?.click()}
          >
            Choose file
          </Button>
          <span className="emvb-helper" data-emvb-import-file="">
            {fileName ?? "No file chosen"}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            data-emvb-elementor-file=""
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setFileError(undefined);
              readJsonFile(file).then(
                (text) => {
                  setFileName(file.name);
                  setJson(text);
                },
                (failure: unknown) =>
                  setFileError(
                    failure instanceof Error ? failure.message : "Couldn't read that file.",
                  ),
              );
            }}
          />
        </div>
        {fileError && (
          <p className="emvb-inline-error" role="alert">
            {fileError}
          </p>
        )}
        <label htmlFor="emvb-elementor-json" className="emvb-import-label">
          Or paste the JSON
        </label>
        <textarea
          id="emvb-elementor-json"
          className={`${FIELD} emvb-import-json`}
          rows={4}
          spellCheck={false}
          value={json}
          placeholder='{"version": "0.4", "type": "page", "content": [...]}'
          onChange={(event) => {
            setFileName(undefined);
            setJson(event.target.value);
          }}
        />
        <div className="emvb-import-row">
          <Button
            type="button"
            variant="secondary"
            className={BUTTON}
            onClick={() => kitRef.current?.click()}
          >
            {kitName ? "Change site kit" : "Add site kit"}
          </Button>
          <span className="emvb-helper" data-emvb-import-kit="">
            {kitName
              ? `${kitName}: global colours and fonts come from your kit.`
              : "Optional: your kit's site-settings.json gives exact global colours and fonts."}
          </span>
          <input
            ref={kitRef}
            type="file"
            accept="application/json,.json"
            hidden
            data-emvb-elementor-kit=""
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              readJsonFile(file)
                .then((text) => {
                  const parsed = JSON.parse(text) as unknown;
                  const settings =
                    typeof parsed === "object" && parsed !== null && "settings" in parsed
                      ? (parsed as { settings: unknown }).settings
                      : parsed;
                  const isKit =
                    typeof settings === "object" &&
                    settings !== null &&
                    // Elementor 3 kits carry global colours and fonts; Elementor 4 kits may only
                    // carry custom CSS and breakpoints (their classes ride in each export).
                    ["system_colors", "system_typography", "custom_css", "active_breakpoints"].some(
                      (key) => key in settings,
                    );
                  if (!isKit)
                    throw new Error("That isn't an Elementor site kit (site-settings.json).");
                  setKit(parsed);
                  setKitName(file.name);
                  setKitError(undefined);
                })
                .catch((failure: unknown) =>
                  setKitError(
                    failure instanceof SyntaxError
                      ? "That file isn't valid JSON."
                      : failure instanceof Error
                        ? failure.message
                        : "Couldn't read that file.",
                  ),
                );
            }}
          />
        </div>
        {kitError && (
          <p className="emvb-inline-error" role="alert">
            {kitError}
          </p>
        )}
        {(missingSvgs.length > 0 || svgStatus) && (
          <div className="emvb-import-row" data-emvb-import-svgs="">
            <Button
              type="button"
              variant="secondary"
              className={BUTTON}
              disabled={fetching || missingSvgs.length === 0}
              onClick={() => void fetchSvgs()}
            >
              {fetching ? "Fetching…" : "Fetch SVG files"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className={BUTTON}
              disabled={missingSvgs.length === 0}
              onClick={() => svgRef.current?.click()}
            >
              Add SVG files
            </Button>
            <span className="emvb-helper" role="status">
              {svgStatus ??
                `${missingSvgs.length} SVG ${missingSvgs.length === 1 ? "file" : "files"} can become icons you can recolour. Fetch them from your old site, or add the .svg files.`}
            </span>
            <input
              ref={svgRef}
              type="file"
              accept="image/svg+xml,.svg"
              multiple
              hidden
              data-emvb-elementor-svgs=""
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = "";
                if (files.length > 0) void addSvgs(files);
              }}
            />
          </div>
        )}
        <ImportImageCopies
          key={session}
          fetcher={fetcher}
          images={oldImages}
          onCopied={(done) => setCopies((current) => new Map([...current, ...done]))}
          dataAttribute="data-emvb-elementor-images"
        />
        <ImportPageLinks
          ids={linkedPages}
          links={pageLinks}
          pages={pages}
          onChange={(id, address) => setPageLinks((current) => ({ ...current, [id]: address }))}
        />
        <Checkbox
          label="Give unstyled widgets Elementor's default colours and fonts"
          checked={defaults}
          onCheckedChange={(checked: boolean) => setDefaults(checked)}
        />
        <Checkbox
          label="Add Elementor's classes to my site's classes"
          checked={useClasses}
          onCheckedChange={(checked: boolean) => setUseClasses(checked)}
        />
        {target === "part" && (
          <Select
            label="Type"
            className={FIELD}
            value={partType}
            onValueChange={(value) =>
              setPartType(THEME_PART_TYPES.find((type) => type === value) ?? "section")
            }
            renderValue={(value: unknown) =>
              THEME_PART_TYPE_LABELS[value as ThemePartType] ?? String(value)
            }
          >
            {THEME_PART_TYPES.map((type) => (
              <Select.Option key={type} value={type}>
                {THEME_PART_TYPE_LABELS[type]}
              </Select.Option>
            ))}
          </Select>
        )}
        <ElementorReport result={result} {...(target === "part" ? { partType } : {})} />
      </div>
    </CreateDialog>
  );
}
