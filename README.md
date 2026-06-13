# ARC — Align · Refine · Construct

**Plan-driven development for AI agents, in pure Markdown.**

ARC makes any AI coding agent **plan before it builds, keep the plan honest while it builds, and leave an audit trail after it builds**. Every unit of work becomes an *arc*: one Markdown file in `.arc/` that holds the original instruction (verbatim), the current plan, a refinement log, a task list, a worklog, and a status — so any later session (yours or a different tool's) can resume from the file instead of the chat history.

Works with any agent that reads files — **Claude Code, opencode, Codex, Cursor, Gemini CLI** — and any language or stack. No runtime, no lock-in.

---

## Table of contents

1. [The 60-second version](#the-60-second-version)
2. [Install](#install)
3. [Step 1 — Initialize a project](#step-1--initialize-a-project)
4. [Step 2 — Wire up your AI agent](#step-2--wire-up-your-ai-agent)
5. [Step 3 — The daily loop](#step-3--the-daily-loop)
6. [Step 4 — Keeping it healthy](#step-4--keeping-it-healthy)
7. [What an arc looks like](#what-an-arc-looks-like)
8. [The two flows: plan→develop and plan→refine→develop](#the-two-flows)
9. [CLI command reference](#cli-command-reference)
10. [Slash commands for AI agents](#slash-commands-for-ai-agents)
11. [Working without an AI agent](#working-without-an-ai-agent)
12. [Team usage & git](#team-usage--git)
13. [Troubleshooting](#troubleshooting)
14. [FAQ](#faq)

---

## The 60-second version

```bash
# 1. install
npm i -g @ksoftm/create-arc

# 2. set up your project (run inside the repo)
arc init                 # creates ARC.md + .arc/
arc agent-init           # adds /arc-* slash commands for your AI agent

# 3. capture work
arc new "Add rate limiting to the gateway"

# 4. in your AI agent, drive it with slash commands
#    /arc-build   → does the work, logs progress
#    /arc-status  → shows every arc and what to resume

# 5. check the state anytime
arc status
```

That's the whole workflow. The rest of this document explains each piece.

---

## Install

ARC ships as the npm package [`@ksoftm/create-arc`](https://www.npmjs.com/package/@ksoftm/create-arc). It installs two equivalent commands: the short **`arc`** and the long **`create-arc`**. Requires **Node ≥ 18**.

Pick whichever install style fits:

| Style | Command | Then run | Best for |
|---|---|---|---|
| **Global** | `npm i -g @ksoftm/create-arc` | `arc <command>` | Using ARC across many projects |
| **No install** | — | `npx @ksoftm/create-arc <command>` | One-off / trying it out |
| **Project dev-dep** | `npm i -D @ksoftm/create-arc` | `npx arc <command>` | Pinning the version for a team |

> Everywhere below uses `arc <command>`. If you didn't install globally, prefix with `npx` — e.g. `npx @ksoftm/create-arc init`.

Verify it's working:

```bash
arc --version
arc help
```

---

## Step 1 — Initialize a project

From the root of the repository you want to manage:

```bash
arc init
```

This creates the following (it's **idempotent** — it never overwrites files that already exist, so it's safe to re-run):

```
your-project/
├── ARC.md                          ← the protocol your AI agent reads
└── .arc/
    ├── INDEX.md                    ← registry of all arcs + the next_id counter
    ├── _TEMPLATE.md                ← the blank arc shape
    ├── ARC-0000-maintenance.md     ← standing lane for trivial fixes
    ├── notes/                      ← long research, linked from arcs
    └── archive/                    ← closed arcs (history is kept, never deleted)
```

Options:

- `arc init /path/to/project` — initialize a different directory (default: current).
- `arc init --owner "Your Name"` — sets the arc owner (defaults to your `git config user.name`).

Commit these files — ARC lives in your repo alongside your code.

---

## Step 2 — Wire up your AI agent

Generate slash commands so you can drive ARC from your agent's chat:

```bash
arc agent-init                          # all supported agents
arc agent-init --agents claude,opencode # or only the ones you use
```

This writes command files into the right place for each agent:

| Agent | Files written to | Invoke with |
|---|---|---|
| Claude Code | `.claude/commands/` | `/arc-new`, `/arc-build`, … |
| opencode | `.opencode/command/` | `/arc-new`, `/arc-build`, … |
| Cursor | `.cursor/commands/` | `/arc-new`, `/arc-build`, … |
| Codex | `.codex/prompts/` | `/arc-new`, `/arc-build`, … |
| Gemini CLI | `.gemini/commands/` | `/arc-new`, `/arc-build`, … |

Each command is a short prompt that points the agent at `ARC.md` and runs the matching ARC step. Re-run with `--force` to overwrite existing command files after an upgrade.

> **Optional but recommended:** if your repo has an `AGENTS.md` or `CLAUDE.md`, add a one-line pointer so the agent always follows ARC, even when you don't use a slash command:
> ```markdown
> ## ARC (plan-driven development)
> This project uses ARC. Before any development work, read ./ARC.md and follow it:
> no code changes without an arc in .arc/ — Read Before Editing, Update After Editing.
> ```

---

## Step 3 — The daily loop

Every move has a CLI command *and* an agent slash command — use whichever fits the moment. `<arc>` everywhere is an id or slug: `ARC-0007`, `7`, or a substring like `rate-limit`.

### 1. Capture an instruction → **Align**

```bash
arc new "Add per-key rate limiting" --goal "limit requests per API key" \
  --task "design limiter" --task "wire middleware" --tags api,infra
```

`--goal` prefills the plan's goal line and each `--task` seeds a task, so the arc opens half-written instead of full of placeholders. Or in your agent: `/arc-new Add per-key rate limiting`.

Your exact words are stored verbatim — typos, voice-transcription quirks and all — because the original wording is evidence of intent.

### 2. Build it → **Construct**

Drive the arc through its lifecycle from the CLI:

```bash
arc start <arc>              # → in-progress (logged)
arc task <arc> 1 start       # mark task T1 in progress
arc task <arc> 1 done        # tick T1 done
arc task <arc> --add "write integration tests"
arc done <arc>               # → done, archive the file, move its index row
```

Or let your agent do it: `/arc-build`. Either way the agent reads the arc and real source first (**Read Before Editing**) and logs a worklog entry after (**Update After Editing**). An edit without a worklog entry is unfinished.

Stuck? `arc block <arc> --reason "waiting on redis"` records the blocker.

### 3. Change your mind → **Refine**

New requirement mid-flight? Don't start a new arc — refine the existing one:

```bash
arc refine <arc> "make the limit configurable per plan tier" --changed "limit is now per-tier"
arc note <arc> "remember to document the new env var"   # quick capture, no version bump
```

`refine` appends your instruction verbatim, bumps the plan version (with a logged reason), sets the arc to `refining`, and adds a §3 Refinement Log entry. `note` is the lighter touch — it just records a thought into Raw Instructions (or the Worklog with `--worklog`) without changing the plan. Agent equivalent: `/arc-refine make the limit configurable per plan tier`. Nothing is silently rewritten.

### 4. Check in / resume → **Status**

```bash
arc status                   # table of every arc: id, status, plan version, task progress
arc next                     # what to work on next (skips the standing maintenance arc)
arc show <arc>               # one arc's plan, tasks, and status notes
arc doctor --fix             # check consistency and auto-repair index/status drift
```

Agent equivalents: `/arc-status` and `/arc-resume`. Because every step is logged, a fresh session — even in a different tool — picks up exactly where the last one stopped.

---

## What an arc looks like

Each arc is one Markdown file with YAML frontmatter and six fixed sections:

```markdown
---
id: ARC-0001
title: Add per-key rate limiting
status: in-progress        # draft | planned | refining | in-progress | blocked | review | done | cancelled
plan_version: 2
scope: [src/middleware/, src/lib/limits.ts]
tags: [api, infra]
---

# ARC-0001 · Add per-key rate limiting

## 1 · Raw Instructions      ← your exact words, append-only (never edited)
## 2 · Plan (current)        ← the current plan only, with acceptance criteria
## 3 · Refinement Log        ← one entry per plan-version change, append-only
## 4 · Tasks                 ← T1, T2, … with live states
## 5 · Worklog               ← one entry per edit session, append-only
## 6 · Status Notes          ← one-glance "where is this?"
```

**Task states** used in section 4:

| Marker | Meaning |
|---|---|
| `- [ ] T1` | pending |
| `- [>] T2` | in progress (keep 1–2 at a time) |
| `- [x] T3` | done |
| `- [!] T4` | blocked: *reason* |
| `- [-] T5` | cancelled: *reason* |

The append-only sections (Raw Instructions, Refinement Log, Worklog) are the audit trail — they're never rewritten. Everything else stays current.

---

## The two flows

ARC sanctions exactly two ways work moves:

**Fast lane — plan → develop**
```
draft → planned → in-progress → review → done → (archive/)
```
Clear instruction, plan it, build it.

**Refine lane — plan → refine/update → develop**
```
draft → planned → refining → planned (v2…vN) → in-progress → done
```
When a new instruction lands on work already underway, the arc goes to `refining`, the plan bumps a version, and construction resumes once the tasks absorb the change.

A finished arc moves to `.arc/archive/` (its row stays in `INDEX.md` as a record). Trivial typo-level fixes don't need their own arc — they're logged in the standing `ARC-0000-maintenance` arc instead.

---

## CLI command reference

```
arc init [dir] [--owner=NAME]
arc new "Title" [--goal "…"] [--task "…"]… [--tags=a,b] [--owner=NAME] [--dir=.]
arc start <arc>
arc task <arc> <n> [done|start|block|cancel|pending]   |   arc task <arc> --add "text"
arc refine <arc> "instruction" [--changed "…"] [--source chat|voice|issue|review]
arc note <arc> "text" [--worklog]
arc block <arc> [--reason "…"]
arc done <arc>
arc archive <arc> [--cancelled] [--reason "…"]
arc show <arc> [--json]
arc log <arc> [--json]
arc next [--json]
arc status [dir] [--json]
arc doctor [dir] [--fix]
arc agent-init [--agents=a,b] [--force]
arc help [command]      arc --version
```

`<arc>` is an **id or slug**: `ARC-0007`, `7`, `0007`, or a filename substring like `rate-limit`.

| Command | What it does |
|---|---|
| `init [dir]` | Scaffold `ARC.md` + `.arc/`. Idempotent — never overwrites. |
| `new "Title"` | Take the next ID, create the arc, register its `INDEX.md` row, bump `next_id`. `--goal`/`--task` prefill the plan and tasks. |
| `start <arc>` | Set the arc to `in-progress` and log it. |
| `task <arc> <n> [action]` | Toggle task T`<n>` — `done` (default), `start`, `block`, `cancel`, `pending`. `--add "text"` appends a new task. |
| `refine <arc> "…"` | Fold a new instruction into the arc: append it verbatim to §1, bump `plan_version`, add a §3 Refinement Log entry, set status `refining`. `--changed` records the plan delta. |
| `note <arc> "…"` | Quick-append a note — to §1 Raw Instructions by default, or §5 Worklog with `--worklog`. |
| `block <arc>` | Set the arc to `blocked`; `--reason` is recorded in the worklog. |
| `done <arc>` | Mark `done`, log it, move the file to `.arc/archive/`, and move its row to the Archived table. |
| `archive <arc>` | Archive the arc. Default outcome `done`; `--cancelled` archives as cancelled. |
| `show <arc>` | Print one arc's plan, tasks, and status notes. `--json` for structured output. |
| `log <arc>` | Show the arc's worklog timeline. `--json` for structured output. |
| `next` | Suggest what to work on (active focus → in-progress → planned), skipping the standing maintenance arc. `--json` supported. |
| `status [dir]` | Table (or `--json`) of every arc: ID, status, plan version, task progress, what to resume. |
| `doctor [dir]` | Consistency checks — index ↔ file bijection, id/`next_id` sanity, valid statuses. Exits non-zero on problems. `--fix` auto-repairs id mismatches, index status drift, and the `next_id` counter. |
| `agent-init` | Generate `/arc-*` slash commands for AI agents. `--agents claude,opencode` picks specific ones; `--force` overwrites. |

Common options: `--owner NAME` (defaults to `git config user.name`), `--goal "…"`, `--task "…"` (repeatable), `--changed "…"`, `--source …`, `--worklog`, `--tags a,b`, `--reason "…"`, `--cancelled`, `--fix`, `--json`, `--dir`, `--agents a,b`, `--force`, `--version`, `--help`. Per-command help: `arc help <command>` or `arc <command> --help`.

---

## Slash commands for AI agents

After `arc agent-init`, these are available in your agent (type `/` then the name):

| Command | Step | What the agent does |
|---|---|---|
| `/arc-new <instruction>` | Align | Capture the instruction as a new arc (or fold into a covering one), draft the plan and tasks. |
| `/arc-build [focus]` | Construct | Read the arc + source first, do the work, then log the worklog entry and update the index. |
| `/arc-refine <instruction>` | Refine | Append the new instruction verbatim, bump the plan version, adjust tasks. |
| `/arc-status` | — | Summarize every arc and say what to resume. |
| `/arc-resume` | — | Open the in-progress arc, read its last worklog entry, and continue. |

All five route the agent through `ARC.md`, so behavior is consistent across Claude Code, opencode, Codex, Cursor, and Gemini CLI.

---

## Working without an AI agent

ARC is just Markdown — you can run it entirely by hand:

1. `arc new "..."` to create the arc, then open the file and fill in the Plan and Tasks yourself.
2. As you work, tick tasks (`[ ]` → `[>]` → `[x]`) and add a Worklog entry per session.
3. `arc status` to see where everything stands.
4. `arc doctor` before committing to catch index/file mismatches.

The CLI handles the error-prone bookkeeping (sequential IDs, the `next_id` counter, index rows); you write the prose.

---

## Team usage & git

- **Commit `.arc/` and `ARC.md`** — they belong in the repo with your code.
- **Commit the agent command dirs** (`.claude/`, `.opencode/`, etc.) so teammates get the same slash commands.
- **Reference arcs in commit messages**: `[ARC-0007] add redis limiter`. This ties git history to the plan that motivated each change.
- **Run `arc doctor` in CI** to keep the registry consistent on every push:
  ```yaml
  - run: npx @ksoftm/create-arc doctor
  ```

---

## Troubleshooting

**`could not locate the Active table in INDEX.md`**
An older `.arc/INDEX.md` had a different table shape. Upgrade to the latest version (`npm i -g @ksoftm/create-arc@latest`) — `new` now rebuilds the Active table automatically. If you're mid-upgrade, running `arc new` again with the current version fixes the file in place.

**`arc: command not found`**
You didn't install globally. Either `npm i -g @ksoftm/create-arc`, or use `npx @ksoftm/create-arc <command>`.

**Slash commands don't appear in my agent**
Run `arc agent-init` inside the project, restart the agent so it re-scans its command directory, and confirm the file landed in the right place for your agent (see the table in [Step 2](#step-2--wire-up-your-ai-agent)). Use `--force` if you upgraded and need to refresh them.

**`arc doctor` reports a mismatch**
An arc file exists without an `INDEX.md` row (or vice versa), or a frontmatter `id` doesn't match its filename. Open the flagged file and align the `id`, or add/remove the corresponding index row.

**Windows line endings**
The tooling normalizes CRLF/LF automatically, so arcs created on Windows and committed on macOS/Linux behave identically.

---

## FAQ

**Does ARC replace `AGENTS.md` / `CLAUDE.md`?**
No — it complements them. Those describe *how to work in the codebase*; ARC tracks *what was asked, what the plan is, and what got done*.

**Where do plans live?**
In `.arc/`, one Markdown file per unit of work, committed alongside your code.

**Is anything sent anywhere?**
No. ARC is local Markdown files plus a zero-dependency CLI. No telemetry, no network calls, no runtime.

**Can I use it in a non-JavaScript project?**
Yes. The CLI is a tool you run; the arcs are plain Markdown. ARC has nothing to do with your project's language.

**What about tiny fixes that don't deserve a whole arc?**
Log them in the standing `ARC-0000-maintenance` arc — traceable, without ceremony.

---

## License

MIT © Ksoftm (Kajalan)
