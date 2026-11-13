import { readFileSync, statSync } from "node:fs";
import { OptionsError } from "./options.ts";

/**
 * Reads --token-file (W-474). S-12 (W-1001): a file other users can read is refused, like ssh
 * refuses a loose key, unless --allow-loose-token-file, which keeps the old warning. A missing or
 * unreadable file is a plain message, not a stack trace.
 */
export const readTokenFile =
  (warn: (message: string) => void, fs = { readFileSync, statSync }) =>
  (path: string, allowLoose = false): string => {
    let loose = "";
    try {
      const { mode } = fs.statSync(path);
      if (process.platform !== "win32" && (mode & 0o077) !== 0) {
        loose = `${path} can be read by other users of this computer (mode ${(mode & 0o777).toString(8)}). Run: chmod 600 ${path}`;
        if (allowLoose) warn(loose);
      }
      if (loose && !allowLoose)
        throw new OptionsError(`${loose} (or pass --allow-loose-token-file).`);
      return fs.readFileSync(path, "utf8");
    } catch (error) {
      if (error instanceof OptionsError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") throw new OptionsError(`No token file at ${path}.`);
      if (code === "EACCES")
        throw new OptionsError(`Can't read the token file ${path}: permission denied.`);
      throw new OptionsError(
        `Can't read the token file ${path}: ${String((error as Error).message)}`,
      );
    }
  };
