import { ApiError, requestJson, type Fetcher } from "./api.ts";

export type FormListItem = { id: string; name: string; slug: string };

export type FormsCapability =
  | { status: "ready"; forms: FormListItem[]; canList: true }
  | { status: "manual"; canList: false }
  | { status: "missing" };

const LIST = "/_emdash/api/plugins/emdash-forms/forms/list";
const DEFINITION = "/_emdash/api/plugins/emdash-forms/definition";

const manual = (): FormsCapability => ({ status: "manual", canList: false });

/**
 * Whether a failed definition probe still shows the forms plugin is there. A 404 is ambiguous
 * (no plugin, or no such form), so it counts when it reads like the plugin's own "form not found".
 */
function probeFoundPlugin(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 404) {
    return error.code === "NOT_FOUND" || error.message.toLowerCase().includes("form");
  }
  return error.status === 410 || error.status === 422;
}

/** Asks the public definition route about a form that can't exist (unknown id → the plugin's 404). */
async function formsPluginAnswers(fetcher: Fetcher): Promise<boolean> {
  try {
    await requestJson(fetcher, DEFINITION, { method: "POST", body: { id: "__emvb_probe__" } });
    return true;
  } catch (error) {
    return probeFoundPlugin(error);
  }
}

/** Probe forms plugin + list (admin). Editors get manual-id fallback (D-015). */
export async function loadFormsCapability(fetcher: Fetcher): Promise<FormsCapability> {
  try {
    const data = await requestJson<{ items: FormListItem[] }>(fetcher, LIST, {
      method: "POST",
      body: {},
    });
    const forms = (data.items ?? []).map(({ id, name, slug }) => ({ id, name, slug }));
    return { status: "ready", canList: true, forms };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return manual();
    }
    return (await formsPluginAnswers(fetcher)) ? manual() : { status: "missing" };
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
