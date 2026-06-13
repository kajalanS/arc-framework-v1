#!/usr/bin/env node
/**
 * validate-skill.mjs — validate the ARC skill the way the Skills API does,
 * plus ARC-specific structural checks. Self-contained (no Python) so CI can
 * run it on any Node runner.
 *
 *   node tools/validate-skill.mjs [skill-dir]
 *
 * Mirrors skill-creator/scripts/quick_validate.py:
 *   - SKILL.md exists with YAML frontmatter
 *   - exactly one SKILL.md (no nested, excluding node_modules/__pycache__)
 *   - only allowed frontmatter keys
 *   - name is kebab-case, <= 64 chars
 *   - description present, <= 1024 chars
 * ARC extras:
 *   - referenced bundled scripts/references actually exist
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ALLOWED = new Set(["name", "description", "license", "allowed-tools", "metadata", "compatibility"]);
const skillDir = resolve(process.argv[2] || join(process.cwd(), "skill", "arc"));
const errors = [];
const warnings = [];

function fail(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

// --- locate SKILL.md files ------------------------------------------------
function findSkillMd(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__pycache__") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) findSkillMd(p, acc);
    else if (name === "SKILL.md") acc.push(p);
  }
  return acc;
}

const skillMd = join(skillDir, "SKILL.md");
if (!existsSync(skillMd)) {
  console.error(`✗ SKILL.md not found in ${skillDir}`);
  process.exit(1);
}
const allSkillMd = findSkillMd(skillDir);
if (allSkillMd.length > 1) {
  fail(`found ${allSkillMd.length} SKILL.md files; a skill must contain exactly one. ` +
       `Extra: ${allSkillMd.filter((p) => p !== skillMd).join(", ")}`);
}

// --- parse frontmatter ----------------------------------------------------
const content = readFileSync(skillMd, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const fm = content.match(/^---\n([\s\S]*?)\n---/);
if (!fm) {
  console.error("✗ no YAML frontmatter found in SKILL.md");
  process.exit(1);
}

// minimal top-level YAML parse (key: value per line; enough for this schema)
const front = {};
for (const line of fm[1].split("\n")) {
  const m = line.match(/^([A-Za-z0-9_-]+):\s?(.*)$/);
  if (m) front[m[1]] = m[2];
}

for (const key of Object.keys(front)) {
  if (!ALLOWED.has(key)) fail(`unexpected frontmatter key: '${key}' (allowed: ${[...ALLOWED].join(", ")})`);
}
if (!("name" in front)) fail("missing 'name' in frontmatter");
if (!("description" in front)) fail("missing 'description' in frontmatter");

const name = (front.name || "").trim();
if (name) {
  if (!/^[a-z0-9-]+$/.test(name)) fail(`name '${name}' must be kebab-case (lowercase, digits, hyphens)`);
  if (name.startsWith("-") || name.endsWith("-") || name.includes("--"))
    fail(`name '${name}' cannot start/end with a hyphen or contain '--'`);
  if (name.length > 64) fail(`name too long (${name.length} > 64)`);
}

const desc = (front.description || "").trim();
if (desc && desc.length > 1024) fail(`description too long (${desc.length} > 1024 chars)`);
if (desc && desc.length < 40) warn(`description is short (${desc.length} chars) — weak triggering`);

// --- ARC-specific: referenced resources exist -----------------------------
const refs = ["references/protocol.md",
              "scripts/arc_init.py", "scripts/arc_new.py", "scripts/arc_status.py",
              "assets/templates"];
for (const r of refs) {
  if (!existsSync(join(skillDir, r))) fail(`SKILL.md references '${r}' but it is missing`);
}

// --- report ---------------------------------------------------------------
for (const w of warnings) console.log(`⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error(`\nvalidation failed: ${errors.length} error(s)`);
  process.exit(1);
}
console.log(`✓ skill '${name}' valid${warnings.length ? ` (${warnings.length} warning(s))` : ""}`);
