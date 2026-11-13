/**
 * W-1004: EmVB data across an EmDash upgrade (1.4 → 1.5: migrations 092 move plugin KV into
 * options, 095 renames plugin storage unique indexes). Against a dev server of a site with EmVB
 * set up and a `src/pages/v/[slug].astro` route (as in docs/guides/install-in-a-host-site.md):
 *
 *   bun run check:upgrade seed http://127.0.0.1:4711     # on the old EmDash
 *   (stop the server, upgrade EmDash, start it again)
 *   bun run check:upgrade verify http://127.0.0.1:4711   # on the new EmDash
 *
 * Dev servers only (it signs in with EmDash's dev bypass). Writes scratch state to
 * upgrade-check.json in the working directory.
 */
const [mode, base] = process.argv.slice(2);
let cookie = "";
async function signIn() {
  const r = await fetch(`${base}/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`, {
    redirect: "manual",
  });
  cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("no session cookie");
}
async function api(path: string, body?: unknown) {
  const r = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie,
      "X-EmDash-Request": "1",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json: any; // oxlint-disable-line typescript/no-explicit-any -- loose JSON from many routes
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: r.status, json };
}
const P = "/_emdash/api/plugins/emvb";
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>';
const design = {
  schemaVersion: 17,
  variables: { colors: [{ id: "brand", name: "Brand", value: "#123456" }] },
};
const layout = (text: string) => ({
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text, level: 1 } }],
  },
});
const results: string[] = [];
const check = (name: string, ok: boolean, detail = "") =>
  results.push(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);

await signIn();
if (mode === "seed") {
  const d = await api(`${P}/design/draft`);
  const saved = await api(`${P}/design/save`, { design, revision: d.json?.data?.revision ?? null });
  check("design saved", saved.status === 200, JSON.stringify(saved.json).slice(0, 120));
  const d2 = await api(`${P}/design/draft`);
  const pub = await api(`${P}/design/publish`, {
    publishedRevision: d2.json?.data?.publishedRevision ?? null,
  });
  check("design published", pub.status === 200, String(pub.status));
  const icon = await api(`${P}/icons/upload`, { name: "square", svg });
  check("icon uploaded", icon.status === 200, JSON.stringify(icon.json).slice(0, 120));
  const page = await api(`/_emdash/api/content/emvb_pages`, {
    data: { title: "Upgrade", layout: layout("Upgrade me") },
    slug: "upgrade",
  });
  const id = page.json?.data?.item?.id;
  check("page created", Boolean(id), JSON.stringify(page.json).slice(0, 120));
  await api(`/_emdash/api/content/emvb_pages/${id}/publish`, {});
  const req = await api(`${P}/requests/create`, {
    target: { collection: "emvb_pages", id },
    prompt: "Keep me across the upgrade",
  });
  check("request created", req.status === 200, JSON.stringify(req.json).slice(0, 120));
  const agents = await api(`${P}/agents`);
  const save = await api(`${P}/agents/save`, {
    settings: { ...agents.json?.data?.settings, mcpEnabled: true },
    revision: agents.json?.data?.revision ?? null,
  });
  check("agent settings saved", save.status === 200, JSON.stringify(save.json).slice(0, 120));
  await Bun.write("upgrade-check.json", JSON.stringify({ id }));
} else {
  const { id } = JSON.parse(await Bun.file("upgrade-check.json").text());
  const d = await api(`${P}/design`);
  check(
    "design kept",
    d.json?.data?.design?.variables?.colors?.[0]?.value === "#123456",
    JSON.stringify(d.json).slice(0, 160),
  );
  const icons = await api(`${P}/icons`);
  check(
    "icon kept",
    JSON.stringify(icons.json).includes("square"),
    JSON.stringify(icons.json).slice(0, 160),
  );
  const icon2 = await api(`${P}/icons/upload`, { name: "square again", svg });
  check("icon upload still works", icon2.status === 200, JSON.stringify(icon2.json).slice(0, 160));
  const reqs = await api(`${P}/requests`, { collection: "emvb_pages", id });
  check(
    "request kept",
    JSON.stringify(reqs.json).includes("Keep me across the upgrade"),
    JSON.stringify(reqs.json).slice(0, 160),
  );
  const agents = await api(`${P}/agents`);
  check(
    "agent settings kept (KV moved to options, migration 092)",
    agents.json?.data?.settings?.mcpEnabled === true,
    JSON.stringify(agents.json?.data?.settings).slice(0, 120),
  );
  const pub = await fetch(`${base}/v/upgrade`);
  const html = await pub.text();
  check(
    "published page renders",
    pub.status === 200 && html.includes("Upgrade me") && html.includes("#123456"),
    String(pub.status),
  );
  const newPage = await api(`/_emdash/api/content/emvb_pages`, {
    data: { title: "After", layout: layout("After the upgrade") },
    slug: `after-upgrade-${Date.now()}`,
  });
  check(
    "a new page saves",
    Boolean(newPage.json?.data?.item?.id),
    JSON.stringify(newPage.json).slice(0, 120),
  );
  const health = await api(`${P}/version`);
  check("plugin answers", health.status === 200, JSON.stringify(health.json));
}
// oxlint-disable-next-line no-console -- a CLI
console.log(results.join("\n"));
if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
