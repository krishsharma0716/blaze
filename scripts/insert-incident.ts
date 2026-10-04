/**
 * Inserts one incident so the browser can prove a live update.
 * Connected to the open_incident reducer on Maincloud database mhacks2026.
 * Run after spacetime publish. It does not store the row on this laptop.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const database = process.env.SPACETIMEDB_DB ?? "mhacks2026";
const localCli = `${homedir()}/.local/bin/spacetime`;
const spacetime = existsSync(localCli) ? localCli : "spacetime";

const { stdout, stderr } = await execFileAsync(spacetime, [
  "call",
  "-s",
  "maincloud",
  database,
  "open_incident",
  "Phase 0 check",
  "fire",
  "0",
  "0",
  "web",
]);

if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);
