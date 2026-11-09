import { Button } from "@cloudflare/kumo";
import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  ListChecksIcon,
  QuestionIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { Fetcher } from "../api.ts";
import { checkAgentSetup, type AgentSetup } from "../agents-api.ts";
import { SectionHead } from "./section-head.tsx";

type Step = { key: string; state: "done" | "todo" | "unknown"; title: string; detail: ReactNode };

const ICONS = {
  done: <CheckCircleIcon size={18} weight="fill" aria-hidden="true" />,
  todo: <WarningCircleIcon size={18} weight="fill" aria-hidden="true" />,
  unknown: <QuestionIcon size={18} aria-hidden="true" />,
};
const STATUS = { done: "Done", todo: "To do", unknown: "Couldn't check" };

/** W-932: the steps a site needs before an agent can connect, each checked where it can be. */
function setupSteps(setup: AgentSetup | null, agentsOn: boolean): Step[] {
  const endpoint = setup?.endpoint ?? "unknown";
  const tools = setup?.tools ?? "unknown";
  return [
    {
      key: "endpoint",
      state: endpoint === "on" ? "done" : endpoint === "off" ? "todo" : "unknown",
      title: "EmDash's MCP endpoint is on",
      detail:
        endpoint === "off" ? (
          <>
            Add <code>mcp: true</code> to <code>emdash()</code> in <code>astro.config.mjs</code> and
            redeploy.
          </>
        ) : (
          "Agents connect to EmDash's own endpoint; EmVB adds its tools there."
        ),
    },
    {
      key: "tools",
      state: tools === "served" ? "done" : tools === "off" ? "todo" : "unknown",
      title: "EmVB's tools are approved",
      detail:
        tools === "approved" ? (
          <>
            Approved, but no agent has used this version's tools yet. EmDash hides them again
            whenever an EmVB update changes them: if your agent doesn't see EmVB's tools, approve
            them again in <a href="/_emdash/admin/plugins-manager">Plugins</a>.
          </>
        ) : tools === "off" ? (
          <>
            Approve them for Pages VisualBuilder in{" "}
            <a href="/_emdash/admin/plugins-manager">Plugins</a>.
          </>
        ) : tools === "served" ? (
          "An agent has used this version's tools."
        ) : (
          "EmDash lists EmVB's tools to agents only after an admin approves them."
        ),
    },
    {
      key: "access",
      state: agentsOn ? "done" : "todo",
      title: "Agent access is on",
      detail: agentsOn
        ? "Turn it off below to refuse every agent call at once."
        : "Turn on “Let AI agents edit EmVB pages” below.",
    },
    {
      key: "token",
      state: "unknown",
      title: "A token for the agent",
      detail: (
        <>
          In <a href="/_emdash/admin/settings/api-tokens">API tokens</a>, create one with the scope{" "}
          <code>mcp:tools:emvb</code> for an editor, not an admin. EmVB never sees or stores it.
        </>
      ),
    },
  ];
}

export function AgentSetupCard({
  fetcher,
  agentsOn,
  toolsServed = false,
}: {
  fetcher: Fetcher;
  agentsOn: boolean;
  toolsServed?: boolean;
}) {
  const [setup, setSetup] = useState<AgentSetup | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setSetup(null);
    checkAgentSetup(fetcher, toolsServed).then(
      (next) => !cancelled && setSetup(next),
      () => !cancelled && setSetup({ endpoint: "unknown", tools: "unknown" }),
    );
    return () => {
      cancelled = true;
    };
  }, [fetcher, toolsServed, attempt]);
  const steps = setupSteps(setup, agentsOn);
  return (
    <section
      className="emvb-surface-card emvb-agents-section"
      aria-labelledby="emvb-agents-setup"
      aria-busy={setup === null || undefined}
      data-emvb-agent-setup={setup === null ? "checking" : "ready"}
    >
      <SectionHead id="emvb-agents-setup" icon={ListChecksIcon} title="Setup">
        What this site needs before an agent can connect. People then ask their agent from the
        editor's Agent tab and review what it proposes.
      </SectionHead>
      <ol className="emvb-agents-steps">
        {steps.map((step) => (
          <li key={step.key} data-emvb-setup-step={step.key} data-state={step.state}>
            <span className="emvb-agents-step-icon">{ICONS[step.state]}</span>
            <div>
              <h3>
                {step.title}
                <span className="emvb-sr-only">: {STATUS[step.state]}</span>
              </h3>
              <p>{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <div>
        <Button
          size="sm"
          variant="secondary"
          icon={<ArrowsClockwiseIcon aria-hidden="true" />}
          onClick={() => setAttempt((n) => n + 1)}
          data-emvb-setup-recheck=""
        >
          Check again
        </Button>
      </div>
    </section>
  );
}
