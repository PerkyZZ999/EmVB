import { Banner, Button, ClipboardText, Empty, Switch, Table } from "@cloudflare/kumo";
import {
  ArrowSquareOutIcon,
  CheckIcon,
  CopyIcon,
  GlobeIcon,
  LockKeyIcon,
  PlugsConnectedIcon,
  RobotIcon,
  ShieldCheckIcon,
  TerminalWindowIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { defaultFetcher, type Fetcher } from "../api.ts";
import { loadAgents, saveAgentSettings, type AgentsState } from "../agents-api.ts";
import { useRole } from "../access/role.ts";
import { editorUrl } from "../editor/exit.ts";
import type { AgentSettings } from "../../mcp/settings.ts";
import { ListError, ListLoading } from "./list-kit.tsx";
import { UI_CSS } from "../ui.ts";

const ADMIN_ROLE = 50;

/** The stdio bridge config a person pastes into their MCP client (plan § 4). */
const stdioSnippet = (site: string) =>
  JSON.stringify(
    {
      mcpServers: {
        emvb: {
          command: "npx",
          args: ["-y", "@perkyzz/emvb-mcp", "--site", site],
          env: { EMVB_TOKEN: "<your EmDash API token>" },
        },
      },
    },
    null,
    2,
  );

const remoteSnippet = (endpoint: string) =>
  JSON.stringify({ mcpServers: { emvb: { url: endpoint } } }, null, 2);

/** A card's heading row: an icon tile, the title and one line on what the card is for (W-477). */
function SectionHead({
  id,
  icon: SectionIcon,
  title,
  children,
}: {
  id: string;
  icon: Icon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="emvb-agents-head">
      <span className="emvb-agents-icon" aria-hidden="true">
        <SectionIcon size={18} />
      </span>
      <div>
        <h2 id={id}>{title}</h2>
        <p>{children}</p>
      </div>
    </div>
  );
}

/** AI agents (`/agents`, W-463): the master switch, publishing, how to connect, recent activity. */
/**
 * W-756: on a phone the setup JSON scrolls sideways, and keyboard users could not reach it to
 * scroll. Focusable, and named so a screen reader says what it is.
 */
const SCROLLABLE = { tabIndex: 0, role: "group" } as const;

export function AgentsPage({ fetcher = defaultFetcher }: { fetcher?: Fetcher }) {
  const role = useRole(fetcher);
  const [state, setState] = useState<AgentsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // W-814: the switches were disabled while saving, which threw keyboard focus to the page body
  // after every toggle. They stay enabled; a change made mid-save is ignored instead.
  const savingNow = useRef(false);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // A failed save keeps the page on screen; only a failed load replaces it (W-624).
  const [saveError, setSaveError] = useState<string | null>(null);
  const isAdmin = role.state === "ready" && role.role >= ADMIN_ROLE;

  useEffect(() => {
    if (!isAdmin) return;
    loadAgents(fetcher)
      .then(setState)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [fetcher, isAdmin, attempt]);

  // UX-011: loading and a failed load get the list pages' named loading card and Retry.
  const shell = (body: ReactNode) => (
    <div className="emvb-pages emvb-agents" data-emvb-agents={error ? "error" : "loading"}>
      <style data-emvb-ui="">{UI_CSS}</style>
      <h1 className="emvb-page-title">AI agents</h1>
      {body}
    </div>
  );
  if (role.state === "loading") return shell(<ListLoading label="Loading AI agent settings…" />);
  if (!isAdmin) {
    return (
      <section data-emvb-access="denied">
        <Empty
          icon={<LockKeyIcon aria-hidden="true" />}
          title="Only administrators can manage AI agents"
          description="Ask an administrator to change these settings."
        />
      </section>
    );
  }
  if (error) {
    return shell(
      <ListError
        title="Couldn't load the AI agent settings"
        message={error}
        onRetry={() => {
          setError(null);
          setAttempt((n) => n + 1);
        }}
      />,
    );
  }
  if (!state) return shell(<ListLoading label="Loading AI agent settings…" />);

  const change = async (patch: Partial<AgentSettings>) => {
    if (savingNow.current) return;
    savingNow.current = true;
    const settings = { ...state.settings, ...patch };
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const revision = await saveAgentSettings(fetcher, settings, state.revision);
      setState({ ...state, settings, revision });
      setSaved(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setSaveError(message);
      // Pick up what is saved now and its revision, so the next save isn't refused again (W-630).
      // The page reloads by itself, so say so instead of asking for a reload (W-634).
      await loadAgents(fetcher)
        .then((fresh) => {
          setState(fresh);
          setSaveError(`${message} The latest settings are shown now; make your change again.`);
        })
        .catch(() => undefined);
    } finally {
      savingNow.current = false;
      setSaving(false);
    }
  };
  const site = new URL(state.endpoint).origin;
  const { settings } = state;

  return (
    <div className="emvb-pages emvb-agents" data-emvb-agents="ready">
      <style>{UI_CSS}</style>
      <header className="emvb-agents-header">
        <div>
          <h1 className="emvb-page-title">AI agents</h1>
          <p>Let AI assistants build and edit EmVB pages through MCP. They only change drafts.</p>
        </div>
        <span className="emvb-agents-status" data-on={settings.mcpEnabled ? "true" : "false"}>
          <span aria-hidden="true" />
          {settings.mcpEnabled ? "Agents on" : "Agents off"}
        </span>
      </header>
      <p className="emvb-helper emvb-agents-save" role="status" data-emvb-agents-save="">
        {saving ? "Saving…" : saved ? "Saved." : ""}
      </p>
      {saveError && (
        <Banner
          variant="error"
          icon={<WarningCircleIcon aria-hidden="true" />}
          title="Couldn't save the AI agent settings"
          description={saveError}
        />
      )}
      <section
        className="emvb-surface-card emvb-agents-section"
        aria-labelledby="emvb-agents-access"
      >
        <SectionHead id="emvb-agents-access" icon={ShieldCheckIcon} title="Access">
          The master switch. Turning it off refuses every agent call at once.
        </SectionHead>
        <div className="emvb-agents-option">
          <Switch
            label="Let AI agents edit EmVB pages"
            checked={settings.mcpEnabled}
            onCheckedChange={(checked: boolean) => void change({ mcpEnabled: checked })}
          />
          <p>
            Agents only change drafts. Every change shows in the page's version timeline and can be
            restored.
          </p>
        </div>
        <div className="emvb-agents-field">
          <h3>MCP endpoint</h3>
          {/* W-812: Kumo's default name, "Copy to clipboard", didn't say what it copies. */}
          <ClipboardText text={state.endpoint} labels={{ copyAction: "Copy endpoint URL" }} />
        </div>
      </section>
      <section
        className="emvb-surface-card emvb-agents-section"
        aria-labelledby="emvb-agents-publish"
      >
        <SectionHead id="emvb-agents-publish" icon={UploadSimpleIcon} title="Publishing">
          Published changes go live immediately. Each one is still in the version timeline.
        </SectionHead>
        <div className="emvb-agents-option">
          <Switch
            label="Agents may publish pages"
            checked={settings.publishPages}
            disabled={!settings.mcpEnabled}
            onCheckedChange={(checked: boolean) => void change({ publishPages: checked })}
          />
          <p>Off: agents save drafts and a person publishes them.</p>
        </div>
        <div className="emvb-agents-option">
          <Switch
            label="Agents may publish site styles"
            checked={settings.publishStyles}
            disabled={!settings.mcpEnabled}
            onCheckedChange={(checked: boolean) => void change({ publishStyles: checked })}
          />
          <p>Site styles change every page at once, so leave this off unless you need it.</p>
        </div>
      </section>
      <section
        className="emvb-surface-card emvb-agents-section"
        aria-labelledby="emvb-agents-connect"
      >
        <SectionHead id="emvb-agents-connect" icon={PlugsConnectedIcon} title="How to connect">
          Create a token in EmDash → API tokens with the scope <code>mcp:tools:emvb</code> for a
          user who is an editor or above. Never give an agent an admin token.
        </SectionHead>
        <div className="emvb-agents-snippets">
          <div className="emvb-agents-snippet">
            <div className="emvb-agents-snippet-head">
              <h3>
                <GlobeIcon aria-hidden="true" size={16} />
                Remote (EmDash MCP, sign in with OAuth)
              </h3>
              <CopySnippet text={remoteSnippet(state.endpoint)} name="remote setup" />
            </div>
            <pre data-emvb-snippet="remote" {...SCROLLABLE} aria-label="Remote setup">
              {remoteSnippet(state.endpoint)}
            </pre>
          </div>
          <div className="emvb-agents-snippet">
            <div className="emvb-agents-snippet-head">
              <h3>
                <TerminalWindowIcon aria-hidden="true" size={16} />
                Local (stdio)
              </h3>
              <CopySnippet text={stdioSnippet(site)} name="local setup" />
            </div>
            <pre data-emvb-snippet="stdio" {...SCROLLABLE} aria-label="Local setup">
              {stdioSnippet(site)}
            </pre>
          </div>
        </div>
      </section>
      <section
        className="emvb-surface-card emvb-agents-section"
        aria-labelledby="emvb-agents-activity"
      >
        <SectionHead id="emvb-agents-activity" icon={RobotIcon} title="Recent agent activity">
          The latest changes agents made, newest first.
        </SectionHead>
        {state.activity.length === 0 ? (
          <div data-emvb-agents-empty="">
            <Empty
              icon={<RobotIcon aria-hidden="true" />}
              title="No agent changes yet"
              description="When an agent edits a page, it shows up here with a link to the editor."
            />
          </div>
        ) : (
          <div className="emvb-agents-table" {...SCROLLABLE} aria-label="Recent agent activity">
            {/* W-815: on phones the table scrolls sideways; keyboard users couldn't reach it. */}
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>When</Table.Head>
                  <Table.Head>Who</Table.Head>
                  <Table.Head>Change</Table.Head>
                  <Table.Head>Page</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {state.activity.map((entry) => (
                  <Table.Row key={entry.id}>
                    <Table.Cell>
                      <span className="emvb-agents-when">
                        {new Date(entry.at).toLocaleString()}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="emvb-agents-who">
                        <span className="emvb-timeline-agent">
                          <RobotIcon aria-hidden="true" size={12} />
                          {entry.client ?? "Agent"}
                        </span>
                        {entry.userId ?? "unknown"}
                      </span>
                    </Table.Cell>
                    <Table.Cell>{entry.summary}</Table.Cell>
                    <Table.Cell>
                      {entry.pageId ? (
                        <a className="emvb-agents-link" href={editorUrl(entry.pageId)}>
                          Open in editor
                          <ArrowSquareOutIcon aria-hidden="true" size={14} />
                        </a>
                      ) : (
                        "—"
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

/** UX-089: the setup JSON is meant to be pasted into an agent's config, so it copies in one click. */
function CopySnippet({ text, name }: { text: string; name: string }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  useEffect(() => {
    // W-777: a failed copy stays until the next click; it vanished after 2 s.
    if (copied !== "yes") return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    if (!navigator.clipboard?.writeText) {
      setCopied("no");
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => setCopied("yes"),
      () => setCopied("no"),
    );
  };
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`Copy ${name}`}
        data-emvb-copy-snippet={name}
        onClick={copy}
      >
        {copied === "yes" ? (
          <CheckIcon aria-hidden="true" size={14} />
        ) : (
          <CopyIcon aria-hidden="true" size={14} />
        )}
        {/* W-777: sighted users saw no sign that the copy failed; only the status said so. */}
        {copied === "yes" ? "Copied" : copied === "no" ? "Couldn't copy" : "Copy"}
      </Button>
      <span className="emvb-sr-only" role="status">
        {copied === "yes"
          ? "Copied"
          : copied === "no"
            ? "Couldn't copy. Select the text instead."
            : ""}
      </span>
    </>
  );
}
