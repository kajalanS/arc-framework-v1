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
6. [What an arc looks like](#what-an-arc-looks-like)
7. [The two flows: plan→develop and plan→refine→develop](#the-two-flows)
8. [CLI command reference](#cli-command-reference)
9. [Slash commands for AI agents](#slash-commands-for-ai-agents)
10. [Working without an AI agent](#working-without-an-ai-agent)
11. [Team usage & git](#team-usage--git)
12. [Troubleshooting](#troubleshooting)
13. [FAQ](#faq)

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

The everyday rhythm has four moves. You can do each from the CLI, from your agent's slash commands, or by just talking to your agent (it follows `ARC.md`).

### 1. Capture an instruction → **Align**

When you have something to build, capture it as an arc:

```bash
arc new "Add per-key rate limiting to the gateway" --tags api,infra
```

or in your agent:

```
/arc-new Add per-key rate limiting to the gateway
```

This records your exact words, drafts a plan with checkable acceptance criteria, and lists the tasks. **Your instruction is stored verbatim** — typos, voice-transcription quirks and all — because the original wording is evidence of intent.

### 2. Build it → **Construct**

In your agent:

```
/arc-build
```

The agent reads the arc and the real source files first (**Read Before Editing**), works the task list, and — crucially — **logs what it did afterward** (**Update After Editing**): which tasks advanced, which files changed, decisions made, follow-ups discovered. An edit without a worklog entry is treated as unfinished.

### 3. Change your mind → **Refine**

New requirement mid-flight? Don't start a new arc — refine the existing one:

```
/arc-refine actually make the limit configurable per plan tier
```

Your new instruction is appended verbatim, the plan bumps a version (with a logged reason), and the tasks adjust. Nothing is silently rewritten; the history of *why the plan changed* is preserved.

### 4. Check in / resume → **Status**

```bash
arc status                # table of every arc: id, status, plan version, task progress
arc status --json         # same data, machine-readable
```

or in your agent:

```
/arc-status               # summarize everything and say what to resume
/arc-resume               # pick up the in-progress arc cold
```

Because every edit was logged, a brand-new session — even in a different tool — can read the arc and continue exactly where the last one stopped.

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
arc new "Title" [--dir=.] [--tags=a,b] [--owner=NAME]
arc status [dir] [--json]
arc doctor [dir]
arc agent-init [--agents=a,b] [--force]
arc help        arc --version
```

| Command | What it does |
|---|---|
| `init [dir]` | Scaffold `ARC.md` + `.arc/`. Idempotent — never overwrites. |
| `new "Title"` | Take the next sequential ID, create the arc from the template, register its row in `INDEX.md`, and bump `next_id`. |
| `status [dir]` | Print a table (or `--json`) of every arc: ID, status, plan version, task progress, and which arcs to resume. |
| `doctor [dir]` | Consistency checks — index ↔ file bijection, ID/`next_id` sanity, valid statuses. Exits non-zero on problems (good for CI). |
| `agent-init` | Generate `/arc-*` slash commands for AI agents. `--agents claude,opencode` picks specific ones; `--force` overwrites. |

Common options: `--owner NAME` (defaults to `git config user.name`), `--tags a,b`, `--dir`, `--json`, `--agents a,b`, `--force`, `--version`, `--help`.

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
