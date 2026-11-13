# AI agents (MCP)

EmVB gives AI agents (Claude, ChatGPT, Cursor and other MCP clients) a small set of tools to
read and build EmVB pages. Agents only change **drafts**: every change is validated like an edit
in the editor, shows in the page's version timeline with an **Agent** badge, and a person
publishes it, unless an admin allows agent publishing.

## Requirements

- EmDash **1.2 or later** with MCP on: `emdash({ mcp: true, … })`. The rest of EmVB still works on
  EmDash 1.0 and 1.1; only the agent tools need 1.2.
- `@perkyzz/emvb` 0.5.0 or later on the site (0.8.0 recommended: it adds the saved-section tools; 0.7.0 gives `list_versions` times as ISO 8601 UTC and adds the `NOT_SET_UP`, image-source and hidden-element checks and refuses links, SVG markup and duplicate class or variable names the page would drop), with **Set up EmVB** done once. Before that, the page
  tools answer `NOT_SET_UP`.
- An admin turns agents on in **Pages VisualBuilder → AI agents** (off by default), and approves the
  EmVB tools on EmDash's Plugins screen. EmDash asks again whenever the tool list changes, for
  example after an EmVB update.
- For the local bridge: Node 20 or later on the agent's computer.

## Two ways to connect

| | Remote | Local (stdio) |
| --- | --- | --- |
| Endpoint | `https://your.site/_emdash/api/mcp` (EmDash's own) | `npx -y @perkyzz/emvb-mcp --site https://your.site` |
| Sign-in | OAuth through EmDash, or an API token as a Bearer header | An EmDash API token in `EMVB_TOKEN` or `--token-file` |
| Tools | `emvb__list_pages`, `emvb__add_element`, … | `list_pages`, `add_element`, … |
| Extras | — | Resources (schemas, page layouts), prompts and the `emvb-page-builder` skill |

Remote config:

```json
{ "mcpServers": { "emvb": { "url": "https://your.site/_emdash/api/mcp" } } }
```

Local config:

```json
{
  "mcpServers": {
    "emvb": {
      "command": "npx",
      "args": ["-y", "@perkyzz/emvb-mcp", "--site", "https://your.site"],
      "env": { "EMVB_TOKEN": "<your EmDash API token>" }
    }
  }
}
```

Bridge options:

| Option | What it does |
| --- | --- |
| `--site <url>` | Your site. `https://` is required, except `http://` for `localhost`, `127.0.0.1`, `[::1]` and `*.localhost`. |
| `EMVB_TOKEN` | The API token (environment variable). |
| `--token-file <path>` | Reads the token from a file instead. Since 1.1.2 the bridge refuses a file other users can read; run `chmod 600` on it, or pass `--allow-loose-token-file` to use it with a warning. |
| `--allow-publish` | Lists `publish_page` and `publish_site_styles`. The site's AI agents settings still decide whether they run. |

The bridge refuses a token passed on the command line (`--token`), and logs to stderr only.

## Tokens and permissions

- Create the token in EmDash → **API tokens** with the scope **`mcp:tools:emvb`**.
- The token's user must be an **editor or above**. **Never use an admin token** for an agent.
- EmDash checks the scope and the role before any EmVB tool runs.
- A wrong, revoked or expired token is refused; the bridge says to create a new one.

## Rate limits

Each token may make **300 reads** and **60 changes a minute**, and **10 publishes an hour**. The
counts live in the site database, so they hold on Node and Cloudflare, on EmDash's endpoint and
through the bridge, whichever process answers. Over the limit a tool returns `RATE_LIMITED` with
"Try again in N seconds" (and `retryAfterSeconds` in the error details). EmVB stores a hash of
the token, never the token. Calls signed in without a token are counted per user.

## Tools

| Read | Write (draft only) | Publish (only when allowed) | Proposals (reviewed in the editor) |
| --- | --- | --- | --- |
| `list_pages`, `get_layout`, `describe_page`, `list_element_types`, `get_site_styles`, `list_section_recipes`, `get_accessibility_findings`, `list_versions`, `list_saved_sections` | `create_page`, `add_element`, `move_element`, `update_element`, `remove_element`, `apply_section_recipe`, `restore_version`, `update_site_styles`, `save_section`, `insert_saved_section`, `delete_saved_section` | `publish_page`, `publish_site_styles` | `list_page_outline`, `propose_changes`, `get_proposal`, `withdraw_proposal`, `get_requests` |

- Writes take an optional `expectedRev`; a stale one returns `CONFLICT`. Every write returns a new
  `rev`: pass that one to the next write.
- Style references to a site variable can leave out `from`; EmVB fills it in from the variable's
  kind and refuses ids and classes that don't exist, listing the ones that do.
- `create_page` uses the slug EmDash derives from the title and refuses a taken one.
- `update_site_styles` changes the style draft only, and refuses to remove a variable a page or class
  still uses unless `force: true`.
- Saved sections ([guide](saved-sections.md)): `save_section` stores a copy of an element in
  **My sections** (agents save copies only; synced sections are made in the editor).
  `insert_saved_section` first adds the classes the section uses to the style draft (a class with
  the same name but a different look is added as a numbered copy, never overwritten), then adds the
  section to the page. `delete_saved_section` is marked destructive; pages keep copies already
  inserted. All four need an editor token and go through the same write queue as other writes.
- Proposals (1.0): `list_page_outline` returns a compact tree, the `baseRevision` and
  `baseDesignRevision` a proposal must name, whether someone has the page open in the editor, and
  the proposals already waiting. `propose_changes` stores ordered changes (`insert`, `move`,
  `update`, `delete`, `class`, `variable`) for a person to accept or reject one by one; nothing is
  saved or published until they do, and agents never publish through a proposal. Every change is
  checked against the current page first: a refused one names its index (`Change 2: …`), a stale
  revision returns `CONFLICT`. `get_proposal` says whether a stored proposal still applies;
  `withdraw_proposal` removes one. A site keeps at most 100 proposals and a page at most 10 waiting for review (`REFUSED` past that).
- **`emvb-mcp watch`** (1.0) is the reference way to answer them: it polls `get_requests` and runs
  your agent command (for example `--agent "claude -p"`) once per request, with the request on
  stdin and never in the command line. Run an agent limited to the EmVB tools, with no shell or
  file tools; `watch` keeps `EMVB_TOKEN` out of its environment unless `--pass-token`. See the
  bridge's README.
- **Requests from the editor (prompt relay):** in the editor's **Agent** tab a person types what
  they want and clicks **Send to agent**. Their own agent (signed in with their token; a request is
  private to its author, and `get_requests` never returns anyone else's) reads open requests with `get_requests`
  (oldest first, optionally for one page) and answers with `propose_changes` plus the
  `requestId`; the request then shows **Answered** and the proposal waits for review. No model runs
  on the site and no key is stored: the agent runs wherever the person runs it (D-063). Requests
  are at most 2,000 characters, five can wait per page, and they stop being offered after a day.
  The tab says when an agent last checked for requests.
- **A page open in the editor is not written directly.** While someone has it open, the write tools
  that change that page (`add_element`, `update_element`, `restore_version`, …) refuse with
  `PAGE_OPEN`; send the change with `propose_changes` instead. The editor renews this every 30
  seconds; a closed tab frees the page at once, a crashed one within 90 seconds.
- A page is limited to 512 KB of layout (`TOO_LARGE`), 2,000 elements and 24 levels of nesting.
- Errors come back as tool errors with a code (`INVALID_INPUT`, `INVALID_LAYOUT`, `NESTING`,
  `NOT_FOUND`, `CONFLICT`, `PUBLISH_DISABLED`, `FORBIDDEN`, `REFUSED`, `TOO_LARGE`, `NOT_SET_UP`,
  `RATE_LIMITED`, `PAGE_OPEN`) and a message the agent can act on.
- Agents can't create popups or other Theme Builder parts, forms (a form element needs the id of an
  existing form), delete pages, upload media or load web fonts.

## Resources, prompts and the skill (local bridge)

- Resources: `emvb://schema/layout`, `emvb://schema/design`, `emvb://docs/layout-format`,
  `emvb://elements`, `emvb://site/styles`, and each page's draft as `emvb://pages/{pageId}/layout`
  or its accessibility findings as `emvb://pages/{pageId}/a11y`.
- Prompts: `build_landing_page`, `fix_accessibility`, `restyle_site` and `review_page`.
- The `emvb-page-builder` skill (`skill://emvb-page-builder/SKILL.md` and its references, including
  a design guide) teaches an agent the workflow. It is also in the package's `skill/` folder, to
  copy into an agent's skills directory.

## Publishing

Agent publishing is **off** by default. In **AI agents**, an admin can separately allow
**Agents may publish pages** and **Agents may publish site styles**. While they are off:

- `publish_page` and `publish_site_styles` refuse with `PUBLISH_DISABLED` (the local bridge only
  lists them with `--allow-publish`; EmDash's endpoint always lists them).
- EmVB also refuses EmVB pages published through EmDash's own `content_publish` MCP tool.

## What people see

- **Setup card** (1.0, top of the AI agents page): checks that EmDash's MCP endpoint is on, that
  EmVB's tools are approved on EmDash's **Plugins** screen (done once an agent has used this
  version's tools), that agent access is on, and links to **API tokens**. After an EmVB update
  that changes the tool list, EmDash hides the tools until an admin approves them again: if your
  agent doesn't see EmVB's tools after updating, approve them again.
- **AI agents** page (admins, under **Pages VisualBuilder**): whether agents are on, the master
  switch, the two publish switches, the endpoint, connect snippets and the last 50 agent changes
  with who made them and a link to the page.
- **Version timeline**: an **Agent** badge on versions an agent saved, and an All / People / Agents
  filter with counts.
- **Editor**: if an agent changes the page while you are idle, a notice offers **Reload**.
- **Agent tab** (1.0): **Ask your agent** box with your requests and when an agent last checked,
  then proposals for the open page, each change with **Accept** and **Reject**,
  **Preview** to see them on the canvas first, and **Via agent** on the version you save afterwards.

## Security notes

- Agents can't change the AI agents settings; no tool writes them.
- Every agent write is validated with the same rules as the editor and the save hook.
- Known limits, raised with EmDash: plugin writes skip `content:beforeSave` hooks of other plugins
  and record no author on the revision (EmVB keeps its own log), and there is a short window between
  EmVB's revision check and the write.

## Debugging

`scripts/mcp-inspector.sh https://your.site ./token.txt` opens the MCP Inspector on the local
bridge.
