/**
 * An entry's publish state as the editor and lists show it. A published entry with a saved draft
 * on top (`draftRevisionId`) is "changed": its page still shows the last published version
 * (W-190).
 */
export function entryStatus(
  item: { status?: string; draftRevisionId?: string | null } | undefined,
) {
  const status = item?.status ?? "draft";
  return status === "published" && item?.draftRevisionId ? "changed" : status;
}

export function statusLabel(status: string): string {
  if (status === "published") return "Published";
  if (status === "changed") return "Changes not published";
  return "Draft";
}
