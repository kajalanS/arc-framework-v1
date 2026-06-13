---
name: arc
description: Plan-driven development with the ARC framework (Align → Refine → Construct) — every unit of work is captured verbatim, planned, refined, and tracked in .arc/ Markdown files with tasks, worklogs, and statuses. Use this skill whenever the user mentions ARC, an arc, .arc, ARC.md, plan-driven development, or says things like "init ARC", "create an arc for this", "refine/update the arc/plan", "what's the status", "continue where we left off", or "resume" — and ALWAYS when working in any repository that contains a .arc/ directory or an ARC.md file, even if the user gives an ordinary coding instruction without mentioning ARC. Also use it when the user wants to scaffold or install ARC into a project (including via npm/npx create-arc), or wants development instructions logged with plans, task lists, and progress that survive across sessions.
license: MIT
---

# ARC — plan-driven development

ARC turns development instructions into auditable plans before any code is written, and keeps those plans truthful while the code is written. Every unit of work is an **arc**: one Markdown file in `.arc/` holding the user's raw instructions (verbatim, append-only), the current plan, a refinement log, a task list, a worklog, and status. The two sanctioned flows are **plan → develop** and **plan → refine/update → develop**.

The full binding ruleset lives in `references/protocol.md`. Read it once per session before doing ARC work — it is short and it is the contract. The blank arc shape is `assets/templates/_TEMPLATE.md`; follow its section order and frontmatter exactly when writing arc content.

## Detect

At the start of work in any repository, check for `.arc/` or `ARC.md`. If either exists, the protocol is binding for all development work in that repo — even when the user's request doesn't mention ARC. If neither exists and the user asks for ARC (or the conversation is clearly about adopting it), offer to initialize.

## Initialize

Scaffold with the bundled script (idempotent — it skips files that already exist):

```bash
python3 scripts/arc_init.py /path/to/project --owner "name"
```

This creates `ARC.md` (the protocol, at the project root) and `.arc/` with `INDEX.md`, `_TEMPLATE.md`, `ARC-0000-maintenance.md` (the standing lane for trivial fixes), `notes/`, and `archive/`, stamping today's date. `--owner` defaults to the project's `git config user.name`.

Equivalent for users working outside this environment: `npx @ksoftm/create-arc init` (same templates, same result). Users can also run `arc agent-init` to generate `/arc-*` slash commands for their coding agent. If the user already gave development instructions, run Intake on them immediately after initializing.

## Intake (Align)

When the user gives a development instruction, read `.arc/INDEX.md` first, then decide:

- **An open arc covers it** → append the instruction verbatim to that arc's Raw Instructions as the next `I<n>`, write a Refinement Log entry, update the Plan and Tasks (see Refine below).
- **Only a closed arc relates** → create a new arc and link it via `relates_to`; never reopen closed arcs.
- **Nothing covers it** → create a new arc:

```bash
python3 scripts/arc_new.py /path/to/project --title "Short imperative title" --tags api,infra
```

The script handles the bookkeeping that's easy to get wrong by hand: takes the next ID from `INDEX.md`, increments `next_id`, creates the file from `_TEMPLATE.md` with dates stamped, and registers the INDEX row. Then fill in the sections yourself — the instruction, the plan, the tasks.

Record the instruction **verbatim** — typos, voice-transcription noise, and all. The user's words are evidence; cleaning them destroys it. If the wording is ambiguous, add an `interpreted:` line beneath stating your reading, and confirm with the user before moving past `planned` whenever the interpretation changes scope or risk.

Trivial maintenance (typo-level, no design decision) goes in `ARC-0000-maintenance` as a worklog entry instead of a new arc — still logged, just without ceremony.

Plans need user approval before construction — explicit, or implicit when the user clearly said to just do it.

## Read Before Editing

Before touching any project file, in the current session:

1. Read `.arc/INDEX.md`
2. Fully read every arc whose `scope` covers the paths you'll touch — latest Raw Instructions, current Plan, open Tasks, last Worklog entries
3. Read the actual source files you will change, as they exist now
4. Walk any AGENTS.md / DOX / CLAUDE.md docs too — arcs govern *what to build*; those govern *how to work in this codebase*
5. No covering arc for a non-trivial change → stop and run Intake first

Never edit from memory of a previous session or from assumptions about file contents — stale context is how agents break working code.

## Construct

Work the task list in order. Mark the task you're starting `[>]` (keep at most one or two in progress — it keeps the worklog and resumability honest). Reference tasks as `ARC-0007/T3`.

## Update After Editing

Immediately after editing — same session, before reporting done:

1. Advance task states (`[ ]` pending · `[>]` in progress · `[x]` done · `[!]` blocked: reason · `[-]` cancelled: reason)
2. Append one Worklog entry: timestamp, tasks advanced, files read, files changed, summary, decisions, follow-ups
3. Update frontmatter `updated` and `status`; bump `plan_version` only if the Plan changed
4. Sync the arc's row in `INDEX.md`
5. Reference the arc in the commit message: `[ARC-0007] add redis limiter`
6. On completion: verify acceptance criteria, set `done`, move the file to `.arc/archive/`, update the INDEX row's path

**An edit without a worklog entry is an unfinished edit.** This is what makes any future session — yours or another tool's — able to resume cold.

## Refine (plan → refine/update → develop)

When a new instruction lands on existing work:

1. Append it verbatim as the next `I<n>` in Raw Instructions
2. Add a Refinement Log entry: new `plan_version`, date, triggering instruction, what changed, task impact (added / modified / cancelled — by task number)
3. Rewrite the Plan section to reflect only the **current** plan (history lives in the log); move dropped scope to "Out of scope" with a one-line reason
4. Set status to `refining` if construction was underway; return to `planned`/`in-progress` once tasks absorb the change

Never silently rewrite a plan, and never edit the append-only sections (Raw Instructions, Refinement Log, Worklog) retroactively — auditability is the entire point.

## Resume & Status

To resume cold or answer "where are we?":

```bash
python3 scripts/arc_status.py /path/to/project          # table: id, status, plan v, tasks done/total, updated, title
python3 scripts/arc_status.py /path/to/project --json   # machine-readable, for reports or automation
```

Then open the `in-progress` / `refining` arcs, read Status Notes and the last Worklog entry, and continue from the open tasks — after Read Before Editing. If an arc and the codebase disagree, the codebase is truth for the current state: record the drift in the Worklog, then correct the arc.

## Bundled resources

| Path | What it is | When to use |
|---|---|---|
| `references/protocol.md` | The full binding ARC protocol | Read once per session before ARC work |
| `scripts/arc_init.py` | Scaffold ARC into a project | Initializing |
| `scripts/arc_new.py` | Create + register a new arc | Intake |
| `scripts/arc_status.py` | Status table / JSON across all arcs | Resume, status reports |
| `assets/templates/` | Canonical ARC.md, INDEX.md, _TEMPLATE.md, ARC-0000 | The shapes to follow; manual setup when scripts can't run |

Scripts are zero-dependency Python 3 and safe to re-run; prefer them over hand-editing INDEX bookkeeping (IDs and counters are easy to corrupt by hand). For everything the scripts don't do — plans, refinements, worklogs — write the Markdown yourself, following the section order in `_TEMPLATE.md` and the rules in `protocol.md`.
