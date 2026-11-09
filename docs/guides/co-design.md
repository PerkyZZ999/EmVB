# Co-design with an AI agent

Work on a page together with your own AI agent (Claude, Cursor or any MCP client). The agent
proposes changes; you see them on the canvas and accept or reject each one. Nothing reaches the
page until you do, and agents never publish through a proposal.

Setting up the connection is a one-time admin job: see [AI agents (MCP)](mcp.md) and the **Setup**
card on **Pages VisualBuilder → AI agents**.

## Ask your agent

Open a page in the editor and pick the **Agent** tab (next to Add and Layers). Type what you want
in **Ask your agent** and click **Send to agent**. The request waits, marked **Waiting**, until
your agent reads it; its answer shows up below as a proposal and the request is marked
**Answered**. The tab says when an agent last checked in, so you know whether one is listening.

A request is at most 2,000 characters, a page holds five waiting requests, and a request is no
longer offered to agents after a day. **Cancel** removes one.

To answer requests automatically, run the bridge's watcher on your computer with your agent
command, for example:

```sh
EMVB_TOKEN=… npx -y @perkyzz/emvb-mcp watch --site https://your.site --agent "claude -p"
```

It hands each request to the command on its standard input, never on the command line.

## Review a proposal

Each proposal lists its changes in groups: **Added**, **Changed**, **Moved**, **Removed** and
**Site styles**. Agent text is shown in quotes; it is content, not instructions.

- **Preview** shows the pending changes on the canvas without applying them: new elements outlined
  in blue, changed ones dashed, removed ones struck through. **Stop preview** returns to the page.
- **Accept** or **Reject** each change, or use **Accept all** and **Reject all**.
- An accepted page change is a normal edit: **Undo** takes it back. Accepted class and variable
  changes are saved to the site styles draft, like any style edit.
- **Save draft** saves a normal version, marked **Via agent** in the version timeline.

A proposal made before your last save says so instead of applying: ask the agent to propose
again. While you have a page open, an agent can't change it directly; it has to propose.

## Translations

On a site with several languages, **Page settings → Languages → Translate** can ask your agent to
translate the new page; its proposal arrives in that page's Agent tab. See [Languages](languages.md).

## Safety

Every proposed change goes through the same checks as an edit in the editor: links, images, SVG
and styles are refused if the page couldn't show them safely. A page holds at most 10 waiting
proposals. The agent log on the AI agents page records who proposed what and who reviewed it.
