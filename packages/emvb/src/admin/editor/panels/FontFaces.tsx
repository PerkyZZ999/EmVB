import { Button, Checkbox, Input } from "@cloudflare/kumo";
import { TrashIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  FONT_FAMILY_NAME,
  fontFaceRules,
  GOOGLE_FAMILY,
  GOOGLE_WEIGHTS,
  type FontFace,
  type FontVariable,
} from "../../../core/index.ts";
import type { Fetcher } from "../../api.ts";
import { importGoogleFont, uploadFontFile } from "../../font-files-api.ts";
import { BUTTON, FIELD } from "../../ui.ts";
import { InlineError } from "./inline-error.tsx";
import { PanelSelect } from "./settings/PanelSelect.tsx";

const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin",
  200: "Extra light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra bold",
  900: "Black",
};

/** Subsets offered for Google fonts besides Latin, which is always downloaded. */
const EXTRA_SUBSETS = [
  { value: "latin-ext", label: "Latin Extended" },
  { value: "cyrillic", label: "Cyrillic" },
  { value: "greek", label: "Greek" },
  { value: "vietnamese", label: "Vietnamese" },
] as const;

const faceLabel = (weight: number, style: string) =>
  `${WEIGHT_NAMES[weight] ?? "Weight"} ${weight}${style === "italic" ? " italic" : ""}`;

