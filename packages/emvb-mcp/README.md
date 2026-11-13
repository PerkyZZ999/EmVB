<p align="center">
  <a href="https://emvb.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/PerkyZZ999/EmVB/main/docs/brand/logo-dark.svg">
      <img src="https://raw.githubusercontent.com/PerkyZZ999/EmVB/main/docs/brand/logo-light.svg" alt="EmVB" width="320">
    </picture>
  </a>
</p>

# @perkyzz/emvb-mcp

A local (stdio) MCP server that lets AI agents build [EmVB](https://emvb.dev) pages on your
EmDash site. It forwards tool calls to your site's EmDash MCP endpoint and adds resources
(layout and style schemas, page layouts), workflow prompts and the `emvb-page-builder` skill.

```json
{
  "mcpServers": {
    "emvb": {
      "command": "npx",
      "args": ["-y", "@perkyzz/emvb-mcp", "--site", "https://your.site"],
      "env": { "EMVB_TOKEN": "<EmDash API token, scope mcp:tools:emvb, editor user>" }
    }
  }
}
```

Options:

- `--site <url>`: your site, `https://` (or `http://` for localhost).
- `EMVB_TOKEN`, or `--token-file <path>` to read the token from a file (keep it `chmod 600`;
  since 1.1.2 the bridge refuses a file other users can read unless you pass
  `--allow-loose-token-file`). A token on the command line is refused. The bridge follows no
  redirect, so the token only ever goes to `--site`.
- `--allow-publish`: list `publish_page` and `publish_site_styles`. The site's AI agents settings
  still decide whether they run.

The token: EmDash → **API tokens**, scope `mcp:tools:emvb`, for a user who is an **editor or
above**. Never give an agent an admin token. Each token may make 300 reads and 60 changes a minute
and 10 publishes an hour; over that, tools return `RATE_LIMITED` with how long to wait.

Besides the 25 tools (27 with `--allow-publish`), the bridge serves the layout and style schemas,
element and site style resources, each page's draft and accessibility findings, four prompts
(`build_landing_page`, `fix_accessibility`, `restyle_site`, `review_page`) and the
`emvb-page-builder` skill with its references (also in `skill/`).

## Answer requests from the editor: `emvb-mcp watch`

People can ask their agent from the EmVB editor's **Agent** tab. `watch` checks the site for those
requests and runs your own agent command once per request:

```sh
EMVB_TOKEN=… npx -y @perkyzz/emvb-mcp watch --site https://your.site --agent "claude -p"
```

The request is on the command's stdin, inside a short brief that says how to answer
(`list_page_outline`, then `propose_changes` with the request's id); `EMVB_SITE`, `EMVB_PAGE_ID`
and `EMVB_REQUEST_ID` are set. The request text never goes into the command line. The agent needs
the EmVB tools itself (this bridge in its MCP config). Requests run one at a time, each once;
an unanswered one is logged, not retried. Options: `--interval <s>` (15, 5–3600), `--timeout <s>`
per run (600), `--once`, `--pass-token`.

**Run an agent restricted to the EmVB MCP tools, with no shell or file tools.** A request is text
a person typed on the site, and an agent that may run commands or read files would let that text
reach them. Since 1.1.1 `watch` only ever receives requests written by the person whose token it
uses (each request is private to its author), quotes the request between tags with a random
name so it can't end the quote, skips a request whose ids aren't ids, and removes `EMVB_TOKEN`
from the agent's environment (give the agent the EmVB tools through its own MCP config, or pass
`--pass-token` if it really needs the token). With Claude Code, for example:
`--agent "claude -p --allowedTools 'mcp__emvb__*'"`.

Needs Node 20+ on the agent's computer, and on the site EmDash 1.2+ with `mcp: true`,
`@perkyzz/emvb` 0.5.0+ (0.8.0 recommended) with **Set up EmVB** done, and agents turned on in **Pages VisualBuilder →
AI agents**. Full guide:
<https://github.com/PerkyZZ999/EmVB/blob/main/docs/guides/mcp.md>.

MIT © 2026 Charles Wilkin.
