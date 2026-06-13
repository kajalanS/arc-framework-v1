# Contributing to ARC

Thanks for helping improve ARC. This repo is small and the rules are few.

## Setup

```bash
npm install        # Node >= 18; Python >= 3.8 for the smoke test
```

## The golden rule: edit templates in one place

The canonical templates live in [`templates/`](templates/). They are embedded (copied) into the skill and the npm package by [`tools/sync-templates.mjs`](tools/sync-templates.mjs). **Never edit the embedded copies** under `skill/arc/assets/templates/`, `skill/arc/references/protocol.md`, or `packages/create-arc/templates/` — they will be overwritten.

After editing anything in `templates/`:

```bash
npm run sync        # regenerate every embedded copy
```

CI fails if the embedded copies drift from `templates/` (`npm run sync:check`).

## Before opening a PR

Run the full local gate:

```bash
npm run check       # sync:check + validate-skill + smoke-test + CLI tests
```

All four must pass. CI additionally runs the CLI tests across Node 18/20/22 on Linux, Windows, and macOS.

## Conventions

- This project dogfoods ARC: where it makes sense, reference an arc in your commit messages (`[ARC-NNNN] short summary`), and use `[ARC-0000]` for trivial maintenance.
- Keep tooling dependency-free (Node built-ins and standard-library Python only).
- Keep `SKILL.md` focused; long material belongs in `references/`.

## Commit messages (Conventional Commits)

This project releases automatically from commit messages, so format matters.

```
<type>(<optional scope>): <description>
```

Common types: `feat` (new feature → minor), `fix` (bug fix → patch), `docs`,
`test`, `refactor`, `chore`, `ci`, `build`, `perf`. A breaking change — either
`type!:` or a `BREAKING CHANGE:` line in the body — triggers a major release.

Examples:

```
feat(cli): add `doctor --fix` to repair the index
fix(skill): tolerate CRLF line endings in templates
docs: clarify first-release steps
feat(cli)!: rename `doctor` to `verify`
```

`feat`/`fix`/breaking changes cut a release; `docs`/`chore`/`test`/`refactor`/`ci`
do not. Reference an arc where it helps (`fix(cli): ... [ARC-0007]`).

## Releasing (maintainers)

Releases are fully automated by `semantic-release` — **do not bump versions or
push tags by hand.** Merge Conventional Commits into `master` and the release
workflow determines the version, updates `CHANGELOG.md`, publishes
`@ksoftm/create-arc` to npm with provenance, and creates a GitHub Release with
the `.skill` asset. Preview a release locally with `npm run release:dry` (it
changes nothing). The root and package `package.json` versions and the changelog
are owned by the tool; manual edits get overwritten. See the README's
*Production deployment* section for full details and the one-time `NPM_TOKEN`
setup.
