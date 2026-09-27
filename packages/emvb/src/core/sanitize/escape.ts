const TEXT_ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const ATTR_ENTITIES: Record<string, string> = { ...TEXT_ENTITIES, '"': "&quot;", "'": "&#39;" };

export function escapeText(value: string): string {
  return value.replace(/[&<>]/g, (ch) => TEXT_ENTITIES[ch] ?? ch);
}

export function escapeAttr(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ATTR_ENTITIES[ch] ?? ch);
}
