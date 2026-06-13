#!/usr/bin/env node
/**
 * smoke.mjs — cross-platform launcher for the Python smoke test.
 *
 * Windows ships `python`; macOS/Linux usually ship `python3`. This tries the
 * common interpreter names in order so `npm run smoke` works everywhere.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "smoke-test.py");
const candidates = process.platform === "win32"
  ? ["python", "py", "python3"]
  : ["python3", "python"];

for (const exe of candidates) {
  const r = spawnSync(exe, [SCRIPT], { stdio: "inherit" });
  if (r.error && r.error.code === "ENOENT") continue;   // interpreter not found, try next
  process.exit(r.status ?? 1);
}
console.error("error: no Python interpreter found (tried: " + candidates.join(", ") + ")");
console.error("Install Python 3.8+ to run the smoke test, or run the CLI tests with `npm test`.");
process.exit(1);
