import { afterEach, describe, expect, test } from "bun:test";
import { s1Page } from "../fixtures/layouts.ts";
import { createTestRuntime, ROLES } from "./runtime.ts";

let t: Awaited<ReturnType<typeof createTestRuntime>>;
afterEach(async () => {
  await t.dispose();
});

const actor = (role: number) => ({ id: `user-${role}`, role });
const badLayout = () => ({
  ...s1Page(),
  root: {
    ...s1Page().root,
    children: [{ id: "abcd1234", type: "heading", props: { text: "x", level: 9 } }],
  },
});

async function setUp(listed = true) {
  t = await createTestRuntime({ canvasCollections: listed ? ["pages"] : [] });
  await t.createHostPages();
}
const create = (data: Record<string, unknown>, role: number = ROLES.editor) =>
  t.runtime.handleContentCreate("pages", { data, actor: actor(role) });
const update = (id: string, data: Record<string, unknown>, role: number) =>
  t.runtime.handleContentUpdate("pages", id, { data, actor: actor(role) } as never);
const idOf = (r: unknown) => (r as { data: { item: { id: string } } }).data.item.id;
const message = (r: { success: boolean; error?: { message: string } }) =>
  r.success ? "" : (r.error?.message ?? "");

describe("emvb:canvas fields in canvasCollections (W-898)", () => {
  test("an editor saves a valid layout; an invalid one is refused with its path", async () => {
    await setUp();
    expect((await create({ title: "Home", canvas: s1Page() })).success).toBe(true);
    const bad = await create({ title: "Bad", canvas: badLayout() });
    expect(bad).toMatchObject({ success: false, error: { code: "SAVE_REJECTED" } });
    expect(message(bad)).toContain("root.children[0].props.level");
  });

  test("only the emvb:canvas field is validated, and only in listed collections", async () => {
    await setUp();
    expect((await create({ title: "N", notes: badLayout() })).success).toBe(true);
    await t.dispose();
    await setUp(false);
    expect((await create({ title: "Off", canvas: badLayout() })).success).toBe(true);
  });

  test("an author can't clear, wipe or change the field, but can edit the rest", async () => {
    await setUp();
    const id = idOf(await create({ title: "Home", canvas: s1Page() }));
    const wipes = [null, "", { ...s1Page(), root: { ...s1Page().root, children: [] } }];
    const results = await Promise.all(
      wipes.map((canvas) => update(id, { title: "Home", canvas }, ROLES.author)),
    );
    for (const r of results) {
      expect(r).toMatchObject({ success: false, error: { code: "SAVE_REJECTED" } });
      expect(message(r)).toContain("Only editors and administrators can change an EmVB layout");
    }
    expect((await update(id, { title: "Renamed", canvas: s1Page() }, ROLES.author)).success).toBe(
      true,
    );
    expect((await update(id, { title: "Again" }, ROLES.author)).success).toBe(true);
  });

  test("an author can't create an entry with a layout; an editor can clear one", async () => {
    await setUp();
    const r = await create({ title: "Mine", canvas: s1Page() }, ROLES.author);
    expect(message(r)).toContain("Only editors and administrators can change an EmVB layout");
    const id = idOf(await create({ title: "Home", canvas: s1Page() }));
    expect((await update(id, { title: "Home", canvas: null }, ROLES.editor)).success).toBe(true);
  });
});

describe("agent publishing of host entries with an EmVB layout (W-899)", () => {
  type Publish = (
    c: string,
    id: string,
    o: Record<string, unknown>,
  ) => Promise<{ success: boolean; error?: { message: string } }>;
  const publish = (id: string, viaMcp: boolean) =>
    (t.runtime as unknown as { handleContentPublish: Publish }).handleContentPublish("pages", id, {
      ...(viaMcp ? { origin: { source: "mcp" } } : {}),
      actor: { id: "u", role: ROLES.editor, ...(viaMcp ? { source: "mcp" } : {}) },
    });

  test("an agent can't publish an entry holding a layout unless agents may publish", async () => {
    await setUp();
    await t.agentSettings();
    const id = idOf(await create({ title: "Home", canvas: s1Page() }));
    const blocked = await publish(id, true);
    expect(blocked.success).toBe(false);
    expect(blocked.error?.message ?? "").toContain("Agents may not publish");
    expect((await publish(id, false)).success).toBe(true);
    await t.agentSettings({ publishPages: true });
    expect((await publish(id, true)).success).toBe(true);
  });

  test("an entry without a layout, or an unlisted collection, isn't held back", async () => {
    await setUp();
    await t.agentSettings();
    const plain = idOf(await create({ title: "Plain" }));
    expect((await publish(plain, true)).success).toBe(true);
    await t.dispose();
    await setUp(false);
    await t.agentSettings();
    const other = idOf(await create({ title: "Off", canvas: s1Page() }));
    expect((await publish(other, true)).success).toBe(true);
  });
});
