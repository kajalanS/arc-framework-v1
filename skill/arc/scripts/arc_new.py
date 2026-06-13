#!/usr/bin/env python3
"""arc_new.py — create and register a new arc.

Takes the next ID from .arc/INDEX.md, increments next_id, creates the arc
file from .arc/_TEMPLATE.md with id/title/dates stamped, and appends the
registry row. Content (instructions, plan, tasks) is then filled in by the
agent/user.

Usage:
    python3 arc_new.py [target_dir] --title "Short imperative title" [--tags a,b] [--owner NAME]
"""

import argparse
import re
import sys
from datetime import date
from pathlib import Path


def _read_lf(path: Path) -> str:
    """Read UTF-8 and normalize CRLF/CR to LF so ^...$ regexes are reliable on Windows."""
    return path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")


def slugify(title: str, max_len: int = 40) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return slug[:max_len].rstrip("-") or "arc"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("target", nargs="?", default=".", help="project directory (default: .)")
    ap.add_argument("--title", required=True, help="short imperative title for the arc")
    ap.add_argument("--tags", default="", help="comma-separated tags, e.g. api,infra")
    ap.add_argument("--owner", default=None, help="owner name (default: keep template placeholder)")
    args = ap.parse_args()

    target = Path(args.target).resolve()
    arc_dir = target / ".arc"
    index_path = arc_dir / "INDEX.md"
    template_path = arc_dir / "_TEMPLATE.md"

    for p, hint in ((index_path, "run arc_init.py first"), (template_path, "run arc_init.py first")):
        if not p.exists():
            print(f"error: {p} not found — {hint}", file=sys.stderr)
            return 1

    index = _read_lf(index_path)
    m = re.search(r"^next_id:\s*ARC-(\d+)\s*$", index, re.MULTILINE)
    if not m:
        print("error: could not find 'next_id: ARC-NNNN' in INDEX.md", file=sys.stderr)
        return 1
    num = int(m.group(1))
    arc_id = f"ARC-{num:04d}"
    today = date.today().isoformat()
    slug = slugify(args.title)
    filename = f"{arc_id}-{slug}.md"
    dest = arc_dir / filename
    if dest.exists():
        print(f"error: {dest} already exists", file=sys.stderr)
        return 1

    # --- build the arc file from the template -------------------------------
    text = _read_lf(template_path)
    fm = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not fm:
        print("error: _TEMPLATE.md has no YAML frontmatter", file=sys.stderr)
        return 1
    front, body = fm.group(1), text[fm.end():]

    def set_field(block: str, key: str, value: str) -> str:
        return re.sub(rf"^{key}:.*$", f"{key}: {value}", block, count=1, flags=re.MULTILINE)

    front = set_field(front, "id", arc_id)
    front = set_field(front, "title", args.title)
    front = set_field(front, "status", "draft" + " " * 12 + "# draft | planned | refining | in-progress | blocked | review | done | cancelled")
    front = set_field(front, "created", today)
    front = set_field(front, "updated", today)
    if args.owner:
        front = set_field(front, "owner", args.owner)
    if args.tags.strip():
        tags = ", ".join(t.strip() for t in args.tags.split(",") if t.strip())
        front = set_field(front, "tags", f"[{tags}]")

    body = body.replace("# ARC-0000 · <Title>", f"# {arc_id} · {args.title}", 1)
    dest.write_text(f"---\n{front}\n---\n{body}", encoding="utf-8")

    # --- update the index ----------------------------------------------------
    index = re.sub(
        r"^next_id:\s*ARC-\d+\s*$",
        f"next_id: ARC-{num + 1:04d}",
        index, count=1, flags=re.MULTILINE,
    )
    row = f"| {arc_id} | {args.title} | draft | 1 | {today} | — | [{filename}]({filename}) |"
    lines = index.splitlines()
    insert_at = None
    for i, line in enumerate(lines):
        if line.startswith("## Archived"):
            break
        if re.match(r"^\|\s*ARC-", line):
            insert_at = i
    if insert_at is None:
        print("error: could not locate the Active table in INDEX.md", file=sys.stderr)
        return 1
    lines.insert(insert_at + 1, row)
    index_path.write_text("\n".join(lines) + ("\n" if index.endswith("\n") else ""), encoding="utf-8")

    print(f"created  .arc/{filename}")
    print(f"index    row added, next_id -> ARC-{num + 1:04d}")
    print("Now fill in: Raw Instruction (verbatim), Plan, Tasks.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
