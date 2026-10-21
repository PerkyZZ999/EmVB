import { PLUGIN_ID } from "../constants.ts";
import type { SavedSection, SavedSectionRecord, SavedSectionSummary } from "../core/index.ts";
import { requestJson, type Fetcher } from "./api.ts";

export type { SavedSectionSummary };

const BASE = `/_emdash/api/plugins/${PLUGIN_ID}/saved-sections`;

/** My sections, newest first (W-876). */
export async function listSavedSections(fetcher: Fetcher): Promise<SavedSectionSummary[]> {
  const data = await requestJson<{ items?: SavedSectionSummary[] }>(fetcher, BASE);
  return data?.items ?? [];
}

/** One section, read and upgraded by the server. */
export async function getSavedSection(fetcher: Fetcher, id: string): Promise<SavedSection> {
  const data = await requestJson<{ section: SavedSection }>(fetcher, `${BASE}/get`, {
    method: "POST",
    body: { id },
  });
  return data.section;
}

/** Stores a snapshot; the server checks it again whatever the browser sent. */
export async function saveSavedSection(
  fetcher: Fetcher,
  record: SavedSectionRecord,
): Promise<string> {
  const data = await requestJson<{ id: string }>(fetcher, `${BASE}/save`, {
    method: "POST",
    body: { record },
  });
  return data.id;
}

export async function renameSavedSection(
  fetcher: Fetcher,
  id: string,
  name: string,
): Promise<SavedSectionSummary> {
  const data = await requestJson<{ item: SavedSectionSummary }>(fetcher, `${BASE}/rename`, {
    method: "POST",
    body: { id, name },
  });
  return data.item;
}

/** Pages that already hold a copy keep it. */
export async function deleteSavedSection(fetcher: Fetcher, id: string): Promise<void> {
  await requestJson(fetcher, `${BASE}/delete`, { method: "POST", body: { id } });
}
