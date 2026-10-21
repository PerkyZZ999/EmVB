import { z } from "zod";
import {
  addNode,
  classMergeNotice,
  mergeSectionClasses,
  prepareSavedSection,
  snapshotSection,
  validateDesign,
  validateLayout,
  type SavedSection,
} from "../core/index.ts";
import { McpToolError } from "./errors.ts";
import type { EmvbPorts, SavedSectionsPort } from "./ports.ts";
import { queued } from "./queue.ts";
import { mutatePage, NodeIdInput, PageId, Rev, WriteOutput } from "./write.ts";

/**
 * Saved-section tools (W-875, D-060). Saves are copies; synced sections are theme parts made in
 * the editor. Inserting brings the section's classes into the site styles draft first (never
 * overwriting a class), then adds the copy to the page, each through its write queue.
 */

const SectionId = z.string().regex(/^[0-9a-f]{16}$/, "Section ids are 16 hex characters");

const portOf = (ports: EmvbPorts): SavedSectionsPort => {
  if (!ports.savedSections) {
    throw new McpToolError("NOT_SET_UP", "Saved sections aren't available on this site.");
  }
  return ports.savedSections;
};

const SectionSummary = z.object({
  id: z.string(),
  name: z.string(),
  updatedAt: z.string(),
  classCount: z.number(),
  damaged: z.literal(true).optional(),
});

export const ListSavedSectionsInput = z.strictObject({});
export const ListSavedSectionsOutput = z.object({ sections: z.array(SectionSummary) });

export const listSavedSections = async (ports: EmvbPorts) => ({
  sections: await portOf(ports).list(),
});

export const SaveSectionInput = z.strictObject({
  pageId: PageId,
  elementId: NodeIdInput,
  name: z.string().min(1).max(255),
});
export const SaveSectionOutput = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
});

export async function saveSection(ports: EmvbPorts, input: z.infer<typeof SaveSectionInput>) {
  const port = portOf(ports);
  const page = await ports.getPage(input.pageId);
  if (!page) {
    throw new McpToolError("NOT_FOUND", `No EmVB page with id ${input.pageId}. Call list_pages.`);
  }
  const layout = validateLayout(page.layout);
  if (!layout.ok) {
    throw new McpToolError(
      "INVALID_LAYOUT",
      "The stored layout can't be read. Repair it in the editor.",
    );
  }
  const { design } = await ports.getDesign();
  const now = new Date().toISOString();
  const snap = snapshotSection(layout.layout, input.elementId, design, input.name, now);
  if (!snap.ok) throw new McpToolError("REFUSED", snap.reason);
  const made = await port.create(snap.record);
  if ("ok" in made) throw new McpToolError("REFUSED", made.reason);
  const summary = `Saved ${input.elementId} as the section "${snap.record.name}"`;
  return { id: made.id, name: snap.record.name, summary };
}

async function sectionOf(port: SavedSectionsPort, id: string): Promise<SavedSection> {
  const found = await port.get(id);
  if (!found) {
    throw new McpToolError("NOT_FOUND", `No saved section ${id}. Call list_saved_sections.`);
  }
  if ("ok" in found) throw new McpToolError("REFUSED", found.reason);
  return found;
}

export const InsertSavedSectionInput = z.strictObject({
  pageId: PageId,
  sectionId: SectionId,
  parentId: NodeIdInput.optional(),
  index: z.number().int().min(0).optional(),
  expectedRev: Rev.optional(),
});
export const InsertSavedSectionOutput = WriteOutput.extend({ classes: z.string().nullable() });

export async function insertSavedSection(
  ports: EmvbPorts,
  input: z.infer<typeof InsertSavedSectionInput>,
) {
  const section = await sectionOf(portOf(ports), input.sectionId);
  const place = (root: string) => ({
    parentId: input.parentId ?? root,
    index: input.index ?? Number.MAX_SAFE_INTEGER,
  });
  return queued("styles", async () => {
    const state = await ports.getDesign();
    const page = await ports.getPage(input.pageId);
    if (!page) {
      throw new McpToolError("NOT_FOUND", `No EmVB page with id ${input.pageId}. Call list_pages.`);
    }
    // A stale rev would refuse the page write after the classes were added (W-879).
    if (input.expectedRev !== undefined && page.rev !== input.expectedRev) {
      throw new McpToolError(
        "CONFLICT",
        "The page changed since you read it. Call get_layout again and retry with its rev.",
        { rev: page.rev },
      );
    }
    const current = validateLayout(page.layout);
    if (!current.ok) {
      throw new McpToolError(
        "INVALID_LAYOUT",
        "The stored layout can't be read. Repair it in the editor.",
      );
    }
    // Dry run first, so a refused place never leaves new classes in the styles draft.
    const tried = prepareSavedSection(section, current.layout, state.design);
    if (!tried.ok) throw new McpToolError("REFUSED", tried.reason);
    const fits = addNode(current.layout, tried.node, place(current.layout.root.id));
    if (!fits.ok) throw new McpToolError("REFUSED", fits.reason);
    const merge = mergeSectionClasses(state.design, section.classes);
    if ("ok" in merge) throw new McpToolError("REFUSED", merge.reason);
    const notice = classMergeNotice(merge);
    if (notice) {
      const checked = validateDesign(merge.design);
      if (!checked.ok) throw new McpToolError("REFUSED", "The section's classes can't be added.");
      await ports.saveDesign(checked.design, state.revision);
      await ports.log({ target: "styles", tool: "insert_saved_section", summary: notice });
    }
    const design = merge.design;
    const result = await mutatePage(
      ports,
      "insert_saved_section",
      input.pageId,
      input.expectedRev,
      (layout) => {
        // The merge already in the saved styles: merging again would add "Card 3" (W-875).
        const prepared = prepareSavedSection(section, layout, design, Math.random, merge);
        if (!prepared.ok) throw new McpToolError("REFUSED", prepared.reason);
        const added = addNode(layout, prepared.node, place(layout.root.id));
        if (!added.ok) throw new McpToolError("REFUSED", added.reason);
        return {
          layout: added.layout,
          changed: [prepared.node.id],
          summary: `Added the saved section "${section.name}" as ${prepared.node.id}`,
        };
      },
    );
    return { ...result, classes: notice };
  });
}

export const DeleteSavedSectionInput = z.strictObject({ sectionId: SectionId });
export const DeleteSavedSectionOutput = z.object({ id: z.string(), summary: z.string() });

export async function deleteSavedSection(
  ports: EmvbPorts,
  input: z.infer<typeof DeleteSavedSectionInput>,
) {
  if (!(await portOf(ports).remove(input.sectionId))) {
    throw new McpToolError(
      "NOT_FOUND",
      `No saved section ${input.sectionId}. Call list_saved_sections.`,
    );
  }
  return {
    id: input.sectionId,
    summary: "Deleted the saved section. Pages that already use a copy keep it.",
  };
}
