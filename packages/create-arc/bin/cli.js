#!/usr/bin/env node
/**
 * create-arc — scaffold and manage the ARC plan-driven development framework.
 *
 *   npx @ksoftm/create-arc init [dir] [--owner=NAME]
 *   npx @ksoftm/create-arc new "Short imperative title" [--dir=.] [--tags=a,b] [--owner=NAME]
 *   npx @ksoftm/create-arc status [dir] [--json]
 *   npx @ksoftm/create-arc doctor [dir]
 *
 * Zero dependencies. Node >= 18. ARC protocol: see ARC.md after init.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATES = fileURLToPath(new URL("../templates/", import.meta.url));

// Read a UTF-8 file and normalize line endings to LF, so every downstream
// regex (frontmatter, fields, task markers) behaves identically regardless of
// whether the file was checked out with CRLF (Windows/Git autocrlf) or LF.
const readText = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const PKG = JSON.parse(readText(new URL("../package.json", import.meta.url)));

const PLACEMENT = {
  "ARC.md": "ARC.md",
  "INDEX.md": ".arc/INDEX.md",
  "_TEMPLATE.md": ".arc/_TEMPLATE.md",
  "ARC-0000-maintenance.md": ".arc/ARC-0000-maintenance.md",
};
const DIRS = [".arc/notes", ".arc/archive"];
const VALID_STATUSES = new Set([
  "draft", "planned", "refining", "in-progress", "blocked", "review", "done", "cancelled",
]);

/* ----------------------------- small helpers ----------------------------- */

const today = () => new Date().toISOString().slice(0, 10);

const slugify = (title, max = 40) =>
  (title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "")
    .slice(0, max).replace(/-$/, "")) || "arc";

function detectOwner(dir) {
  try {
    const name = execFileSync("git", ["-C", dir, "config", "user.name"], {
      encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (name) return name;
  } catch { /* not a git repo / git absent */ }
  return "user";
}

const BOOLEAN_FLAGS = new Set(["json", "help", "version"]);

function parseArgv(argv) {
  const flags = {}; const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > -1) { flags[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!BOOLEAN_FLAGS.has(key) && next !== undefined && !next.startsWith("--")) {
        flags[key] = next; i++;            // --owner NAME form
      } else flags[key] = true;            // --json / trailing flag form
    } else pos.push(a);
  }
  return { pos, flags };
}

const frontmatter = (text) => text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";

function field(front, key, fallback = "?") {
  const m = front.match(new RegExp(`^${key}:\\s*(.*?)\\s*(?:#.*)?$`, "m"));
  const v = m?.[1]?.trim();
  return v || fallback;
}

const setField = (block, key, value) =>
  block.replace(new RegExp(`^${key}:.*$`, "m"), `${key}: ${value}`);

function listArcFiles(arcDir) {
  const ls = (d) => existsSync(d)
    ? readdirSync(d).filter((f) => /^ARC-\d+.*\.md$/.test(f)).sort().map((f) => join(d, f))
    : [];
  return { active: ls(arcDir), archived: ls(join(arcDir, "archive")) };
}

/* -------------------------------- commands ------------------------------- */

function cmdInit(target, flags) {
  const dir = resolve(target ?? ".");
  if (!existsSync(dir)) return fail(`target does not exist: ${dir}`);
  const owner = flags.owner || detectOwner(dir);
  const date = today();
  let created = 0, skipped = 0;

  for (const d of DIRS) {
    mkdirSync(join(dir, d), { recursive: true });
    const keep = join(dir, d, ".gitkeep");
    if (!existsSync(keep)) writeFileSync(keep, "");
  }
  for (const [src, rel] of Object.entries(PLACEMENT)) {
    const dest = join(dir, rel);
    if (existsSync(dest)) { console.log(`  skip  ${rel} (exists)`); skipped++; continue; }
    mkdirSync(join(dest, ".."), { recursive: true });
    const text = readText(join(TEMPLATES, src))
      .replaceAll("{{DATE}}", date).replaceAll("{{OWNER}}", owner);
    writeFileSync(dest, text);
    console.log(`  ok    ${rel}`);
    created++;
  }
  console.log(`\nARC initialized at ${dir}  (created ${created}, skipped ${skipped}, owner: ${owner})`);
  if (created) console.log("Next: tell your agent to read ARC.md, or run `create-arc new \"Title\"`.");
  return 0;
}

