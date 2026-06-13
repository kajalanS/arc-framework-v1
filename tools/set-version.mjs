#!/usr/bin/env node
/**
 * set-version.mjs — set the root package.json "version" to the given value.
 *
 * semantic-release's @semantic-release/npm plugin bumps the version only inside
 * pkgRoot (packages/create-arc). This keeps the monorepo root package.json in
 * lockstep so both are committed together by @semantic-release/git.
 *
 *   node tools/set-version.mjs 1.2.3
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`error: expected a semver version argument, got: ${version ?? "(none)"}`);
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));   // .../tools
const ROOT = dirname(__dirname);                              // repo root
const rootPkgPath = join(ROOT, "package.json");

const pkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
const previous = pkg.version;
pkg.version = version;
writeFileSync(rootPkgPath, JSON.stringify(pkg, null, 2) + "\n");

console.log(`root package.json version: ${previous} -> ${version}`);
