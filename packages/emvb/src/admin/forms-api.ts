import { ApiError, requestJson, type Fetcher } from "./api.ts";

export type FormListItem = { id: string; name: string; slug: string };

export type FormsCapability =
  | { status: "ready"; forms: FormListItem[]; canList: true }
  | { status: "manual"; canList: false }
  | { status: "missing" };

const LIST = "/_emdash/api/plugins/emdash-forms/forms/list";
const DEFINITION = "/_emdash/api/plugins/emdash-forms/definition";

/** Probe forms plugin + list (admin). Editors get manual-id fallback (D-015). */
export async function loadFormsCapability(fetcher: Fetcher): Promise<FormsCapability> {
  try {
    const data = await requestJson<{ items: Array<{ id: string; name: string; slug: string }> }>(
      fetcher,
      LIST,
      { method: "POST", body: {} },
    );
    return {
      status: "ready",
      canList: true,
      forms: (data.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
      })),
    };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return { status: "manual", canList: false };
    }
    // Confirm plugin presence via public definition (unknown id → form 404 from plugin).
    try {
      await requestJson(fetcher, DEFINITION, {
        method: "POST",
        body: { id: "__emvb_probe__" },
      });
      return { status: "manual", canList: false };
    } catch (inner) {
      if (inner instanceof ApiError && inner.status === 404) {
        // Ambiguous: missing plugin vs missing form. Prefer manual if message looks like form.
        const msg = inner.message.toLowerCase();
        if (msg.includes("form") || inner.code === "NOT_FOUND") {
          return { status: "manual", canList: false };
        }
      }
      if (inner instanceof ApiError && (inner.status === 410 || inner.status === 422)) {
        return { status: "manual", canList: false };
      }
      return { status: "missing" };
    }
  }
}

export type DefinitionField = {
  name: string;
  type: string;
  label: string;
  required: boolean;
};

export async function loadFormFields(
  fetcher: Fetcher,
  formId: string,
): Promise<DefinitionField[] | null> {
  if (!formId) return null;
  try {
    const data = await requestJson<{
      pages: Array<{ fields: DefinitionField[] }>;
    }>(fetcher, DEFINITION, { method: "POST", body: { id: formId } });
    return data.pages.flatMap((page) => page.fields);
  } catch {
    return null;
  }
}
