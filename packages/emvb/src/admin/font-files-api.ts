import { PLUGIN_ID } from "../constants.ts";
import { bytesToBase64, fontFileProblem, type FontFace } from "../core/index.ts";
import { requestJson, type Fetcher } from "./api.ts";

const BASE = `/_emdash/api/plugins/${PLUGIN_ID}`;

/**
 * Uploads a WOFF2 file (W-1072). It is checked here first, so a refused file says why at once;
 * the server checks it again. Answers the URL the font is served from.
 */
export async function uploadFontFile(fetcher: Fetcher, file: File): Promise<{ url: string }> {
  if (!/\.woff2$/i.test(file.name)) throw new Error("Choose a .woff2 font file.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const problem = fontFileProblem(bytes);
  if (problem) throw new Error(problem);
  const data = await requestJson<{ file: { url: string } }>(fetcher, `${BASE}/fonts/upload`, {
    method: "POST",
    body: { name: file.name, data: bytesToBase64(bytes) },
  });
  return { url: data.file.url };
}

/** Self-hosts one weight and style of a Google font; answers its faces (W-1072). */
export async function importGoogleFont(
  fetcher: Fetcher,
  request: {
    family: string;
    weight: number;
    style: "normal" | "italic";
    subsets: readonly string[];
  },
): Promise<FontFace[]> {
  const data = await requestJson<{ faces: FontFace[] }>(fetcher, `${BASE}/fonts/google`, {
    method: "POST",
    body: request,
  });
  return data.faces;
}
