import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "bin", "cli.js");
const run = (cwd, args) => execFileSync("node", [CLI, ...args], { cwd, encoding: "utf8" });
const fresh = () => mkdtempSync(join(tmpdir(), "arc-test-"));

test("init creates the framework files and stamps placeholders", () => {
  const dir = fresh();
  try {
    run(dir, ["init", "--owner", "tester"]);
    for (const f of ["ARC.md", ".arc/INDEX.md", ".arc/_TEMPLATE.md", ".arc/ARC-0000-maintenance.md",
                     ".arc/notes/.gitkeep", ".arc/archive/.gitkeep"]) {
      assert.ok(existsSync(join(dir, f)), `${f} should exist`);
    }
    const maint = readFileSync(join(dir, ".arc/ARC-0000-maintenance.md"), "utf8");
    assert.match(maint, /owner: tester/);
    assert.doesNotMatch(maint, /\{\{DATE\}\}|\{\{OWNER\}\}/, "placeholders should be substituted");
    assert.match(readFileSync(join(dir, ".arc/INDEX.md"), "utf8"), /next_id: ARC-0001/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("init is idempotent and never overwrites", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    const before = readFileSync(join(dir, "ARC.md"), "utf8");
    const out = run(dir, ["init"]);
    assert.match(out, /skip/, "second init should skip existing files");
    assert.equal(readFileSync(join(dir, "ARC.md"), "utf8"), before, "existing files untouched");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("new takes and increments the id, registers the index row", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["new", "Add rate limiting", "--tags", "api,infra"]);
    assert.ok(existsSync(join(dir, ".arc/ARC-0001-add-rate-limiting.md")), "ARC-0001 file created");
    const arc = readFileSync(join(dir, ".arc/ARC-0001-add-rate-limiting.md"), "utf8");
    assert.match(arc, /^id: ARC-0001$/m);
    assert.match(arc, /^tags: \[api, infra\]$/m);
    assert.match(arc, /# ARC-0001 · Add rate limiting/);
    const index = readFileSync(join(dir, ".arc/INDEX.md"), "utf8");
    assert.match(index, /next_id: ARC-0002/, "next_id incremented");
    assert.match(index, /\| ARC-0001 \| Add rate limiting \| draft \|/, "index row added");

    run(dir, ["new", "Second thing"]);
    assert.ok(existsSync(join(dir, ".arc/ARC-0002-second-thing.md")), "ARC-0002 file created");
    assert.match(readFileSync(join(dir, ".arc/INDEX.md"), "utf8"), /next_id: ARC-0003/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("status reports arcs as JSON with task counts", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["new", "Build thing"]);
    const arcs = JSON.parse(run(dir, ["status", "--json"]));
    const ids = arcs.map((a) => a.id);
    assert.ok(ids.includes("ARC-0000"), "maintenance arc present");
    assert.ok(ids.includes("ARC-0001"), "new arc present");
    const a1 = arcs.find((a) => a.id === "ARC-0001");
    assert.equal(a1.status, "draft");
    assert.equal(a1.tasks_total, 3, "template ships three placeholder tasks");
    assert.equal(a1.tasks_done, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("doctor passes on a healthy project", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["new", "Healthy arc"]);
    const out = run(dir, ["doctor"]);
    assert.match(out, /doctor: healthy/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("doctor fails when an index row is missing", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["new", "Orphan arc"]);
    const indexPath = join(dir, ".arc/INDEX.md");
    const index = readFileSync(indexPath, "utf8")
      .split("\n").filter((l) => !l.includes("ARC-0001")).join("\n");
    writeFileSync(indexPath, index);
    assert.throws(() => run(dir, ["doctor"]), /Command failed|error/i, "doctor should exit non-zero");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("handles CRLF line endings in templates (Windows checkout)", () => {
  const dir = fresh();
  try {
    run(dir, ["init", "--owner", "tester"]);
    // Simulate a Windows/git-autocrlf checkout: rewrite the arc files with CRLF.
    for (const f of [".arc/_TEMPLATE.md", ".arc/INDEX.md", ".arc/ARC-0000-maintenance.md"]) {
      const p = join(dir, f);
      writeFileSync(p, readFileSync(p, "utf8").replace(/\n/g, "\r\n"));
    }
    // `new` parses _TEMPLATE.md frontmatter — this is exactly what broke on Windows.
    run(dir, ["new", "CRLF safe", "--tags", "win"]);
    const arc = readFileSync(join(dir, ".arc/ARC-0001-crlf-safe.md"), "utf8");
    assert.match(arc, /^id: ARC-0001$/m, "frontmatter parsed despite CRLF templates");
    assert.match(readFileSync(join(dir, ".arc/INDEX.md"), "utf8"), /next_id: ARC-0002/);
    // status + doctor must also tolerate CRLF in the arc/index files.
    const arcs = JSON.parse(run(dir, ["status", "--json"]));
    assert.ok(arcs.some((a) => a.id === "ARC-0001"));
    assert.match(run(dir, ["doctor"]), /doctor: healthy/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("new works even when INDEX.md has no arc rows yet (robust insertion)", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    // Simulate an older/hand-edited INDEX with the Active table header but no ARC rows.
    const indexPath = join(dir, ".arc/INDEX.md");
    writeFileSync(indexPath,
      "# ARC Index\n\nnext_id: ARC-0002\n\n## Active\n\n" +
      "| ID | Title | Status | Plan v | Updated | Depends | File |\n" +
      "|---|---|---|---|---|---|---|\n\n## Archived\n");
    run(dir, ["new", "recover"]);   // previously failed: "could not locate the Active table"
    assert.ok(existsSync(join(dir, ".arc/ARC-0002-recover.md")));
    assert.match(readFileSync(indexPath, "utf8"), /\| ARC-0002 \| recover \|/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("new rebuilds a missing Active section instead of failing", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    const indexPath = join(dir, ".arc/INDEX.md");
    writeFileSync(indexPath, "# ARC Index\n\nnext_id: ARC-0007\n");   // no Active section at all
    run(dir, ["new", "synthesize table"]);
    const idx = readFileSync(indexPath, "utf8");
    assert.match(idx, /## Active/);
    assert.match(idx, /\| ARC-0007 \| synthesize table \|/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("agent-init writes slash commands for all agents", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["agent-init"]);
    for (const f of [".claude/commands/arc-new.md", ".opencode/command/arc-build.md",
                     ".cursor/commands/arc-status.md", ".codex/prompts/arc-resume.md",
                     ".gemini/commands/arc-refine.toml"]) {
      assert.ok(existsSync(join(dir, f)), `${f} should exist`);
    }
    assert.match(readFileSync(join(dir, ".claude/commands/arc-new.md"), "utf8"), /description:/);
    assert.match(readFileSync(join(dir, ".gemini/commands/arc-new.toml"), "utf8"), /^description = /m);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("agent-init --agents filters to selected agents", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["agent-init", "--agents", "claude,opencode"]);
    assert.ok(existsSync(join(dir, ".claude/commands/arc-new.md")));
    assert.ok(existsSync(join(dir, ".opencode/command/arc-new.md")));
    assert.ok(!existsSync(join(dir, ".gemini")), "unselected agents should not be created");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("new --goal and --task prefill the plan and tasks", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["new", "rate limiting", "--goal", "per-key limits", "--task", "design", "--task", "wire it"]);
    const arc = readFileSync(join(dir, ".arc/ARC-0001-rate-limiting.md"), "utf8");
    assert.match(arc, /\*\*Goal:\*\* per-key limits/);
    assert.match(arc, /- \[ \] T1 design/);
    assert.match(arc, /- \[ \] T2 wire it/);
    assert.doesNotMatch(arc, /T1 <…>/, "placeholder tasks should be replaced");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("start moves an arc to in-progress and syncs the index", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["new", "feature x"]);
    run(dir, ["start", "1"]);
    assert.match(readFileSync(join(dir, ".arc/ARC-0001-feature-x.md"), "utf8"), /^status: in-progress/m);
    const idx = readFileSync(join(dir, ".arc/INDEX.md"), "utf8");
    assert.match(idx, /\| ARC-0001 \| feature x \| in-progress \|/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("task ticks markers and --add appends a task", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["new", "feature y", "--task", "one", "--task", "two"]);
    run(dir, ["task", "1", "1", "done"]);
    run(dir, ["task", "1", "2", "start"]);
    run(dir, ["task", "1", "--add", "three"]);
    const arc = readFileSync(join(dir, ".arc/ARC-0001-feature-y.md"), "utf8");
    assert.match(arc, /- \[x\] T1 one/);
    assert.match(arc, /- \[>\] T2 two/);
    assert.match(arc, /- \[ \] T3 three/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("block records the reason in the worklog", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["new", "feature z"]);
    run(dir, ["block", "1", "--reason", "waiting on redis"]);
    const arc = readFileSync(join(dir, ".arc/ARC-0001-feature-z.md"), "utf8");
    assert.match(arc, /^status: blocked/m);
    assert.match(arc, /blocked: waiting on redis/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("done marks done, moves the file to archive, and moves the index row", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["new", "shippable"]);
    run(dir, ["done", "1"]);
    assert.ok(!existsSync(join(dir, ".arc/ARC-0001-shippable.md")), "file should leave .arc/");
    assert.ok(existsSync(join(dir, ".arc/archive/ARC-0001-shippable.md")), "file should be in archive/");
    const idx = readFileSync(join(dir, ".arc/INDEX.md"), "utf8");
    const active = idx.split("## Archived")[0];
    const archived = idx.split("## Archived")[1];
    assert.doesNotMatch(active, /ARC-0001/, "row should leave Active");
    assert.match(archived, /\| ARC-0001 \| shippable \| done \|/, "row should be in Archived");
    // index still consistent after archiving
    run(dir, ["doctor"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("archive --cancelled archives with cancelled outcome", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["new", "abandoned"]);
    run(dir, ["archive", "1", "--cancelled", "--reason", "wont fix"]);
    assert.ok(existsSync(join(dir, ".arc/archive/ARC-0001-abandoned.md")));
    assert.match(readFileSync(join(dir, ".arc/INDEX.md"), "utf8"), /\| ARC-0001 \| abandoned \| cancelled \|/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("show resolves an arc by slug substring", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["new", "the login flow"]);
    const out = run(dir, ["show", "login"]);
    assert.match(out, /ARC-0001 · the login flow/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("next skips the standing maintenance arc and picks real work", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["new", "real work"]);
    const out = run(dir, ["next"]);
    assert.match(out, /next: ARC-0001 · real work/);
    assert.doesNotMatch(out, /next: ARC-0000/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("doctor --fix repairs index status drift", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["new", "drifter"]);
    run(dir, ["start", "1"]);
    // corrupt the index row's status back to draft
    const idxPath = join(dir, ".arc/INDEX.md");
    writeFileSync(idxPath, readFileSync(idxPath, "utf8").replace("| in-progress |", "| draft |"));
    run(dir, ["doctor", "--fix"]);
    assert.match(readFileSync(idxPath, "utf8"), /\| ARC-0001 \| drifter \| in-progress \|/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("per-command help prints for a topic and via --help", () => {
  const dir = fresh();
  try {
    assert.match(run(dir, ["help", "new"]), /arc new/);
    assert.match(run(dir, ["start", "--help"]), /arc start <arc>/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("refine appends an instruction, bumps the plan version, and logs it", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["new", "search feature"]);
    run(dir, ["refine", "1", "also support fuzzy matching", "--changed", "added fuzzy to scope"]);
    const arc = readFileSync(join(dir, ".arc/ARC-0001-search-feature.md"), "utf8");
    assert.match(arc, /^status: refining/m);
    assert.match(arc, /^plan_version: 2/m);
    assert.match(arc, /### I2 — \d{4}-\d{2}-\d{2}/);          // instruction appended to §1
    assert.match(arc, /> also support fuzzy matching/);
    assert.match(arc, /### v2 — \d{4}-\d{2}-\d{2} — triggered by I2/); // §3 entry
    assert.match(arc, /changed: added fuzzy to scope/);
    assert.match(readFileSync(join(dir, ".arc/INDEX.md"), "utf8"), /\| ARC-0001 \| search feature \| refining \| 2 \|/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("note appends to Raw Instructions, and --worklog appends to the Worklog", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["new", "noted"]);
    run(dir, ["note", "1", "handle unicode input"]);
    run(dir, ["note", "1", "spiked a library, too heavy", "--worklog"]);
    const arc = readFileSync(join(dir, ".arc/ARC-0001-noted.md"), "utf8");
    assert.match(arc, /> handle unicode input/);                 // in §1
    assert.match(arc, /spiked a library, too heavy/);            // in §5
    const wl = arc.split("## 5 · Worklog")[1];
    assert.match(wl, /spiked a library/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("log lists worklog entries and supports --json", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["new", "logged"]);
    run(dir, ["start", "1"]);
    run(dir, ["note", "1", "a progress note", "--worklog"]);
    const txt = run(dir, ["log", "1"]);
    assert.match(txt, /worklog \(\d+ entr/);
    assert.match(txt, /a progress note/);
    const j = JSON.parse(run(dir, ["log", "1", "--json"]));
    assert.equal(j.id, "ARC-0001");
    assert.ok(Array.isArray(j.worklog) && j.worklog.length >= 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("show --json and next --json emit structured data", () => {
  const dir = fresh();
  try {
    run(dir, ["init"]);
    run(dir, ["new", "structured", "--goal", "a goal", "--task", "t one"]);
    const s = JSON.parse(run(dir, ["show", "1", "--json"]));
    assert.equal(s.id, "ARC-0001");
    assert.match(s.plan, /a goal/);
    assert.match(s.tasks, /t one/);
    run(dir, ["start", "1"]);
    const n = JSON.parse(run(dir, ["next", "--json"]));
    assert.equal(n.next.id, "ARC-0001");
    assert.equal(n.next.status, "in-progress");
    assert.ok(Array.isArray(n.blocked));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("version prints the package version", () => {
  const out = run(process.cwd(), ["--version"]).trim();
  assert.match(out, /^\d+\.\d+\.\d+$/);
});
