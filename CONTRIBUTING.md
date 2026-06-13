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

## Releasing (maintainers)

Bump the version in **both** `package.json` and `packages/create-arc/package.json` (keep them identical), commit, and push to `master`. CI's `auto-tag` job detects the version change and pushes the matching `vX.Y.Z` tag, which triggers the release workflow (npm publish with provenance + GitHub Release with the `.skill` asset). No manual tagging needed for routine releases. See the README's *Production deployment* section for details and the one-time first-release note.
