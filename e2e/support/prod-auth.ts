import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const prodAuthFiles = (data: string) => ({
  release: join(data, ".prod-auth-release"),
  stopped: join(data, ".prod-auth-stopped"),
});

if (import.meta.main) {
  const data = process.env["EMVB_DEMO_DATA"];
  const command = process.argv.slice(2);
  if (!data || command.length === 0)
    throw new Error("Production auth needs demo data and a server command");
  const { release, stopped } = prodAuthFiles(data);
  rmSync(release, { force: true });
  rmSync(stopped, { force: true });
  const server = Bun.spawn(["setsid", ...command], { stdout: "inherit", stderr: "inherit" });
  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      process.kill(-server.pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      server.kill(signal);
    }
  };
  const stop = async () => {
    signalGroup("SIGTERM");
    await Promise.race([server.exited, Bun.sleep(2000)]);
    signalGroup("SIGKILL");
    await server.exited;
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void stop().then(() => process.exit(143));
    });
  }
  const waitForSignIn = async () => {
    while (!existsSync(release)) {
      // oxlint-disable-next-line no-await-in-loop -- wait for the browser's sign-in
      await Bun.sleep(100);
    }
    return true;
  };
  const signedIn = await Promise.race([server.exited.then(() => false), waitForSignIn()]);
  if (!signedIn) process.exit(await server.exited);
  await stop();
  writeFileSync(stopped, "");
}
