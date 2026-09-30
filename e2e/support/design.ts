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
  const data = await loadDesign(request);
  const colors = data.design.variables.colors.filter((c) => c.id !== variable);
  if (value !== null) colors.push({ id: variable, name: variable, value });
  await saveDesign(
    request,
    { ...data.design, variables: { ...data.design.variables, colors } },
    data.revision,
  );
}

/** Sets one spacing variable, or removes it when `value` is null. */
export async function setSpacing(
  request: APIRequestContext,
  variable: string,
  value: number | null,
) {
  const data = await loadDesign(request);
  const spacings = (data.design.variables.spacings ?? []).filter((s) => s.id !== variable);
  if (value !== null) spacings.push({ id: variable, name: variable, value: { value, unit: "px" } });
  await saveDesign(
    request,
    { ...data.design, variables: { ...data.design.variables, spacings } },
    data.revision,
  );
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
  const data = await loadDesign(request);
  const classes = (data.design.classes ?? []).filter((c) => c.id !== id);
  if (next !== null) classes.push({ id, ...next });
  await saveDesign(request, { ...data.design, classes }, data.revision);
}
