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

test("version prints the package version", () => {
  const out = run(process.cwd(), ["--version"]).trim();
  assert.match(out, /^\d+\.\d+\.\d+$/);
});
