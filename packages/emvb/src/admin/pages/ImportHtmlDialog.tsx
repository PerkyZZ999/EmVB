import { Button, Select } from "@cloudflare/kumo";
import { FileArrowUpIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  importHtml,
  MAX_HTML_IMPORT_CHARS,
  THEME_PART_TYPE_LABELS,
  THEME_PART_TYPES,
  type ThemePartType,
} from "../../core/index.ts";
import { THEME_PARTS_COLLECTION } from "../../constants.ts";
import { ApiError, type Fetcher } from "../api.ts";
import { createPage } from "../content-api.ts";
import { editorUrl } from "../editor/exit.ts";
import { createThemePart } from "../theme-api.ts";
import { BUTTON, FIELD } from "../ui.ts";
import { CreateDialog } from "./CreateDialog.tsx";
import { type Copy, ImportImageCopies } from "./ImportImageCopies.tsx";
import { ImportReport } from "./ImportReport.tsx";

/** Reads a chosen file as text, refusing one larger than the importer reads. */
async function readHtmlFile(file: File): Promise<string> {
  if (file.size > MAX_HTML_IMPORT_CHARS)
    throw new Error("This file is larger than 4 MB. Import one page at a time.");
  return file.text();
}

/**
 * Import HTML (W-1074): paste a WordPress post's block markup (Code editor) or choose or paste
 * any HTML page, see what will be kept, changed or left out, then create a draft page (or theme
 * part) and open it. Nothing is fetched from an address: the person pastes or uploads it.
 */
export function ImportHtmlDialog({
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
  const [html, setHtml] = React.useState("");
  const [fileName, setFileName] = React.useState<string>();
  const [fileError, setFileError] = React.useState<string>();
  const [partType, setPartType] = React.useState<ThemePartType>("section");
  const [copies, setCopies] = React.useState<ReadonlyMap<string, Copy>>(new Map());
  const [session, setSession] = React.useState(0);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setHtml("");
      setFileName(undefined);
      setFileError(undefined);
      setPartType("section");
      setCopies(new Map());
      setSession((n) => n + 1);
    }
  }

  const run = React.useCallback(
    () => importHtml(html, { media: (url: string) => copies.get(url) }),
    [html, copies],
  );
  const result = React.useMemo(() => (html.trim() ? run() : undefined), [html, run]);
  const oldImages = result?.ok ? result.images.filter((url) => !copies.has(url)) : [];

  const create = async (title: string, slug: string) => {
    const imported = html.trim() ? run() : undefined;
    if (!imported?.ok) {
      throw new ApiError(
        400,
        "IMPORT_EMPTY",
        imported ? imported.error : "Choose or paste some HTML first.",
      );
    }
    if (target === "part") {
      const id = await createThemePart(fetcher, { title, slug, partType, layout: imported.layout });
      return editorUrl(id, THEME_PARTS_COLLECTION);
    }
    return editorUrl(await createPage(fetcher, { title, slug, layout: imported.layout }));
  };

  return (
    <CreateDialog
      name="import-html"
      heading="Import from WordPress or HTML"
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
          From WordPress, open the post or page, switch to the Code editor (⋮ → Code editor) and
          copy everything. Or choose an .html file, or paste any page&apos;s source. You see what
          will be kept before anything is created.
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
            accept="text/html,.html,.htm,text/plain,.txt"
            hidden
            data-emvb-html-file=""
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setFileError(undefined);
              readHtmlFile(file).then(
                (text) => {
                  setFileName(file.name);
                  setHtml(text);
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
        <label htmlFor="emvb-import-html" className="emvb-import-label">
          Or paste the HTML
        </label>
        <textarea
          id="emvb-import-html"
          className={`${FIELD} emvb-import-json`}
          rows={4}
          spellCheck={false}
          value={html}
          placeholder="<!-- wp:paragraph --><p>…</p><!-- /wp:paragraph -->"
          onChange={(event) => {
            setFileName(undefined);
            setHtml(event.target.value);
          }}
        />
        <ImportImageCopies
          key={session}
          fetcher={fetcher}
          images={oldImages}
          onCopied={(done) => setCopies((current) => new Map([...current, ...done]))}
          dataAttribute="data-emvb-html-images"
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
        <ImportReport
          result={result}
          summary={
            result?.ok
              ? `Ready to import ${result.mapped} of ${result.elements} ${result.source === "wordpress" ? "WordPress blocks" : "HTML elements"}` +
                (target === "part"
                  ? ` as a ${THEME_PART_TYPE_LABELS[partType].toLowerCase()}.`
                  : ".")
              : ""
          }
        />
      </div>
    </CreateDialog>
  );
}
