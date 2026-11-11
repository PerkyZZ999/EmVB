/**
 * W-986: the warm e2e lanes' probe. The seeded-bug runner copies this file into its own e2e
 * worktree, as `demos/node/src/pages/seed-probe.ts`, before it starts that worktree's dev server.
 * It is never part of the demo itself, never in a package, and answers only in dev.
 *
 *   GET /seed-probe?path=<absolute file>&path=…
 *     → { instance, files: { [path]: "<generation>" | "error: …" } }
 *
 * `instance` changes whenever this module is evaluated again (a dev server restart, say).
 * A file's generation goes up each time the server's module runner gives this probe a newly
 * evaluated module for it, which happens only after the dev server has picked up a change to that
 * file or to anything it imports. So the runner can prove that the server sees a seed's mutation
 * before it runs the seed's test, and sees the restore before the next seed.
 */
const instance = crypto.randomUUID();
const seen = new Map<string, { module: unknown; generation: number }>();

export const prerender = false;

export async function GET({ url }: { url: URL }): Promise<Response> {
  const env = (import.meta as { env?: { DEV?: boolean } }).env;
  if (!env?.DEV) return new Response(null, { status: 404 });
  const files: Record<string, string> = {};
  for (const path of url.searchParams.getAll("path")) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one module per edited file, a handful
      const module: unknown = await import(/* @vite-ignore */ path);
      const before = seen.get(path);
      const generation =
        before === undefined
          ? 0
          : before.module === module
            ? before.generation
            : before.generation + 1;
      seen.set(path, { module, generation });
      files[path] = String(generation);
    } catch (error) {
      files[path] = `error: ${String(error).slice(0, 200)}`;
    }
  }
  return Response.json({ instance, files });
}
