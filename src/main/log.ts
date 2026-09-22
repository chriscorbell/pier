import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".pi", "gui");
export const LOG_FILE = join(DIR, "pier.log");
const MAX_BYTES = 1024 * 1024;

/**
 * Append one line to ~/.pi/gui/pier.log. The file rolls over to pier.log.1 past 1 MB. Errors
 * writing the log are swallowed: logging must never take the app down with it.
 */
export function logError(scope: string, err: unknown): void {
  try {
    mkdirSync(DIR, { recursive: true });
    try {
      if (statSync(LOG_FILE).size > MAX_BYTES) renameSync(LOG_FILE, `${LOG_FILE}.1`);
    } catch {
      /* no file yet */
    }
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
    appendFileSync(LOG_FILE, `${new Date().toISOString()} [${scope}] ${detail}\n`);
  } catch {
    /* never throw from the logger */
  }
}

/** Route unhandled failures in the main process to the log instead of Electron's generic dialog. */
export function installErrorLog(): void {
  process.on("uncaughtException", (err) => logError("uncaught", err));
  process.on("unhandledRejection", (reason) => logError("unhandled", reason));
}
