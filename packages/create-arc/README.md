# @ksoftm/create-arc

Scaffold and drive the **ARC framework** (Align → Refine → Construct) — plan-driven development for AI agents, in pure Markdown. Zero dependencies, any language, any agent.

```bash
npm i -g @ksoftm/create-arc          # install once, then use the short `arc` command
arc init                             # scaffold ARC into the current project
arc new "Add per-key rate limit"     # open and register a new unit of work
arc status                           # every arc at a glance
arc doctor                           # verify the registry is consistent
arc agent-init                       # write /arc-* slash commands for your AI agent
```

No install? Use `npx @ksoftm/create-arc <command>`. Prefer pinning per-project? `npm i -D @ksoftm/create-arc` then `npx arc <command>`.

## What ARC is

Every unit of development is an **arc**: one Markdown file under `.arc/` that holds its whole story — the user's raw instructions (verbatim, append-only), the current plan, a refinement log, a task list, a worklog, and a status. The agent plans before it builds, refines the plan when the ask changes, and logs every edit — so any later session resumes from the arc, not the chat history. Full concept and protocol: **https://github.com/KsoftmHub/arc-framework-v1**.

## Install

Run on demand with `npx @ksoftm/create-arc …` (no install), or add it to a project:

```bash
npm i -D @ksoftm/create-arc
```

Requires Node ≥ 18.

## Commands

| Command | What it does |
|---|---|
| `init [dir]` | Scaffold `ARC.md` + `.arc/` (index, template, standing maintenance arc, `notes/`, `archive/`). Idempotent — never overwrites. |
| `new "Title" [--goal …] [--task …] [--tags a,b]` | Take the next ID, create the arc, register its row. `--goal`/`--task` prefill the plan and tasks. |
| `start <arc>` | Set an arc to in-progress and log it. `<arc>` is an id or slug. |
| `task <arc> <n> [done\|start\|block\|cancel\|pending]` | Toggle a task marker; `--add "text"` appends a new task. |
| `block <arc> [--reason …]` | Set an arc to blocked, recording the reason in the worklog. |
| `refine <arc> "…"` | Fold a new instruction into an arc: append to §1, bump plan_version, log §3, set refining. |
| `note <arc> "…"` | Quick-append to §1 Raw Instructions (or §5 Worklog with `--worklog`). |
| `log <arc> [--json]` | Show the arc's worklog timeline. |
| `done <arc>` | Mark done, log it, move the file to `archive/`, move its index row. |
| `archive <arc> [--cancelled]` | Archive an arc (outcome done, or cancelled). |
| `show <arc> [--json]` | Print one arc's plan, tasks, and status notes. |
| `next [--json]` | Suggest what to work on next. |
| `status [dir] [--json]` | Print a table (or JSON) of every arc: ID, status, plan version, task progress, and which to resume. |
| `doctor [dir] [--fix]` | Consistency checks — index ↔ file bijection, ID/`next_id` sanity, valid statuses. Exits non-zero on problems (CI-friendly). `--fix` auto-repairs drift. |

Common options: `--owner NAME` (defaults to `git config user.name`); `--goal`/`--task` on `new`; `--reason` on `block`/`archive`; `--cancelled` on `archive`; `--fix` on `doctor`; `--json` on `status`; `--agents a,b` and `--force` on `agent-init`; `--version`, `--help`. Per-command help: `arc help <command>`.

Installs two equivalent binaries: **`arc`** and **`create-arc`**.

## What `init` produces

```
your-project/
├── ARC.md                         the protocol your AI agent reads
└── .arc/
    ├── INDEX.md                   registry of all arcs + next_id counter
    ├── _TEMPLATE.md               the blank arc shape
    ├── ARC-0000-maintenance.md    standing lane for trivial fixes
    ├── notes/                     long research, linked from arcs
    └── archive/                   closed arcs (history is kept, never deleted)
```

## Then what?

Give your AI agent development instructions as usual. With `ARC.md` in the repo — and the companion [ARC skill](https://github.com/KsoftmHub/arc-framework-v1) if you use Claude — the agent files each instruction into an arc verbatim, plans it, refines when you change your mind, builds, and logs progress.

## License

MIT © Ksoftm (Kajalan)
