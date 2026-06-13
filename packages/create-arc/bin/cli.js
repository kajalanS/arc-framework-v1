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
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync,
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

const BOOLEAN_FLAGS = new Set(["json", "help", "version", "fix", "force", "cancelled", "cancel", "worklog"]);
const REPEATABLE_FLAGS = new Set(["task"]);

function parseArgv(argv) {
  const flags = {}; const pos = [];
  const set = (key, val) => {
    if (REPEATABLE_FLAGS.has(key)) (flags[key] ??= []).push(val);
    else flags[key] = val;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > -1) { set(a.slice(2, eq), a.slice(eq + 1)); continue; }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!BOOLEAN_FLAGS.has(key) && next !== undefined && !next.startsWith("--")) {
        set(key, next); i++;               // --owner NAME form
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

/* ---------------------- shared arc-mutation helpers ---------------------- */

// Resolve a project dir's .arc, failing clearly if uninitialized.
function arcDirOf(flags, target) {
  const dir = resolve(flags?.dir ?? target ?? ".");
  const arcDir = join(dir, ".arc");
  return { dir, arcDir, exists: existsSync(arcDir) };
}

// Find an arc file by id ("ARC-0007" / "7" / "0007") or by a slug substring.
// Searches active first, then archive. Returns { path, archived } or null.
function findArc(arcDir, ref) {
  const { active, archived } = listArcFiles(arcDir);
  const all = [...active.map((p) => ({ p, archived: false })),
               ...archived.map((p) => ({ p, archived: true }))];
  if (!ref) return null;
  const raw = String(ref).trim();
  const num = raw.replace(/^ARC-/i, "").replace(/[^0-9]/g, "");
  const id = num ? `ARC-${num.padStart(4, "0")}` : null;
  // exact id match on filename
  if (id) {
    const hit = all.find(({ p }) => basename(p).toUpperCase().startsWith(id));
    if (hit) return { path: hit.p, archived: hit.archived };
  }
  // slug substring match (case-insensitive), unique-or-first
  const matches = all.filter(({ p }) => basename(p).toLowerCase().includes(raw.toLowerCase()));
  if (matches.length) return { path: matches[0].p, archived: matches[0].archived };
  return null;
}

// Set a frontmatter field, bump `updated` to today, and (optionally) sync the
// INDEX.md row for this arc. Returns the new frontmatter values of interest.
function updateArcFrontmatter(arcPath, changes) {
  let text = readText(arcPath);
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return fail(`${basename(arcPath)}: no YAML frontmatter`);
  let front = fm[1];
  for (const [k, v] of Object.entries(changes)) front = setField(front, k, v);
  if (!("updated" in changes)) front = setField(front, "updated", today());
  text = text.slice(0, fm.index) + `---\n${front}\n---` + text.slice(fm.index + fm[0].length);
  writeFileSync(arcPath, text);
  return front;
}

// Sync the INDEX.md row (status, plan v, updated) for a given arc id.
function syncIndexRow(arcDir, id, { status, planVersion } = {}) {
  const indexPath = join(arcDir, "INDEX.md");
  if (!existsSync(indexPath)) return;
  const lines = readText(indexPath).split("\n");
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split("|");
    if (cells.length >= 8 && cells[1].trim().toUpperCase() === id) {
      if (status !== undefined) cells[3] = ` ${status} `;
      if (planVersion !== undefined) cells[4] = ` ${planVersion} `;
      cells[5] = ` ${today()} `;
      lines[i] = cells.join("|");
      changed = true;
      break;
    }
  }
  if (changed) writeFileSync(indexPath, lines.join("\n"));
}

