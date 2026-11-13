/** Bridge options from argv and the environment. The token never comes from argv (plan § 2 Auth). */
export type BridgeOptions = {
  site: URL;
  endpoint: URL;
  token: string;
  allowPublish: boolean;
};

export class OptionsError extends Error {}

const USAGE = `Usage: emvb-mcp --site https://example.com [--token-file path] [--allow-publish]
                [--allow-loose-token-file]

The token comes from EMVB_TOKEN or --token-file: an EmDash API token with the scope
mcp:tools:emvb for an editor (never an admin).`;

const isLocal = (host: string) =>
  host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");

export function parseOptions(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  readFile: (path: string, allowLoose: boolean) => string,
): BridgeOptions {
  let site: string | undefined = env["EMVB_SITE"];
  let tokenFile: string | undefined;
  let allowPublish = false;
  let allowLoose = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--site") site = argv[++i];
    else if (arg?.startsWith("--site=")) site = arg.slice(7);
    else if (arg === "--token-file") {
      tokenFile = argv[++i];
      // W-498: `--token-file` with no path fell back to EMVB_TOKEN without a word.
      if (!tokenFile || tokenFile.startsWith("--"))
        throw new OptionsError("--token-file needs a path.");
    } else if (arg === "--allow-publish") allowPublish = true;
    else if (arg === "--allow-loose-token-file") allowLoose = true;
    else if (arg === "--token" || arg?.startsWith("--token=")) {
      throw new OptionsError(
        "Pass the token in EMVB_TOKEN or --token-file, never on the command line.",
      );
    } else if (arg === "--help" || arg === "-h") throw new OptionsError(USAGE);
    else throw new OptionsError(`Unknown option ${arg}.\n\n${USAGE}`);
  }
  if (!site) throw new OptionsError(`Missing --site.\n\n${USAGE}`);
  let url: URL;
  try {
    url = new URL(site);
  } catch {
    throw new OptionsError(`--site must be a URL like https://example.com, got ${site}.`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal(url.hostname))) {
    throw new OptionsError("--site must use https:// (http:// is only allowed for localhost).");
  }
  const token = (tokenFile ? readFile(tokenFile, allowLoose) : (env["EMVB_TOKEN"] ?? "")).trim();
  if (!token) throw new OptionsError(`No token: set EMVB_TOKEN or pass --token-file.\n\n${USAGE}`);
  // W-498: a token with a space or line break in it (a second line in the token file) made the
  // HTTP header invalid (tokens are printable ASCII), and the header error quoted the whole token back to the agent.
  if (/[^!-~]/.test(token)) {
    throw new OptionsError(
      `The token has a space or line break in it. ${tokenFile ? `${tokenFile} must hold only the token, on one line.` : "EMVB_TOKEN must hold only the token."}`,
    );
  }
  return {
    site: new URL(url.origin),
    endpoint: new URL("/_emdash/api/mcp", url.origin),
    token,
    allowPublish,
  };
}
