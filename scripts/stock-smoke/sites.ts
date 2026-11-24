/**
 * The four stock EmDash sites a release installs EmVB on (W-1084, W-1095; W-1096 in the
 * repository): EmDash 1.4.0 (the floor) and 1.5.0 (the latest), each on Node and on Cloudflare,
 * set up as the install guide says, with the packed tarballs and the hello extension.
 */

export type StockSite = {
  name: string;
  emdash: "1.4.0" | "1.5.0";
  platform: "node" | "cloudflare";
  /** The visitorCookie the site's config sets ("always" is EmVB's default), which the smoke checks. */
  cookie: "always" | "never";
  /** The forms plugin version the site installs (Node only: it pins Kumo, so 0.2.12 on 1.4). */
  forms?: string;
};

export const STOCK_SITES: readonly StockSite[] = [
  { name: "stock-14", emdash: "1.4.0", platform: "node", cookie: "never", forms: "0.2.12" },
  { name: "stock-15", emdash: "1.5.0", platform: "node", cookie: "always", forms: "0.2.13" },
  { name: "stock-14-cf", emdash: "1.4.0", platform: "cloudflare", cookie: "always" },
  { name: "stock-15-cf", emdash: "1.5.0", platform: "cloudflare", cookie: "never" },
];

/**
 * create-emdash@1.4.0 downloads templates synced from EmDash 1.5 since 2026-11-17, whose
 * search.astro and worker.ts don't type-check on 1.4: the 1.4 sites use the template it served
 * until then (synced from v1.3.0) with emdash pinned to 1.4.0.
 */
const TEMPLATE_14 = "a7bb43df40";

/**
 * The commands that create the site in `dir`'s parent, before EmVB: they need the network, so
 * stock-smoke.ts keeps the result as a template and copies it for each run.
 */
export function createCommands(site: StockSite): { cwd: "parent" | "site"; command: string[] }[] {
  const template = site.platform === "node" ? "node:blog" : "cloudflare:blog";
  const create = (version: string, install: string) => ({
    cwd: "parent" as const,
    command: [
      "npx",
      "-y",
      `create-emdash@${version}`,
      site.name,
      "--template",
      template,
      "--pm",
      "npm",
      install,
      "--yes",
    ],
  });
  const forms = site.forms
    ? [
        {
          cwd: "site" as const,
          command: [
            "npm",
            "i",
            "--no-audit",
            "--no-fund",
            `@emdash-cms/plugin-forms@${site.forms}`,
          ],
        },
      ]
    : [];
  if (site.emdash === "1.5.0") return [create("1.5.0", "--install"), ...forms];
  const repo = site.platform === "node" ? "blog" : "blog-cloudflare";
  return [
    // For its .env (the site's secrets); the template itself comes from the pinned commit.
    create("1.4.0", "--no-install"),
    {
      cwd: "parent",
      command: [
        "sh",
        "-c",
        `{ cp ${site.name}/.env ${site.name}.env 2>/dev/null || true; } && rm -rf ${site.name} && npx -y giget@latest github:emdash-cms/templates/${repo}#${TEMPLATE_14} ${site.name} && { [ ! -f ${site.name}.env ] || mv ${site.name}.env ${site.name}/.env; }`,
      ],
    },
    {
      cwd: "site",
      command: [
        "node",
        "-e",
        `const f="./package.json",j=require(f);j.name=${JSON.stringify(site.name)};j.dependencies.emdash="1.4.0";if(j.dependencies["@emdash-cms/cloudflare"])j.dependencies["@emdash-cms/cloudflare"]="1.4.0";require("fs").writeFileSync(f,JSON.stringify(j,null,2))`,
      ],
    },
    { cwd: "site", command: ["npm", "install", "--no-audit", "--no-fund"] },
    ...forms,
  ];
}

const FONTS = `	fonts: [
		{
			provider: fontProviders.google(),
			name: "Inter",
			cssVariable: "--font-body",
			weights: [400, 500, 600, 700],
			fallbacks: ["sans-serif"],
		},
		{
			provider: fontProviders.google(),
			name: "JetBrains Mono",
			cssVariable: "--font-mono",
			weights: [400, 500],
			fallbacks: ["monospace"],
		},
	],`;

const LIGHT_DARK = `	vite: {
		css: {
			// The template's own: keep light-dark() native for its footer theme switcher.
			lightningcss: { exclude: Features.LightDark },
		},
	},
`;

/** The site's astro.config.mjs: its template's, with EmVB and the extension added as the guide says. */
export function astroConfig(site: StockSite): string {
  const options = `{ extensions: [hello]${site.cookie === "never" ? ', visitorCookie: "never"' : ""} }`;
  const latest = site.emdash === "1.5.0";
  const head =
    site.platform === "node"
      ? `import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig, fontProviders } from "astro/config";
import { emvb } from "@perkyzz/emvb";
import hello from "emvb-ext-hello";
import { formsPlugin } from "@emdash-cms/plugin-forms";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";
`
      : `import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig, fontProviders } from "astro/config";
import { emvb } from "@perkyzz/emvb";
import hello from "emvb-ext-hello";
import emdash from "emdash/astro";
`;
  const emdash =
    site.platform === "node"
      ? `		emdash({
			database: sqlite({ url: "file:./data.db" }),
			storage: local({
				directory: "./uploads",
				baseUrl: "/_emdash/api/media/file",
			}),
			plugins: [formsPlugin(), emvb(${options})],
		}),`
      : `		emdash({
			database: d1({ binding: "DB", session: "auto", coalesce: true }),
			storage: r2({ binding: "MEDIA" }),
			plugins: [emvb(${options})],
		}),`;
  return `${head}${latest ? 'import { Features } from "lightningcss";\n' : ""}
export default defineConfig({
	output: "server",
	adapter: ${site.platform === "node" ? 'node({\n\t\tmode: "standalone",\n\t})' : "cloudflare()"},
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
${latest ? LIGHT_DARK : ""}	integrations: [
		react(),
${emdash}
	],
${FONTS}
	devToolbar: { enabled: false },
});
`;
}

/** The bare page route the install guide shows (`src/pages/v/[slug].astro`). */
export function route(site: StockSite): string {
  const forms = site.platform === "node";
  return `---
import { EmVBPage, resolveEmVBPage } from "@perkyzz/emvb/astro";
${forms ? 'import { EmVBFormsRuntime } from "@perkyzz/emvb/astro/forms/client";\n' : ""}import { EmVBMenuRuntime } from "@perkyzz/emvb/astro/menu";
import { EmVBTabsRuntime } from "@perkyzz/emvb/astro/tabs";

const emvb = await resolveEmVBPage(Astro);
if (!emvb) return Astro.rewrite("/404");
---

<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>EmVB page</title>
	</head>
	<body>
		<EmVBPage page={emvb}>
${forms ? "\t\t\t{emvb.needsFormsRuntime && <EmVBFormsRuntime />}\n" : ""}			{emvb.needsTabsRuntime && <EmVBTabsRuntime />}
			{emvb.needsMenuRuntime && <EmVBMenuRuntime />}
		</EmVBPage>
	</body>
</html>
`;
}

/** What names a cached template: the site and how it is made. A change makes a new template. */
export function templateKey(site: StockSite): string {
  const hash = new Bun.CryptoHasher("sha256")
    .update(JSON.stringify([site, createCommands(site)]))
    .digest("hex");
  return `${site.name}-${hash.slice(0, 12)}`;
}
