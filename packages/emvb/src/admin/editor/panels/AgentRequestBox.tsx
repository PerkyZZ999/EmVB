import { Badge, Button } from "@cloudflare/kumo";
import { PaperPlaneRightIcon } from "@phosphor-icons/react";
import * as React from "react";
import { MAX_REQUEST_PROMPT } from "../../../core/limits.ts";
import { FIELD } from "../../ui.ts";
import type { CoDesign } from "../useCoDesign.ts";

/** How long since an agent last checked before the panel stops calling it connected. */
const CONNECTED_MS = 2 * 60_000;

const ago = (iso: string, now: number) => {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : "days ago";
};

/**
 * W-931 prompt relay (D-063): the person asks their own agent from the editor. The request waits
 * until an agent reads it with get_requests and answers with a proposal reviewed below. The status
 * says when an agent last checked, so "nobody is listening" is visible before anyone waits.
 */
export function AgentRequestBox({ co, now = Date.now() }: { co: CoDesign; now?: number }) {
  const [prompt, setPrompt] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { requests, agentSeenAt } = co.proposals;
  const connected = agentSeenAt !== null && now - Date.parse(agentSeenAt) < CONNECTED_MS;
  const shown = requests.slice(0, 5);
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    const failed = await co.ask(prompt);
    setSending(false);
    setError(failed);
    if (!failed) setPrompt("");
  };
  return (
    <section className="emvb-codesign-ask" aria-label="Ask your agent" data-emvb-agent-ask="">
      <form onSubmit={send} className="emvb-codesign-ask-form">
        <label htmlFor="emvb-agent-prompt" className="emvb-codesign-group-title">
          Ask your agent
        </label>
        <textarea
          id="emvb-agent-prompt"
          dir="auto"
          className={`${FIELD} emvb-textarea`}
          rows={3}
          maxLength={MAX_REQUEST_PROMPT}
          value={prompt}
          placeholder="For example: tighten the hero copy and add a pricing section"
          aria-invalid={error ? true : undefined}
          aria-describedby="emvb-agent-prompt-status"
          readOnly={sending}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="emvb-codesign-actions">
          <Button
            type="submit"
            size="sm"
            variant="primary"
            disabled={!prompt.trim()}
            aria-busy={sending || undefined}
            icon={<PaperPlaneRightIcon aria-hidden="true" />}
            data-emvb-agent-send=""
          >
            Send to agent
          </Button>
        </div>
        <p
          id="emvb-agent-prompt-status"
          className="emvb-helper"
          role={error ? "alert" : undefined}
          data-emvb-agent-connection={connected ? "connected" : "idle"}
        >
          {error ??
            (agentSeenAt === null
              ? "No agent has checked for requests yet. Connect one with the EmVB MCP tools; it answers with a proposal you review here."
              : connected
                ? `An agent is connected (checked ${ago(agentSeenAt, now)}).`
                : `An agent last checked ${ago(agentSeenAt, now)}. It may not see new requests until it checks again.`)}
        </p>
      </form>
      {shown.length > 0 && (
        <ul className="emvb-codesign-ops" aria-label="Your requests">
          {shown.map((r) => (
            <li key={r.id} className="emvb-codesign-op" data-emvb-agent-request={r.status}>
              <span className="emvb-codesign-op-text">{r.prompt}</span>
              <span className="emvb-codesign-op-actions">
                {r.status === "answered" ? (
                  <Badge variant="blue">Answered</Badge>
                ) : (
                  <>
                    <Badge variant="neutral">Waiting</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Cancel request: ${r.prompt.slice(0, 60)}`}
                      data-emvb-agent-cancel=""
                      onClick={() => void co.cancel(r.id)}
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
