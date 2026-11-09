/**
 * W-934 e2e: a stand-in for a person's agent command. `emvb-mcp watch` runs it with the brief on
 * stdin and EMVB_* set; it answers the request the way a real agent would, through the tools.
 */
import { httpRemote } from "../../packages/emvb-mcp/src/remote.ts";

const brief = await new Response(Bun.stdin.stream()).text();
const site = process.env["EMVB_SITE"] ?? "";
const pageId = process.env["EMVB_PAGE_ID"] ?? "";
const requestId = process.env["EMVB_REQUEST_ID"] ?? "";
const asked = /<request>\n([\s\S]*?)\n<\/request>/.exec(brief)?.[1] ?? "";
const remote = httpRemote(
  new URL("/_emdash/api/mcp", site),
  process.env["EMVB_TOKEN"] ?? "",
  "e2e",
);
const outline = (await remote.call("emvb__list_page_outline", { pageId })).structuredContent as {
  baseRevision: string;
  baseDesignRevision: string | null;
};
const result = await remote.call("emvb__propose_changes", {
  pageId,
  baseRevision: outline.baseRevision,
  baseDesignRevision: outline.baseDesignRevision,
  requestId,
  ops: [{ kind: "update", id: "head0001", set: { props: { text: `Done: ${asked}` } } }],
});
await remote.close();
process.exit(result.isError ? 1 : 0);