function cmdNew(title, flags) {
  if (!title) return fail('usage: create-arc new "Short imperative title" [--dir=.] [--tags=a,b]');
  const dir = resolve(flags.dir ?? ".");
  const arcDir = join(dir, ".arc");
  const indexPath = join(arcDir, "INDEX.md");
  const templatePath = join(arcDir, "_TEMPLATE.md");
  if (!existsSync(indexPath) || !existsSync(templatePath)) {
    return fail(`.arc/INDEX.md or _TEMPLATE.md missing in ${dir} — run \`create-arc init\` first`);
  }

  let index = readText(indexPath);
  const m = index.match(/^next_id:\s*ARC-(\d+)\s*$/m);
  if (!m) return fail("could not find 'next_id: ARC-NNNN' in INDEX.md");
  const num = parseInt(m[1], 10);
  const id = `ARC-${String(num).padStart(4, "0")}`;
  const date = today();
  const filename = `${id}-${slugify(title)}.md`;
  const dest = join(arcDir, filename);
  if (existsSync(dest)) return fail(`${dest} already exists`);

  // build the arc file from the template
  const tpl = readText(templatePath);
  const fmMatch = tpl.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) return fail("_TEMPLATE.md has no YAML frontmatter");
  let front = fmMatch[1];
  let body = tpl.slice(fmMatch[0].length);

  front = setField(front, "id", id);
  front = setField(front, "title", title);
  front = setField(front, "status",
    "draft            # draft | planned | refining | in-progress | blocked | review | done | cancelled");
  front = setField(front, "created", date);
  front = setField(front, "updated", date);
  if (flags.owner) front = setField(front, "owner", flags.owner);
  if (flags.tags) {
    const tags = String(flags.tags).split(",").map((t) => t.trim()).filter(Boolean).join(", ");
    front = setField(front, "tags", `[${tags}]`);
  }
  body = body.replace("# ARC-0000 · <Title>", `# ${id} · ${title}`);
  writeFileSync(dest, `---\n${front}\n---\n${body}`);

  // update the index: bump next_id, insert registry row
  index = index.replace(/^next_id:\s*ARC-\d+\s*$/m, `next_id: ARC-${String(num + 1).padStart(4, "0")}`);
  const row = `| ${id} | ${title} | draft | 1 | ${date} | — | [${filename}](${filename}) |`;
  const lines = index.split("\n");
  const archivedIdx = lines.findIndex((l) => /^##\s+Archived/i.test(l));
  const scanEnd = archivedIdx === -1 ? lines.length : archivedIdx;

  // Preferred: insert right after the last existing "| ARC-…" row in the Active section.
  let insertAt = -1;
  for (let i = 0; i < scanEnd; i++) {
    if (/^\|\s*ARC-/.test(lines[i])) insertAt = i;
  }

  if (insertAt === -1) {
    // No arc rows yet (or a differently-shaped INDEX). Fall back, in order, to:
    // the "## Active" heading's table separator, the heading itself, or next_id.
    const activeIdx = lines.findIndex((l) => /^##\s+Active/i.test(l));
    if (activeIdx !== -1) {
      // find a markdown table separator (|---|) after the Active heading
      let sep = -1;
      for (let i = activeIdx + 1; i < scanEnd; i++) {
        if (/^\|?\s*:?-{2,}/.test(lines[i]) || /^\|(\s*-+\s*\|)+/.test(lines[i])) { sep = i; break; }
        if (/^\|\s*ID\s*\|/i.test(lines[i])) { sep = i + 1; }   // header row → insert after its separator
      }
      insertAt = sep !== -1 ? sep : activeIdx;   // after separator, else right after heading
    } else {
      // No Active section at all — synthesize one after next_id (or at top).
      const nextIdIdx = lines.findIndex((l) => /^next_id:/.test(l));
      const anchor = nextIdIdx !== -1 ? nextIdIdx : 0;
      lines.splice(anchor + 1, 0,
        "",
        "## Active",
        "",
        "| ID | Title | Status | Plan v | Updated | Depends | File |",
        "|---|---|---|---|---|---|---|");
      insertAt = anchor + 5;   // the separator line we just added
    }
  }

  lines.splice(insertAt + 1, 0, row);
  writeFileSync(indexPath, lines.join("\n"));

  console.log(`created  .arc/${filename}`);
  console.log(`index    row added, next_id -> ARC-${String(num + 1).padStart(4, "0")}`);
  console.log("Now fill in: Raw Instruction (verbatim), Plan, Tasks.");
  return 0;
}

function parseArc(path, archived) {
  const text = readText(path);
  const front = frontmatter(text);
  const section = text.match(/^## 4 · Tasks\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? text;
  const markers = [...section.matchAll(/^- \[([ >x!-])\]/gm)].map((x) => x[1]);
  const count = (c) => markers.filter((x) => x === c).length;
  return {
    id: field(front, "id", basename(path).split("-").slice(0, 2).join("-")),
    title: field(front, "title"),
    status: field(front, "status"),
    plan_version: field(front, "plan_version", "1"),
    updated: field(front, "updated"),
    tasks_done: count("x"),
    tasks_total: markers.length,
    tasks_in_progress: count(">"),
    tasks_blocked: count("!"),
    archived,
    file: path,
  };
}

function cmdStatus(target, flags) {
  const dir = resolve(target ?? ".");
  const arcDir = join(dir, ".arc");
  if (!existsSync(arcDir)) return fail(`${arcDir} not found — run \`create-arc init\` first`);

  const { active, archived } = listArcFiles(arcDir);
  const arcs = [...active.map((p) => parseArc(p, false)), ...archived.map((p) => parseArc(p, true))];

  if (flags.json) { console.log(JSON.stringify(arcs, null, 2)); return 0; }
  if (!arcs.length) { console.log("no arcs found"); return 0; }

  const indexText = existsSync(join(arcDir, "INDEX.md")) ? readText(join(arcDir, "INDEX.md")) : "";
  const focus = indexText.match(/^active_focus:\s*(.+)$/m)?.[1]?.trim();
  const nextId = indexText.match(/^next_id:\s*(.+)$/m)?.[1]?.trim();

  const headers = ["ID", "STATUS", "V", "TASKS", "UPDATED", "TITLE"];
  const rows = arcs.map((a) => [
    a.id,
    a.status + (a.archived ? " (archived)" : ""),
    a.plan_version,
    (a.tasks_total ? `${a.tasks_done}/${a.tasks_total}` : "—") + (a.tasks_blocked ? ` !${a.tasks_blocked}` : ""),
    a.updated,
    a.title,
  ]);
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const fmt = (r) => r.map((c, i) => String(c).padEnd(w[i])).join("  ");
  console.log(fmt(headers));
  console.log("-".repeat(fmt(headers).length));
  rows.forEach((r) => console.log(fmt(r)));

  const activeCount = arcs.filter((a) => !a.archived).length;
  const resume = arcs.filter((a) => !a.archived && (a.status === "in-progress" || a.status === "refining"))
    .map((a) => a.id);
  let summary = `\n${activeCount} active, ${arcs.length - activeCount} archived`;
  if (focus) summary += ` · focus: ${focus}`;
  if (nextId) summary += ` · next_id: ${nextId}`;
  console.log(summary);
  if (resume.length) console.log(`resume from: ${resume.join(", ")} (read Status Notes + last Worklog entry)`);
  return 0;
}

function cmdDoctor(target) {
  const dir = resolve(target ?? ".");
  const arcDir = join(dir, ".arc");
  const indexPath = join(arcDir, "INDEX.md");
  let failures = 0, warnings = 0;
  const ok = (msg) => console.log(`  OK    ${msg}`);
  const bad = (msg) => { console.log(`  FAIL  ${msg}`); failures++; };
  const warn = (msg) => { console.log(`  WARN  ${msg}`); warnings++; };

  if (!existsSync(arcDir)) return fail(`${arcDir} not found — run \`create-arc init\` first`);
  if (!existsSync(indexPath)) { bad(".arc/INDEX.md missing"); return finish(); }

  const index = readText(indexPath);
  const { active, archived } = listArcFiles(arcDir);
  const all = [...active.map((p) => ({ p, archived: false })), ...archived.map((p) => ({ p, archived: true }))];

  // next_id sanity
  const nm = index.match(/^next_id:\s*ARC-(\d+)\s*$/m);
  const maxId = Math.max(-1, ...all.map(({ p }) => parseInt(basename(p).match(/^ARC-(\d+)/)?.[1] ?? "-1", 10)));
  if (!nm) bad("next_id missing or malformed in INDEX.md");
  else if (parseInt(nm[1], 10) <= maxId) bad(`next_id ARC-${nm[1]} is not greater than highest existing arc ARC-${String(maxId).padStart(4, "0")}`);
  else ok(`next_id ARC-${nm[1]} > highest arc id`);

  // file <-> index bijection, frontmatter integrity
  const indexIds = new Set([...index.matchAll(/^\|\s*(ARC-\d{4})\s*\|/gm)].map((x) => x[1]));
  for (const { p } of all) {
    const fileId = basename(p).match(/^(ARC-\d{4})/)?.[1];
    const front = frontmatter(readText(p));
    const fmId = field(front, "id");
    const status = field(front, "status");
    if (fmId !== fileId) bad(`${basename(p)}: frontmatter id '${fmId}' != filename id '${fileId}'`);
    if (!VALID_STATUSES.has(status)) bad(`${basename(p)}: invalid status '${status}'`);
    if (!indexIds.has(fileId)) bad(`${basename(p)}: no row in INDEX.md`);
    const inProg = [...readText(p).matchAll(/^- \[>\]/gm)].length;
    if (inProg > 2) warn(`${basename(p)}: ${inProg} tasks marked [>] — keep at most 1–2 in progress`);
  }
  const fileIds = new Set(all.map(({ p }) => basename(p).match(/^(ARC-\d{4})/)?.[1]));
  for (const id of indexIds) if (!fileIds.has(id)) bad(`INDEX.md row ${id} has no matching arc file`);
  if (!failures) ok(`${all.length} arc file(s) ↔ INDEX rows consistent`);

  return finish();

  function finish() {
    console.log(failures
      ? `\ndoctor: ${failures} problem(s), ${warnings} warning(s)`
      : `\ndoctor: healthy (${warnings} warning(s))`);
    return failures ? 1 : 0;
  }
}

/* --------------------------------- main ----------------------------------- */

function fail(msg) { console.error(`error: ${msg}`); return 1; }

// Slash-commands generated for each supported agent. Each is a thin prompt that
// routes the agent through ARC.md; $ARGUMENTS / $1 carry the user's text.
const ARC_COMMANDS = {
  "arc-new": {
    desc: "ARC: capture a development instruction as a new arc (Align)",
    body: `Read ./ARC.md, then run ARC Intake for this instruction:

"$ARGUMENTS"

Steps: read .arc/INDEX.md; if an open arc already covers this, append the instruction verbatim and refine its plan; otherwise create a new arc (use \`npx @ksoftm/create-arc new "<short title>"\`, or create the file from .arc/_TEMPLATE.md and register it in INDEX.md). Record the raw instruction verbatim, draft the Plan with checkable acceptance criteria, and list the Tasks. Do not start coding until the plan is acknowledged.`,
  },
  "arc-refine": {
    desc: "ARC: fold a new instruction into an existing arc (Refine)",
    body: `Read ./ARC.md, then refine the relevant arc with this instruction:

"$ARGUMENTS"

Append it verbatim as the next Raw Instruction, add a Refinement Log entry (new plan_version, what changed, task impact), rewrite the Plan to reflect only the current intent, and adjust the Tasks. Move dropped scope to "Out of scope". Never edit the append-only sections retroactively.`,
  },
  "arc-build": {
    desc: "ARC: do the work for the active arc (Read Before / Update After Editing)",
    body: `Read ./ARC.md. Before editing: read .arc/INDEX.md, fully read the arc(s) covering the files you'll touch, and read the real source files. Work the task list in order, marking one task in progress. After editing: advance task states, append a Worklog entry (tasks, files read, files changed, summary, decisions, follow-ups), update the arc frontmatter and its INDEX row, and reference the arc id in the commit. An edit without a worklog entry is unfinished.

Focus: $ARGUMENTS`,
  },
  "arc-status": {
    desc: "ARC: summarize all arcs and what to resume",
    body: `Run \`npx @ksoftm/create-arc status\` (or read .arc/INDEX.md and each arc). Report every arc's id, status, plan version, task progress, and which in-progress/refining arcs to resume — reading each one's Status Notes and last Worklog entry.`,
  },
  "arc-resume": {
    desc: "ARC: pick up the in-progress arc cold",
    body: `Read ./ARC.md. Read .arc/INDEX.md, find arcs in in-progress or refining, open them, read Status Notes and the last Worklog entry, then continue from the open tasks — after running Read Before Editing. If code and the arc disagree, the code is truth: note the drift in the Worklog and correct the arc.`,
  },
};

// Where each agent looks for project-level slash commands, and how to render one.
const AGENT_TARGETS = {
  claude:   { dir: ".claude/commands",  ext: ".md",  fmt: md },
  opencode: { dir: ".opencode/command", ext: ".md",  fmt: md },
  cursor:   { dir: ".cursor/commands",  ext: ".md",  fmt: md },
  codex:    { dir: ".codex/prompts",    ext: ".md",  fmt: plain },   // Codex custom prompts
  gemini:   { dir: ".gemini/commands",  ext: ".toml", fmt: toml },
};
const ALL_AGENTS = Object.keys(AGENT_TARGETS);

function md(name, c)    { return `---\ndescription: ${c.desc}\n---\n\n${c.body}\n`; }
function plain(name, c) { return `${c.body}\n`; }
function toml(name, c)  {
  const b = c.body.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"');
  return `description = ${JSON.stringify(c.desc)}\nprompt = """\n${b}\n"""\n`;
}

function cmdAgentInit(flags) {
  const dir = resolve(flags.dir ?? ".");
  // --agents=claude,opencode  (default: all)
  const agents = (flags.agents ? String(flags.agents).split(",") : ALL_AGENTS)
    .map((a) => a.trim().toLowerCase()).filter(Boolean);
  const unknown = agents.filter((a) => !AGENT_TARGETS[a]);
  if (unknown.length) return fail(`unknown agent(s): ${unknown.join(", ")} (known: ${ALL_AGENTS.join(", ")})`);

  let created = 0, skipped = 0;
  for (const agent of agents) {
    const { dir: rel, ext, fmt } = AGENT_TARGETS[agent];
    const outDir = join(dir, rel);
    mkdirSync(outDir, { recursive: true });
    for (const [name, c] of Object.entries(ARC_COMMANDS)) {
      const dest = join(outDir, name + ext);
      if (existsSync(dest) && !flags.force) { skipped++; continue; }
      writeFileSync(dest, fmt(name, c));
      created++;
    }
    console.log(`  ${agent.padEnd(9)} ${rel}/  (${Object.keys(ARC_COMMANDS).length} commands)`);
  }
  console.log(`\nAgent commands written (created ${created}, skipped ${skipped}${flags.force ? "" : "; use --force to overwrite"}).`);
  console.log(`Type /arc-new, /arc-build, /arc-status, /arc-refine, /arc-resume in your agent.`);
  return 0;
}

function help() {
  console.log(`create-arc v${PKG.version} — ARC plan-driven development (Align → Refine → Construct)
(alias: \`arc\`)

Usage:
  arc init [dir] [--owner=NAME]            scaffold ARC.md + .arc/ (idempotent)
  arc new "Title" [--dir=.] [--tags=a,b]   create + register the next arc
  arc status [dir] [--json]                status table across all arcs
  arc doctor [dir]                         consistency checks (exit 1 on problems)
  arc agent-init [--agents=a,b] [--force]  write /slash commands for AI agents
                                           (agents: ${ALL_AGENTS.join(", ")}; default: all)

Run with npx (no install): npx @ksoftm/create-arc <command>
Install globally:          npm i -g @ksoftm/create-arc   then: arc <command>
Project dev dependency:    npm i -D @ksoftm/create-arc   then: npx arc <command>

Protocol reference: ARC.md in your project root after init.`);
  return 0;
}

const { pos, flags } = parseArgv(process.argv.slice(2));
const cmd = pos[0];

let code;
if (flags.version || cmd === "version") { console.log(PKG.version); code = 0; }
else if (!cmd || cmd === "help" || flags.help) code = help();
else if (cmd === "init") code = cmdInit(pos[1], flags);
else if (cmd === "new") code = cmdNew(pos.slice(1).join(" "), flags);
else if (cmd === "status") code = cmdStatus(pos[1], flags);
else if (cmd === "doctor") code = cmdDoctor(pos[1]);
else if (cmd === "agent-init" || cmd === "agents") code = cmdAgentInit(flags);
else code = fail(`unknown command '${cmd}' — try: arc help`);

process.exit(code);
