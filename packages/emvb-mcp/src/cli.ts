#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readTokenFile } from "./token-file.ts";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { BRIDGE_VERSION, createBridgeServer } from "./bridge.ts";
import { OptionsError, parseOptions } from "./options.ts";
import { httpRemote } from "./remote.ts";
import {
  agentEnv,
  parseWatchOptions,
  watchOnce,
  WatchOptionsError,
  type RunAgent,
} from "./watch.ts";

// stdout is the MCP channel; every log line goes to stderr.
const log = (message: string) => process.stderr.write(`[emvb-mcp] ${message}\n`);

/** W-934: the person's own command, through their shell; request text only on stdin and env. */
const runAgent =
  (command: string, passToken: boolean): RunAgent =>
  (input, env, timeoutMs) =>
    new Promise((resolve) => {
      const child = spawn(command, {
        shell: true,
        stdio: ["pipe", "inherit", "inherit"],
        env: agentEnv(process.env, env, passToken),
      });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);
      child.on("error", (error) => log(`agent: ${error.message}`));
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, timedOut });
      });
      child.stdin.end(input);
    });

async function watch(argv: string[]) {
  const { options: watchOptions, rest } = parseWatchOptions(argv);
  const options = parseOptions(rest, process.env, readTokenFile(log));
  const remote = httpRemote(options.endpoint, options.token, BRIDGE_VERSION);
  const deps = {
    remote,
    run: runAgent(watchOptions.agent, watchOptions.passToken),
    site: options.site,
    timeoutMs: watchOptions.timeoutMs,
    log,
    handled: new Set<string>(),
  };
  log(`watching ${options.site.origin} for requests from the editor`);
  /* oxlint-disable no-await-in-loop */
  for (;;) {
    try {
      await watchOnce(deps);
    } catch (error) {
      log(`couldn't check for requests: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (watchOptions.once) break;
    await new Promise((r) => setTimeout(r, watchOptions.intervalMs));
  }
  /* oxlint-enable no-await-in-loop */
  await remote.close();
}

try {
  const argv = process.argv.slice(2);
  if (argv[0] === "watch") {
    await watch(argv.slice(1));
  } else {
    const options = parseOptions(argv, process.env, readTokenFile(log));
    const remote = httpRemote(options.endpoint, options.token, BRIDGE_VERSION);
    serveStdio(() => createBridgeServer({ remote, allowPublish: options.allowPublish }), {
      onerror: (error) => log(error.message),
    });
    log(`serving EmVB tools for ${options.site.origin}`);
  }
} catch (error) {
  log(
    error instanceof OptionsError || error instanceof WatchOptionsError
      ? error.message
      : String(error),
  );
  process.exit(2);
}
