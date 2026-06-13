# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- **Releases are now fully automated with semantic-release.** Versioning is
  derived from Conventional Commit messages; on every push to `master` the
  release workflow determines the next version, updates this changelog,
  publishes `@ksoftm/create-arc` to npm with provenance, and creates a GitHub
  Release with the `.skill` asset — all in a single job. This replaces the
  previous auto-tag approach (a tag pushed by `GITHUB_TOKEN` cannot trigger the
  tag-based release workflow, so the release never ran). Future version and
  changelog entries below this point are generated automatically.

## [1.0.3] - 2026-06-13

### Fixed
- **Release workflow never ran.** `release.yml` triggers only on a pushed
  `v*.*.*` tag, and ordinary commits don't create tags — so pushing to the
  default branch ran CI but never a release. CI also targeted `main` while the
  repo's default branch is `master`, so even CI wasn't triggering on push.

### Changed
- `ci.yml` now targets the `master` branch (push + PR).
- Added an `auto-tag` job to `ci.yml`: after tests pass on `master`, if the
  `packages/create-arc` version changed since the previous commit, it creates
  and pushes the matching `vX.Y.Z` tag — which triggers `release.yml`. Routine
  releases are now just a version bump + push; no manual tagging. The job is a
  no-op when the version is unchanged or the tag already exists, and it fails if
  the root and package versions diverge.

## [1.0.2] - 2026-06-13

### Fixed
- **Windows CI failures: CRLF line endings broke frontmatter parsing.** On a
  Windows checkout, git's `autocrlf` rewrote template files with CRLF, so the
  `^---\n` frontmatter regex in `create-arc` no longer matched and `new` failed
  with "`_TEMPLATE.md has no YAML frontmatter`" (4 of 7 CLI tests). All file
  reads in the CLI, the skill's Python scripts, and `validate-skill.mjs` now
  normalize CRLF/CR to LF before parsing, so they work regardless of how files
  were checked out. Added a `.gitattributes` forcing the framework's source
  files to LF (also keeps the byte-for-byte template drift check stable on
  Windows), and a CRLF regression test to the CLI suite.

## [1.0.1] - 2026-06-13

### Fixed
- **Windows packaging.** `tools/package-skill.mjs` no longer shells out to the
  Unix `zip` and `cp` binaries (which caused `spawnSync zip ENOENT` on Windows).
  The `.skill` archive is now written with Node's built-in `zlib` — pure Node,
  zero dependencies, identical output on Windows, macOS, and Linux. Verified
  against both the system `unzip` and Python's `zipfile`, and byte-for-byte file
  parity with the official skill packager.

### Changed
- `npm run smoke` now launches through `tools/smoke.mjs`, which finds the right
  Python interpreter per platform (`python` on Windows, `python3` elsewhere), so
  the smoke test runs everywhere without editing the script.
- CI and release workflows call `npm run smoke` instead of a hardcoded
  `python3` invocation.

## [1.0.0] - 2026-06-13

### Added
- Initial release: ARC plan-driven development framework.
- Claude skill (`skill/arc/`) with protocol reference and zero-dependency Python
  helpers (`arc_init`, `arc_new`, `arc_status`).
- npm package `@ksoftm/create-arc` with `init`, `new`, `status`, and `doctor`
  commands (zero dependencies, Node >= 18).
- Canonical templates as a single source of truth, synced into both artifacts
  with drift-checking in CI.
- CI/CD: cross-platform CLI test matrix, skill validation, smoke tests, `.skill`
  artifact build, and tag-driven npm publish (with provenance) plus GitHub
  Release.
