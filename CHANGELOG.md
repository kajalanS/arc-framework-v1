# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to
[Semantic Versioning](https://semver.org/).

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
