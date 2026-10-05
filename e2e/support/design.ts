import { expect, type APIRequestContext } from "@playwright/test";
import { api } from "./api.ts";

export type DesignDoc = {
  schemaVersion: number;
  variables: {
    colors: { id: string; name: string; value: string }[];
    fonts?: { id: string; name: string; value: string }[];
    fontSizes?: { id: string; name: string; value: { value: number; unit: string } }[];
    spacings?: { id: string; name: string; value: { value: number; unit: string } }[];
  };
  classes?: {
    id: string;
    name: string;
    style: Record<string, unknown>;
    states?: Record<string, Record<string, unknown>>;
  }[];
};

export async function loadDesign(request: APIRequestContext) {
  const current = await api(request, "GET", "/_emdash/api/plugins/emvb/design");
  return current.json?.["data"] as { design: DesignDoc; revision: string | null };
}

type DraftDoc = {
  design: DesignDoc;
  revision: string | null;
  publishedRevision: string | null;
};

/** The style draft the editor saves to (W-100); `loadDesign` reads the published design. */
export async function loadDraft(request: APIRequestContext): Promise<DraftDoc> {
  const current = await api(request, "GET", "/_emdash/api/plugins/emvb/design/draft");
  return current.json?.["data"] as DraftDoc;
}

export async function publishStyles(request: APIRequestContext, publishedRevision: string | null) {
  const published = await api(request, "POST", "/_emdash/api/plugins/emvb/design/publish", {
    publishedRevision,
  });
  expect(published.status).toBe(200);
  return published;
}

/** Saves a draft and publishes it, so callers still see the change on the public site. */
async function saveAndPublish(request: APIRequestContext, design: DesignDoc) {
  const data = await loadDraft(request);
  await saveDesign(request, design, data.revision);
  await publishStyles(request, data.publishedRevision);
}

export async function saveDesign(
  request: APIRequestContext,
  design: DesignDoc,
  revision: string | null,
) {
  const saved = await api(request, "POST", "/_emdash/api/plugins/emvb/design/save", {
    design,
    revision,
  });
  expect(saved.status).toBe(200);
  return saved;
}

export async function setColor(request: APIRequestContext, variable: string, value: string | null) {
  const data = await loadDraft(request);
  const colors = data.design.variables.colors.filter((c) => c.id !== variable);
  if (value !== null) colors.push({ id: variable, name: variable, value });
  await saveAndPublish(request, {
    ...data.design,
    variables: { ...data.design.variables, colors },
  });
}

/** Removes every colour variable with this name from the draft and publishes, so a test leaves no trace. */
export async function removeColorsNamed(request: APIRequestContext, name: string) {
  const data = await loadDraft(request);
  const colors = data.design.variables.colors.filter((c) => c.name !== name);
  if (colors.length === data.design.variables.colors.length) return;
  await saveAndPublish(request, {
    ...data.design,
    variables: { ...data.design.variables, colors },
  });
}

/** Sets one spacing variable, or removes it when `value` is null. */
export async function setSpacing(
  request: APIRequestContext,
  variable: string,
  value: number | null,
) {
  const data = await loadDraft(request);
  const spacings = (data.design.variables.spacings ?? []).filter((s) => s.id !== variable);
  if (value !== null) spacings.push({ id: variable, name: variable, value: { value, unit: "px" } });
  await saveAndPublish(request, {
    ...data.design,
    variables: { ...data.design.variables, spacings },
  });
}

export async function setClass(
  request: APIRequestContext,
  id: string,
  next: {
    name: string;
    style: Record<string, unknown>;
    states?: Record<string, Record<string, unknown>>;
  } | null,
) {
  const data = await loadDraft(request);
  const classes = (data.design.classes ?? []).filter((c) => c.id !== id);
  if (next !== null) classes.push({ id, ...next });
  await saveAndPublish(request, { ...data.design, classes });
}
