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
- `EMVB_TOKEN`, or `--token-file <path>` to read the token from a file (keep it `chmod 600`; the
  bridge warns otherwise). A token on the command line is refused.
- `--allow-publish`: list `publish_page` and `publish_site_styles`. The site's AI agents settings
  still decide whether they run.

The token: EmDash → **API tokens**, scope `mcp:tools:emvb`, for a user who is an **editor or
above**. Never give an agent an admin token. Each token may make 300 reads and 60 changes a minute
and 10 publishes an hour; over that, tools return `RATE_LIMITED` with how long to wait.

Besides the 16 tools (18 with `--allow-publish`), the bridge serves the layout and style schemas,
element and site style resources, each page's draft and accessibility findings, four prompts
(`build_landing_page`, `fix_accessibility`, `restyle_site`, `review_page`) and the
`emvb-page-builder` skill with its references (also in `skill/`).

Needs Node 20+ on the agent's computer, and on the site EmDash 1.2+ with `mcp: true`,
`@perkyzz/emvb` 0.5.0+ (0.7.0 recommended) with **Set up EmVB** done, and agents turned on in **Pages VisualBuilder →
AI agents**. Full guide:
<https://github.com/PerkyZZ999/EmVB/blob/main/docs/guides/mcp.md>.

MIT © 2026 Charles Wilkin.
