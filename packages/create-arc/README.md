# @ksoftm/create-arc

Scaffold and drive the **ARC framework** (Align → Refine → Construct) — plan-driven development for AI agents, in pure Markdown. Zero dependencies, any language, any agent.

```bash
npx @ksoftm/create-arc init                          # scaffold ARC into the current project
npx @ksoftm/create-arc new "Add per-key rate limit"  # open and register a new unit of work
npx @ksoftm/create-arc status                         # every arc at a glance
npx @ksoftm/create-arc doctor                         # verify the registry is consistent
```

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
| `new "Title" [--dir=.] [--tags=a,b]` | Take the next sequential ID, create the arc from the template, and register its row in the index. |
| `status [dir] [--json]` | Print a table (or JSON) of every arc: ID, status, plan version, task progress, and which to resume. |
| `doctor [dir]` | Consistency checks — index ↔ file bijection, ID/`next_id` sanity, valid statuses. Exits non-zero on problems (CI-friendly). |

Common options: `--owner NAME` (defaults to `git config user.name`); `--tags a,b` on `new`; `--json` on `status`; `--version`, `--help`.

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