/** The first family of a font stack, unquoted, when it can name a custom font. */
function firstFamily(stack: string): string {
  const first = (stack.split(",")[0] ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
  return FONT_FAMILY_NAME.test(first) ? first : "";
}

/** The stack with `family` first (quoted), unless it already starts with it. */
export function stackWithFamily(stack: string, family: string): string {
  if (firstFamily(stack) === family) return stack;
  const next = `'${family}', ${stack}`;
  return next.length <= 200 ? next : `'${family}', sans-serif`;
}

/** Faces of one weight and style replace the ones the variable had for it. */
function mergeFaces(current: readonly FontFace[], added: readonly FontFace[]): FontFace[] {
  const replaced = new Set(added.map((face) => `${face.weight}/${face.style}`));
  return [...current.filter((face) => !replaced.has(`${face.weight}/${face.style}`)), ...added];
}

/**
 * W-1072: a font variable's own font files. Uploaded WOFF2 files, or a Google font downloaded
 * once by the server, are served from this site, so pages make no request to another host.
 */
export function FontFaces({
  font,
  fetcher,
  onSave,
}: {
  font: FontVariable;
  fetcher: Fetcher;
  onSave: (next: FontVariable) => Promise<boolean | void>;
}) {
  const id = React.useId();
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [family, setFamily] = React.useState(font.family ?? firstFamily(font.value));
  const [weight, setWeight] = React.useState("400");
  const [style, setStyle] = React.useState<"normal" | "italic">("normal");
  const [google, setGoogle] = React.useState(font.source === "google" ? (font.family ?? "") : "");
  const [weights, setWeights] = React.useState<number[]>([400, 700]);
  const [italic, setItalic] = React.useState(false);
  const [subsets, setSubsets] = React.useState<string[]>(["latin-ext"]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const faces = font.faces ?? [];
  const groups = [...new Set(faces.map((face) => `${face.weight}/${face.style}`))].map((key) => {
    const [w, s] = key.split("/");
    return {
      weight: Number(w),
      style: s ?? "normal",
      files: faces.filter((f) => `${f.weight}/${f.style}` === key).length,
    };
  });

  const save = async (next: FontVariable, message: string) => {
    if ((await onSave(next)) === false) return;
    setDone(message);
  };

  const upload = async (file: File) => {
    const name = (font.family ?? family).trim();
    if (!FONT_FAMILY_NAME.test(name)) {
      setError("Name the font family first: letters, digits, spaces, _ . or -.");
      return;
    }
    setError(null);
    setDone(null);
    setBusy("Uploading…");
    try {
      const { url } = await uploadFontFile(fetcher, file);
      const face: FontFace = { weight: Number(weight), style, src: url };
      const sameFamily = font.family === name;
      await save(
        {
          ...font,
          value: stackWithFamily(font.value, name),
          family: name,
          faces: mergeFaces(sameFamily ? faces : [], [face]),
          source: "upload",
        },
        `Added ${faceLabel(face.weight, face.style)}.`,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn't upload the font.");
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    const name = google.trim().replace(/\s+/g, " ");
    if (!GOOGLE_FAMILY.test(name)) {
      setError("Type a Google Fonts family name, such as Open Sans.");
      return;
    }
    if (weights.length === 0) {
      setError("Pick at least one weight.");
      return;
    }
    setError(null);
    setDone(null);
    const styles: ("normal" | "italic")[] = italic ? ["normal", "italic"] : ["normal"];
    const wanted = weights.flatMap((w) => styles.map((s) => ({ weight: w, style: s })));
    let added: FontFace[] = [];
    try {
      // One weight and style per request keeps each server call small (Workers limits).
      for (const [index, face] of wanted.entries()) {
        setBusy(`Downloading ${index + 1} of ${wanted.length}…`);
        // oxlint-disable-next-line no-await-in-loop -- one request at a time, with progress
        const got = await importGoogleFont(fetcher, {
          family: name,
          ...face,
          subsets: ["latin", ...subsets],
        });
        added = mergeFaces(added, got);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn't download the font.");
      setBusy(null);
      return;
    }
    setBusy(null);
    await save(
      {
        ...font,
        value: stackWithFamily(font.value, name),
        family: name,
        faces: mergeFaces(font.family === name ? faces : [], added),
        source: "google",
      },
      `Downloaded ${name}. Pages load it from this site.`,
    );
  };

  const removeFace = (w: number, s: string) => {
    const left = faces.filter((face) => !(face.weight === w && face.style === s));
    const { family: _family, faces: _faces, source: _source, ...plain } = font;
    void save(left.length > 0 ? { ...font, faces: left } : plain, `Removed ${faceLabel(w, s)}.`);
  };

  const previewCss = fontFaceRules(font).join("");
  return (
    <div className="emvb-site-item-body emvb-font-faces" data-emvb-font-faces="">
      {previewCss ? <style>{previewCss}</style> : null}
      <h4 className="emvb-bind-label">Custom font</h4>
      {font.family && groups.length > 0 ? (
        <>
          <p className="emvb-helper" data-emvb-font-family="">
            {`${font.family} · ${font.source === "google" ? "from Google Fonts, " : ""}served by this site`}
          </p>
          <ul className="emvb-font-face-list" data-emvb-font-face-list="">
            {groups.map((group) => (
              <li
                key={`${group.weight}/${group.style}`}
                data-emvb-font-face={`${group.weight}/${group.style}`}
              >
                <span
                  style={{
                    fontFamily: `'${font.family}'`,
                    fontWeight: group.weight,
                    fontStyle: group.style,
                  }}
                >
                  {faceLabel(group.weight, group.style)}
                </span>
                {group.files > 1 ? (
                  <span className="emvb-helper">{` · ${group.files} files`}</span>
                ) : null}
                <button
                  type="button"
                  className="emvb-site-menu-btn"
                  aria-label={`Remove ${faceLabel(group.weight, group.style)}`}
                  onClick={() => removeFace(group.weight, group.style)}
                >
                  <TrashIcon size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="emvb-helper">
          Upload WOFF2 files or download a Google font. Pages load it from this site only.
        </p>
      )}
      {!font.family && (
        <Input
          label="Font family name"
          className={FIELD}
          value={family}
          data-emvb-font-family-input=""
          onChange={(event) => setFamily(event.target.value)}
        />
      )}
      <div className="emvb-font-face-row">
        <PanelSelect
          label="Weight"
          value={weight}
          data={{ "data-emvb-font-weight": "" }}
          options={GOOGLE_WEIGHTS.map((w) => ({ value: String(w), label: faceLabel(w, "normal") }))}
          onChange={setWeight}
        />
        <PanelSelect
          label="Style"
          value={style}
          data={{ "data-emvb-font-style": "" }}
          options={[
            { value: "normal", label: "Normal" },
            { value: "italic", label: "Italic" },
          ]}
          onChange={(value) => setStyle(value === "italic" ? "italic" : "normal")}
        />
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={BUTTON}
        icon={<UploadSimpleIcon size={14} aria-hidden="true" />}
        disabled={busy !== null}
        onClick={() => fileRef.current?.click()}
      >
        Upload WOFF2
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".woff2,font/woff2"
        hidden
        data-emvb-font-upload=""
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      <h4 className="emvb-bind-label" id={`${id}-google`}>
        Google font
      </h4>
      <Input
        label="Family"
        className={FIELD}
        placeholder="Open Sans"
        value={google}
        data-emvb-font-google=""
        onChange={(event) => setGoogle(event.target.value)}
      />
      <fieldset className="emvb-font-weights" aria-labelledby={`${id}-google`}>
        <legend className="emvb-bind-label">Weights</legend>
        {GOOGLE_WEIGHTS.map((w) => (
          <Checkbox
            key={w}
            label={String(w)}
            checked={weights.includes(w)}
            onCheckedChange={(checked) =>
              setWeights((now) =>
                checked
                  ? [...new Set([...now, w])].toSorted((a, b) => a - b)
                  : now.filter((x) => x !== w),
              )
            }
          />
        ))}
      </fieldset>
      <Checkbox label="Italic too" checked={italic} onCheckedChange={setItalic} />
      <fieldset className="emvb-font-weights">
        <legend className="emvb-bind-label">Also for</legend>
        {EXTRA_SUBSETS.map((subset) => (
          <Checkbox
            key={subset.value}
            label={subset.label}
            checked={subsets.includes(subset.value)}
            onCheckedChange={(checked) =>
              setSubsets((now) =>
                checked ? [...now, subset.value] : now.filter((x) => x !== subset.value),
              )
            }
          />
        ))}
      </fieldset>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={BUTTON}
        disabled={busy !== null}
        data-emvb-font-google-go=""
        onClick={() => void download()}
      >
        Download from Google Fonts
      </Button>
      <p className="emvb-helper">
        The files are copied to this site once; visitors never contact Google. Google fonts are open
        source (mostly the SIL Open Font License), so self-hosting them is allowed.
      </p>
      <p className="emvb-helper" aria-live="polite" data-emvb-font-status="">
        {busy ?? done ?? ""}
      </p>
      {error ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}