// Move an arc row from the Active table to the Archived table in INDEX.md.
function moveIndexRowToArchived(arcDir, id, outcome) {
  const indexPath = join(arcDir, "INDEX.md");
  if (!existsSync(indexPath)) return;
  const lines = readText(indexPath).split("\n");
  const archivedHeadIdx = lines.findIndex((l) => /^##\s+Archived/i.test(l));
  let rowIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (archivedHeadIdx !== -1 && i >= archivedHeadIdx) break;
    const cells = lines[i].split("|");
    if (cells.length >= 8 && cells[1].trim().toUpperCase() === id) { rowIdx = i; break; }
  }
  if (rowIdx === -1) return;
  const cells = lines[rowIdx].split("|");
  const title = cells[2].trim();
  const file = cells[7].trim();   // [name](path)
  const archivedRow = `| ${id} | ${title} | ${outcome} | ${today()} | ${file} |`;
  lines.splice(rowIdx, 1);                     // remove from Active
  // re-find Archived head (index shifted), then drop a placeholder "— | —" row if present
  let head = lines.findIndex((l) => /^##\s+Archived/i.test(l));
  if (head === -1) { lines.push("", "## Archived", "", "| ID | Title | Outcome | Closed | File |", "|---|---|---|---|---|"); head = lines.length - 2; }
  // insert after the Archived table separator (first |---| after head)
  let sep = -1;
  for (let i = head + 1; i < lines.length; i++) {
    if (/^\|?\s*:?-{2,}/.test(lines[i])) { sep = i; break; }
  }
  const insertAt = sep !== -1 ? sep : head;
  // remove an empty placeholder archived row ("| — | — | …")
  if (lines[insertAt + 1] && /^\|\s*—\s*\|/.test(lines[insertAt + 1])) lines.splice(insertAt + 1, 1);
  lines.splice(insertAt + 1, 0, archivedRow);
  writeFileSync(indexPath, lines.join("\n"));
}

// Append a worklog entry under "## 5 · Worklog".
function appendWorklog(arcPath, note) {
  let text = readText(arcPath);
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const entry = `\n### ${stamp} — ${note}\n`;
  const m = text.match(/^## 5 · Worklog\n/m);
  if (!m) { writeFileSync(arcPath, text + entry); return; }
  // insert right after the Worklog heading (and its leading HTML comment if present)
  const afterHead = m.index + m[0].length;
  text = text.slice(0, afterHead) + entry + text.slice(afterHead);
  writeFileSync(arcPath, text);
}

// Get the current plan_version int from an arc.
function planVersionOf(arcPath) {
  return parseInt(field(frontmatter(readText(arcPath)), "plan_version", "1"), 10) || 1;
}

// Count existing instructions (I1, I2, …) in §1 to compute the next index.
function nextInstructionIndex(text) {
  const nums = [...text.matchAll(/^### I(\d+)\b/gm)].map((m) => parseInt(m[1], 10));
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

// Append a verbatim instruction to "## 1 · Raw Instructions". Returns the new I-index.
function appendInstruction(arcPath, instruction, source = "chat") {
  let text = readText(arcPath);
  const idx = nextInstructionIndex(text);
  const quoted = String(instruction).trim().split("\n").map((l) => `> ${l}`).join("\n");
  const entry = `\n### I${idx} — ${today()} (source: ${source})\n${quoted}\n`;
  const sec = text.match(/(^## 1 · Raw Instructions\n)([\s\S]*?)(?=^## )/m);
  if (!sec) { writeFileSync(arcPath, text + entry); return idx; }
  // append at the end of §1, before the next "## "
  const insertAt = sec.index + sec[1].length + sec[2].replace(/\n*$/, "\n").length;
  const head = text.slice(0, sec.index + sec[1].length);
  const bodyTrimmed = sec[2].replace(/\n+$/, "\n");
  text = head + bodyTrimmed + entry + "\n" + text.slice(sec.index + sec[0].length);
  writeFileSync(arcPath, text);
  return idx;
}

// Append a Refinement Log entry under "## 3 · Refinement Log" for a version bump.
function appendRefinement(arcPath, version, changed, instructionIdx) {
  let text = readText(arcPath);
  const trigger = instructionIdx ? ` — triggered by I${instructionIdx}` : "";
  const entry = `\n### v${version} — ${today()}${trigger}\n- changed: ${changed}\n`;
  const m = text.match(/^## 3 · Refinement Log\n/m);
  if (!m) { writeFileSync(arcPath, text + entry); return; }
  // insert right after the heading + its leading HTML comment (the example block)
  let afterHead = m.index + m[0].length;
  const rest = text.slice(afterHead);
  const lead = rest.match(/^(\s*<!--[\s\S]*?-->\n)/);   // skip the template's example comment
  if (lead) afterHead += lead[0].length;
  text = text.slice(0, afterHead) + entry + text.slice(afterHead);
  writeFileSync(arcPath, text);
}

// Extract worklog entries (### timestamp — note + bullet lines) from §5.
function readWorklog(arcPath) {
  const text = readText(arcPath);
  const sec = text.match(/^## 5 · Worklog\n([\s\S]*?)(?=^## |\Z)/m)?.[1] ?? "";
  const body = sec.replace(/<!--[\s\S]*?-->/g, "").trim();
  if (!body) return [];
  // split on entry headers, keep the header text
  const parts = body.split(/(?=^### )/m).map((s) => s.trim()).filter(Boolean);
  return parts.map((p) => {
    const head = p.match(/^### (.+)/)?.[1] ?? "";
    const lines = p.split("\n").slice(1).map((l) => l.trim()).filter(Boolean);
    return { head, lines };
  });
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

  // Optional prefill: --goal sets the Plan goal line; --task adds first tasks.
  if (flags.goal) {
    body = body.replace(/\*\*Goal:\*\* <[^>]*>/, `**Goal:** ${String(flags.goal).trim()}`);
  }
  const tasks = flags.task ? (Array.isArray(flags.task) ? flags.task : [flags.task]) : [];
  if (tasks.length) {
    const block = tasks.map((t, i) => `- [ ] T${i + 1} ${String(t).trim()}`).join("\n");
    // Replace the placeholder "- [ ] T1 <…>" lines under "## 4 · Tasks" with real tasks.
    body = body.replace(/^- \[ \] T\d+ <[^>]*>(?:\n- \[ \] T\d+ <[^>]*>)*/m, block);
  }

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

function cmdDoctor(target, flags = {}) {
  const dir = resolve(flags.dir ?? target ?? ".");
  const arcDir = join(dir, ".arc");
  const indexPath = join(arcDir, "INDEX.md");
  const doFix = !!flags.fix;
  let failures = 0, warnings = 0, fixed = 0;
  const ok = (msg) => console.log(`  OK    ${msg}`);
  const bad = (msg) => { console.log(`  FAIL  ${msg}`); failures++; };
  const warn = (msg) => { console.log(`  WARN  ${msg}`); warnings++; };
  const fix = (msg) => { console.log(`  FIX   ${msg}`); fixed++; };

  if (!existsSync(arcDir)) return fail(`${arcDir} not found — run \`arc init\` first`);
  if (!existsSync(indexPath)) { bad(".arc/INDEX.md missing"); return finish(); }

  const index = readText(indexPath);
  const { active, archived } = listArcFiles(arcDir);
  const all = [...active.map((p) => ({ p, archived: false })), ...archived.map((p) => ({ p, archived: true }))];

  // next_id sanity
  const nm = index.match(/^next_id:\s*ARC-(\d+)\s*$/m);
  const maxId = Math.max(-1, ...all.map(({ p }) => parseInt(basename(p).match(/^ARC-(\d+)/)?.[1] ?? "-1", 10)));
  if (!nm) bad("next_id missing or malformed in INDEX.md");
  else if (parseInt(nm[1], 10) <= maxId) {
    if (doFix) {
      const next = `ARC-${String(maxId + 1).padStart(4, "0")}`;
      writeFileSync(indexPath, readText(indexPath).replace(/^next_id:\s*ARC-\d+\s*$/m, `next_id: ${next}`));
      fix(`next_id → ${next} (was ARC-${nm[1]})`);
    } else bad(`next_id ARC-${nm[1]} is not greater than highest existing arc ARC-${String(maxId).padStart(4, "0")}`);
  } else ok(`next_id ARC-${nm[1]} > highest arc id`);

  // index row status map (id → status cell), for status-drift repair
  const rowStatus = new Map();
  for (const line of index.split("\n")) {
    const cells = line.split("|");
    if (cells.length >= 8 && /^ARC-\d{4}$/.test(cells[1].trim())) rowStatus.set(cells[1].trim(), cells[3].trim());
  }

  // file <-> index bijection, frontmatter integrity
  const indexIds = new Set([...index.matchAll(/^\|\s*(ARC-\d{4})\s*\|/gm)].map((x) => x[1]));
  for (const { p, archived: isArch } of all) {
    const fileId = basename(p).match(/^(ARC-\d{4})/)?.[1];
    const front = frontmatter(readText(p));
    const fmId = field(front, "id");
    const status = field(front, "status");
    if (fmId !== fileId) {
      if (doFix) { updateArcFrontmatter(p, { id: fileId }); fix(`${basename(p)}: frontmatter id '${fmId}' → '${fileId}'`); }
      else bad(`${basename(p)}: frontmatter id '${fmId}' != filename id '${fileId}'`);
    }
    if (!VALID_STATUSES.has(status)) bad(`${basename(p)}: invalid status '${status}'`);
    if (!indexIds.has(fileId)) bad(`${basename(p)}: no row in INDEX.md`);
    // status drift: active arc's index cell disagrees with its frontmatter
    else if (!isArch && VALID_STATUSES.has(status) && rowStatus.get(fileId) && rowStatus.get(fileId) !== status) {
      if (doFix) { syncIndexRow(arcDir, fileId, { status }); fix(`${fileId}: index status '${rowStatus.get(fileId)}' → '${status}'`); }
      else warn(`${fileId}: index status '${rowStatus.get(fileId)}' != frontmatter '${status}' (use --fix)`);
    }
    const inProg = [...readText(p).matchAll(/^- \[>\]/gm)].length;
    if (inProg > 2) warn(`${basename(p)}: ${inProg} tasks marked [>] — keep at most 1–2 in progress`);
  }
  const fileIds = new Set(all.map(({ p }) => basename(p).match(/^(ARC-\d{4})/)?.[1]));
  for (const id of indexIds) if (!fileIds.has(id)) bad(`INDEX.md row ${id} has no matching arc file`);
  if (!failures) ok(`${all.length} arc file(s) ↔ INDEX rows consistent`);

  return finish();

  function finish() {
    const fx = fixed ? `, ${fixed} fixed` : "";
    console.log(failures
      ? `\ndoctor: ${failures} problem(s), ${warnings} warning(s)${fx}`
      : `\ndoctor: healthy (${warnings} warning(s)${fx})`);
    return failures ? 1 : 0;
  }
}

/* ------------------------ lifecycle / task commands ----------------------- */

// Shared: resolve an arc by reference for a mutating command.
function resolveForMutation(ref, flags) {
  const { arcDir, exists } = arcDirOf(flags);
  if (!exists) return { err: fail("`.arc` not found — run `arc init` first") };
  if (!ref) return { err: fail("which arc? pass an id or slug, e.g. `ARC-0007` or `rate-limit`") };
  const found = findArc(arcDir, ref);
  if (!found) return { err: fail(`no arc matching '${ref}' (try \`arc status\` to list them)`) };
  const id = basename(found.path).match(/^(ARC-\d{4})/)?.[1];
  return { arcDir, path: found.path, archived: found.archived, id };
}

function setStatus(ref, flags, status, { note } = {}) {
  const r = resolveForMutation(ref, flags);
  if (r.err) return r.err;
  if (r.archived) return fail(`${r.id} is archived — restore it first`);
  updateArcFrontmatter(r.path, { status });
  syncIndexRow(r.arcDir, r.id, { status });
  if (note) appendWorklog(r.path, note);
  console.log(`${r.id} → ${status}`);
  return 0;
}

const cmdStart = (ref, flags) => setStatus(ref, flags, "in-progress", { note: "started (status → in-progress)" });
const cmdReview = (ref, flags) => setStatus(ref, flags, "review", { note: "moved to review" });

function cmdBlock(ref, flags) {
  const reason = flags.reason || flags.r;
  return setStatus(ref, flags, "blocked", {
    note: reason ? `blocked: ${reason}` : "blocked",
  });
}

function cmdDone(ref, flags) {
  const r = resolveForMutation(ref, flags);
  if (r.err) return r.err;
  if (r.archived) { console.log(`${r.id} is already archived`); return 0; }
  updateArcFrontmatter(r.path, { status: "done" });
  appendWorklog(r.path, "completed (status → done)");
  // move file into archive/ and move the INDEX row to Archived
  const archiveDir = join(r.arcDir, "archive");
  mkdirSync(archiveDir, { recursive: true });
  const destPath = join(archiveDir, basename(r.path));
  renameSync(r.path, destPath);
  moveIndexRowToArchived(r.arcDir, r.id, "done");
  console.log(`${r.id} → done · moved to .arc/archive/${basename(r.path)}`);
  return 0;
}

function cmdArchive(ref, flags) {
  const r = resolveForMutation(ref, flags);
  if (r.err) return r.err;
  if (r.archived) { console.log(`${r.id} is already archived`); return 0; }
  const outcome = flags.cancelled || flags.cancel ? "cancelled" : "done";
  if (outcome === "cancelled") {
    updateArcFrontmatter(r.path, { status: "cancelled" });
    appendWorklog(r.path, flags.reason ? `cancelled: ${flags.reason}` : "cancelled");
  }
  const archiveDir = join(r.arcDir, "archive");
  mkdirSync(archiveDir, { recursive: true });
  renameSync(r.path, join(archiveDir, basename(r.path)));
  moveIndexRowToArchived(r.arcDir, r.id, outcome);
  console.log(`${r.id} → ${outcome} · archived`);
  return 0;
}

// arc task <ref> <n> [done|start|block|cancel|pending]  — toggle one task marker
// arc task <ref> --add "text"                            — append a new task
function cmdTask(ref, flags, rest) {
  const r = resolveForMutation(ref, flags);
  if (r.err) return r.err;
  let text = readText(r.path);
  const secRe = /(^## 4 · Tasks\n)([\s\S]*?)(?=^## |\Z)/m;
  const sec = text.match(secRe);
  if (!sec) return fail(`${r.id}: no "## 4 · Tasks" section`);
  let body = sec[2];

  if (flags.add) {
    const nums = [...body.matchAll(/^- \[[ >x!-]\]\s*T(\d+)/gm)].map((m) => parseInt(m[1], 10));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    const line = `- [ ] T${next} ${String(flags.add).trim()}\n`;
    body = body.replace(/\n*$/, "\n") + line;
    text = text.slice(0, sec.index) + sec[1] + body + text.slice(sec.index + sec[0].length);
    writeFileSync(r.path, text);
    updateArcFrontmatter(r.path, {});
    console.log(`${r.id}: added T${next}`);
    return 0;
  }

  const n = rest?.[0];
  const action = (rest?.[1] || "done").toLowerCase();
  if (!n) return fail("usage: arc task <arc> <task-number> [done|start|block|cancel|pending]  (or --add \"text\")");
  const marker = { done: "x", start: ">", block: "!", cancel: "-", pending: " " }[action];
  if (marker === undefined) return fail(`unknown task action '${action}'`);
  const tnum = String(n).replace(/[^0-9]/g, "");
  const re = new RegExp(`^(- \\[)[ >x!-](\\]\\s*T${tnum}\\b.*)$`, "m");
  if (!re.test(body)) return fail(`${r.id}: task T${tnum} not found`);
  body = body.replace(re, `$1${marker}$2`);
  text = text.slice(0, sec.index) + sec[1] + body + text.slice(sec.index + sec[0].length);
  writeFileSync(r.path, text);
  updateArcFrontmatter(r.path, {});
  console.log(`${r.id}: T${tnum} → [${marker}]`);
  return 0;
}

// arc refine <arc> "instruction" [--changed "…"] [--source chat|voice|issue|review]
// Appends the instruction verbatim to §1, bumps plan_version, logs §3, sets refining.
function cmdRefine(ref, flags, rest) {
  const r = resolveForMutation(ref, flags);
  if (r.err) return r.err;
  if (r.archived) return fail(`${r.id} is archived — restore it before refining`);
  const instruction = (rest || []).join(" ").trim() || (typeof flags.note === "string" ? flags.note : "");
  if (!instruction) return fail('what changed? usage: arc refine <arc> "the new instruction" [--changed "plan delta"]');

  const iIdx = appendInstruction(r.path, instruction, flags.source || "chat");
  const nextVer = planVersionOf(r.path) + 1;
  const changed = (typeof flags.changed === "string" && flags.changed) || instruction;
  appendRefinement(r.path, nextVer, changed, iIdx);
  updateArcFrontmatter(r.path, { plan_version: nextVer, status: "refining" });
  syncIndexRow(r.arcDir, r.id, { status: "refining", planVersion: nextVer });
  appendWorklog(r.path, `refined to plan v${nextVer} (I${iIdx})`);
  console.log(`${r.id} → refining · plan v${nextVer} · recorded I${iIdx}`);
  console.log(`Next: update §2 Plan to reflect v${nextVer}, then adjust Tasks.`);
  return 0;
}

// arc note <arc> "text" [--worklog] — quick-append an instruction (default) or a worklog note.
function cmdNote(ref, flags, rest) {
  const r = resolveForMutation(ref, flags);
  if (r.err) return r.err;
  const note = (rest || []).join(" ").trim() || (typeof flags.note === "string" ? flags.note : "");
  if (!note) return fail('usage: arc note <arc> "text" [--worklog]');
  if (flags.worklog) {
    appendWorklog(r.path, note);
    updateArcFrontmatter(r.path, {});
    console.log(`${r.id}: worklog note added`);
  } else {
    const iIdx = appendInstruction(r.path, note, flags.source || "chat");
    updateArcFrontmatter(r.path, {});
    console.log(`${r.id}: recorded I${iIdx} in Raw Instructions`);
  }
  return 0;
}

// arc log <arc> [--json] — show an arc's worklog timeline.
function cmdLog(ref, flags) {
  const r = resolveForMutation(ref, flags);
  if (r.err) return r.err;
  const entries = readWorklog(r.path);
  const a = parseArc(r.path, r.archived);
  if (flags.json) { console.log(JSON.stringify({ id: a.id, title: a.title, worklog: entries }, null, 2)); return 0; }
  console.log(`${a.id} · ${a.title} — worklog (${entries.length} entr${entries.length === 1 ? "y" : "ies"})`);
  if (!entries.length) { console.log("  (no worklog entries yet)"); return 0; }
  for (const e of entries) {
    console.log(`\n• ${e.head}`);
    for (const l of e.lines) console.log(`    ${l}`);
  }
  return 0;
}

// arc show <ref> — print one arc's plan, tasks, and status notes.
function cmdShow(ref, flags) {
  const r = resolveForMutation(ref, flags);
  if (r.err) return r.err;
  const text = readText(r.path);
  const a = parseArc(r.path, r.archived);
  const sec = (n, title) => text.match(new RegExp(`^## ${n} · ${title}\\n([\\s\\S]*?)(?=^## |\\Z)`, "m"))?.[1]?.trim() ?? "";
  if (flags.json) {
    const clean = (s) => s.replace(/<!--[\s\S]*?-->/g, "").trim();
    console.log(JSON.stringify({
      ...a,
      plan: clean(sec(2, "Plan \\(current[^)]*\\)") || sec(2, "Plan.*")),
      tasks: clean(sec(4, "Tasks")),
      status_notes: clean(sec(6, "Status Notes")),
    }, null, 2));
    return 0;
  }
  console.log(`${a.id} · ${a.title}`);
  console.log(`status: ${a.status}${r.archived ? " (archived)" : ""} · plan v${a.plan_version} · tasks ${a.tasks_total ? `${a.tasks_done}/${a.tasks_total}` : "—"} · updated ${a.updated}`);
  const plan = sec(2, "Plan \\(current[^)]*\\)") || sec(2, "Plan.*");
  if (plan) { console.log("\n— Plan —"); console.log(plan.replace(/<!--[\s\S]*?-->/g, "").trim()); }
  const tasks = sec(4, "Tasks");
  if (tasks) { console.log("\n— Tasks —"); console.log(tasks.replace(/<!--[\s\S]*?-->/g, "").trim()); }
  const notes = sec(6, "Status Notes");
  if (notes) { console.log("\n— Status —"); console.log(notes.replace(/<!--[\s\S]*?-->/g, "").trim()); }
  console.log(`\nfile: ${r.path}`);
  return 0;
}

// arc next — suggest what to work on (active_focus, then in-progress, then planned).
function cmdNext(flags) {
  const { arcDir, exists } = arcDirOf(flags);
  if (!exists) return fail("`.arc` not found — run `arc init` first");
  const { active } = listArcFiles(arcDir);
  if (!active.length) return (console.log("no active arcs — `arc new \"Title\"` to begin"), 0);
  const arcs = active.map((p) => parseArc(p, false))
    // The standing maintenance arc (ARC-0000) is always in-progress; only surface
    // it as "next" when it actually has unfinished tasks and nothing else is active.
    .filter((a) => !(a.id === "ARC-0000" && a.tasks_in_progress === 0));
  if (!arcs.length) return (console.log("no actionable arcs — `arc new \"Title\"` to begin"), 0);
  const idx = existsSync(join(arcDir, "INDEX.md")) ? readText(join(arcDir, "INDEX.md")) : "";
  const focus = idx.match(/^active_focus:\s*(.+)$/m)?.[1]?.trim();

  const byStatus = (s) => arcs.filter((a) => a.status === s);
  const pick =
    (focus && focus !== "—" && arcs.find((a) => a.id === focus || a.title.includes(focus))) ||
    byStatus("in-progress")[0] || byStatus("refining")[0] ||
    byStatus("planned")[0] || byStatus("review")[0] || byStatus("draft")[0];

  if (flags.json) {
    console.log(JSON.stringify({
      next: pick ? { id: pick.id, title: pick.title, status: pick.status,
                     tasks_done: pick.tasks_done, tasks_total: pick.tasks_total,
                     tasks_blocked: pick.tasks_blocked } : null,
      blocked: byStatus("blocked").map((a) => a.id),
    }, null, 2));
    return 0;
  }
  if (!pick) { console.log("nothing actionable — all arcs are blocked or done"); return 0; }
  console.log(`next: ${pick.id} · ${pick.title}  [${pick.status}]`);
  console.log(`  tasks ${pick.tasks_total ? `${pick.tasks_done}/${pick.tasks_total}` : "—"}${pick.tasks_blocked ? ` · ${pick.tasks_blocked} blocked` : ""}`);
  console.log(`  open:  arc show ${pick.id}`);
  const blocked = byStatus("blocked");
  if (blocked.length) console.log(`  (blocked: ${blocked.map((a) => a.id).join(", ")})`);
  return 0;
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

Steps: run \`arc status\` to see existing arcs; if an open arc already covers this, append the instruction verbatim and refine its plan; otherwise create a new arc with \`arc new "<short title>" --goal "<one-line goal>" --task "<first task>" --task "<next task>"\`. Then record the raw instruction verbatim in §1, finish the Plan with checkable acceptance criteria, and refine the Tasks. Do not start coding until the plan is acknowledged.`,
  },
  "arc-refine": {
    desc: "ARC: fold a new instruction into an existing arc (Refine)",
    body: `Read ./ARC.md, then refine the relevant arc with this instruction:

"$ARGUMENTS"

Run \`arc refine <arc> "$ARGUMENTS" --changed "<one-line plan delta>"\` — this appends the instruction verbatim to §1, bumps plan_version, adds a §3 Refinement Log entry, and sets the arc to refining. Then rewrite §2 Plan to reflect only the current intent, adjust §4 Tasks (move dropped scope to "Out of scope"), and resume construction only once the plan and tasks absorb the change. Never edit the append-only sections retroactively.`,
  },
  "arc-build": {
    desc: "ARC: do the work for the active arc (Read Before / Update After Editing)",
    body: `Read ./ARC.md. Before editing: run \`arc status\` (or read .arc/INDEX.md), fully read the arc(s) covering the files you'll touch, and read the real source files. Mark a task in progress with \`arc task <arc> <n> start\`, do the work, then tick it with \`arc task <arc> <n> done\`. After editing: append a Worklog entry (tasks, files read, files changed, summary, decisions, follow-ups), keep the arc's Status Notes current, and reference the arc id in the commit. When the arc is finished, run \`arc done <arc>\` to mark it done and archive it. An edit without a worklog entry is unfinished.

Focus: $ARGUMENTS`,
  },
  "arc-status": {
    desc: "ARC: summarize all arcs and what to resume",
    body: `Run \`arc status\` (or read .arc/INDEX.md). Report every arc's id, status, plan version, and task progress, and call out which in-progress/refining arcs to resume. For any arc that needs detail, run \`arc show <arc>\` for its plan/tasks/status and \`arc log <arc>\` for its worklog history. Then run \`arc next\` to recommend what to pick up.`,
  },
  "arc-resume": {
    desc: "ARC: pick up the in-progress arc cold",
    body: `Read ./ARC.md. Run \`arc next\` to find what to work on, then \`arc show <arc>\` and \`arc log <arc>\` to read its plan, status notes, and last worklog entries. Continue from the open tasks — after running Read Before Editing. If code and the arc disagree, the code is truth: \`arc note <arc> "drift: …" --worklog\` to record it, then correct the arc.`,
  },
  "arc-note": {
    desc: "ARC: quick-capture an instruction or worklog note onto an arc",
    body: `Capture this onto the relevant arc without rewriting the plan:

"$ARGUMENTS"

If it's a new requirement or instruction, run \`arc note <arc> "$ARGUMENTS"\` (it lands verbatim in §1 Raw Instructions). If it's a progress/decision note about work just done, run \`arc note <arc> "$ARGUMENTS" --worklog\` instead. Use \`arc status\` first if you're unsure which arc this belongs to. If it actually changes the plan or scope, use /arc-refine instead of /arc-note.`,
  },
  "arc-log": {
    desc: "ARC: show an arc's worklog history",
    body: `Run \`arc log <arc>\` for the arc referenced by "$ARGUMENTS" (resolve it via \`arc status\` if only a topic is given) and summarize its worklog timeline: what was done, in what order, and any decisions or follow-ups recorded. Then state where the arc currently stands and what the next step is.`,
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
  console.log(`Commands: /arc-new /arc-build /arc-refine /arc-note /arc-log /arc-status /arc-resume`);
  return 0;
}

const COMMAND_HELP = {
  init: `arc init [dir] [--owner=NAME]
  Scaffold ARC.md + .arc/ in dir (default: current). Idempotent — never overwrites.
  --owner NAME   arc owner (default: git config user.name)`,
  new: `arc new "Short imperative title" [options]
  Create the next arc and register it in INDEX.md.
  --goal "…"     prefill the Plan goal line
  --task "…"     add a first task (repeatable: --task a --task b)
  --tags a,b     frontmatter tags
  --owner NAME   arc owner
  --dir DIR      project dir (default: current)`,
  start: `arc start <arc>
  Set an arc to in-progress and log it. <arc> is an id or slug (e.g. ARC-0007 or rate-limit).`,
  done: `arc done <arc>
  Mark an arc done, log it, move the file to .arc/archive/, and move its INDEX row to Archived.`,
  block: `arc block <arc> [--reason "…"]
  Set an arc to blocked, recording the reason in the worklog.`,
  refine: `arc refine <arc> "the new instruction" [--changed "plan delta"] [--source chat|voice|issue|review]
  Fold a new instruction into an arc: append it verbatim to §1, bump plan_version,
  add a §3 Refinement Log entry, and set status to refining.`,
  note: `arc note <arc> "text" [--worklog] [--source …]
  Quick-append a note. Default goes to §1 Raw Instructions; --worklog appends to §5 Worklog.`,
  log: `arc log <arc> [--json]
  Show an arc's worklog timeline (newest entries as recorded).`,
  archive: `arc archive <arc> [--cancelled] [--reason "…"]
  Archive an arc. Default outcome is "done"; --cancelled archives it as cancelled.`,
  task: `arc task <arc> <n> [done|start|block|cancel|pending]
  Toggle task T<n>'s marker. Default action is "done".
  arc task <arc> --add "text"   append a new task`,
  show: `arc show <arc>
  Print one arc's plan, tasks, and status notes.`,
  next: `arc next
  Suggest what to work on (active_focus → in-progress → planned).`,
  status: `arc status [dir] [--json]
  Table of every arc: id, status, plan version, task progress.`,
  doctor: `arc doctor [dir] [--fix]
  Consistency checks (exit 1 on problems). --fix auto-repairs index/status drift.`,
  "agent-init": `arc agent-init [--agents=a,b] [--force]
  Write /arc-* slash commands for AI agents (agents: ${Object.keys(AGENT_TARGETS).join(", ")}; default: all).`,
};

function help(topic) {
  if (topic && COMMAND_HELP[topic]) { console.log(COMMAND_HELP[topic]); return 0; }
  console.log(`create-arc v${PKG.version} — ARC plan-driven development (Align → Refine → Construct)
(alias: \`arc\`)

Setup
  init [dir]                 scaffold ARC.md + .arc/ (idempotent)
  agent-init [--agents=…]    write /arc-* slash commands for AI agents

Capture & plan
  new "Title" [--goal …] [--task …] [--tags a,b]
                             create + register the next arc

Work the arc
  start <arc>                → in-progress
  task <arc> <n> [action]    tick a task ([done]/start/block/cancel/pending); --add "text"
  refine <arc> "…"           fold in a new instruction (bumps plan version → refining)
  note <arc> "…"             quick-append to Raw Instructions; --worklog for a worklog note
  block <arc> [--reason …]   → blocked
  done <arc>                 → done + archive (file + index row)
  archive <arc> [--cancelled]

Inspect
  status [dir] [--json]      table of every arc
  show <arc> [--json]        one arc's plan, tasks, status
  log <arc> [--json]         an arc's worklog timeline
  next [--json]              what to work on next
  doctor [dir] [--fix]       consistency checks (+ auto-repair)

<arc> is an id or slug: ARC-0007, 7, or a slug substring like "rate-limit".
Per-command help:  arc help <command>   (e.g. arc help new)

Run with npx: npx @ksoftm/create-arc <command>
Install:      npm i -g @ksoftm/create-arc   then use \`arc\`
Protocol reference: ARC.md in your project root after init.`);
  return 0;
}

const { pos, flags } = parseArgv(process.argv.slice(2));
const cmd = pos[0];

// per-command help: `arc help new` or `arc new --help`
if (flags.help && cmd && cmd !== "help") { process.exit(help(cmd)); }

let code;
if (flags.version || cmd === "version") { console.log(PKG.version); code = 0; }
else if (!cmd || cmd === "help") code = help(pos[1]);
else if (cmd === "init") code = cmdInit(pos[1], flags);
else if (cmd === "new") code = cmdNew(pos.slice(1).join(" "), flags);
else if (cmd === "status") code = cmdStatus(pos[1], flags);
else if (cmd === "doctor") code = cmdDoctor(pos[1], flags);
else if (cmd === "agent-init" || cmd === "agents") code = cmdAgentInit(flags);
else if (cmd === "start") code = cmdStart(pos[1], flags);
else if (cmd === "done") code = cmdDone(pos[1], flags);
else if (cmd === "block") code = cmdBlock(pos[1], flags);
else if (cmd === "review") code = cmdReview(pos[1], flags);
else if (cmd === "refine") code = cmdRefine(pos[1], flags, pos.slice(2));
else if (cmd === "note") code = cmdNote(pos[1], flags, pos.slice(2));
else if (cmd === "log") code = cmdLog(pos[1], flags);
else if (cmd === "archive") code = cmdArchive(pos[1], flags);
else if (cmd === "task") code = cmdTask(pos[1], flags, pos.slice(2));
else if (cmd === "show" || cmd === "view") code = cmdShow(pos[1], flags);
else if (cmd === "next") code = cmdNext(flags);
else code = fail(`unknown command '${cmd}' — try: arc help`);

process.exit(code);
