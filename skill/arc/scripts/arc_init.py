#!/usr/bin/env python3
"""arc_init.py — scaffold the ARC framework into a project.

Idempotent: existing files are never overwritten. Creates ARC.md at the
project root plus the .arc/ working directory from the bundled templates,
substituting {{DATE}} and {{OWNER}}.

Usage:
    python3 arc_init.py [target_dir] [--owner NAME]
"""

import argparse
import subprocess
import sys
from datetime import date
from pathlib import Path

TEMPLATES = Path(__file__).resolve().parent.parent / "assets" / "templates"

# template filename -> destination relative to target
PLACEMENT = {
    "ARC.md": "ARC.md",
    "INDEX.md": ".arc/INDEX.md",
    "_TEMPLATE.md": ".arc/_TEMPLATE.md",
    "ARC-0000-maintenance.md": ".arc/ARC-0000-maintenance.md",
}
DIRS = [".arc/notes", ".arc/archive"]


def detect_owner(target: Path) -> str:
    try:
        out = subprocess.run(
            ["git", "-C", str(target), "config", "user.name"],
            capture_output=True, text=True, timeout=5,
        )
        name = out.stdout.strip()
        if name:
            return name
    except Exception:
        pass
    return "user"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("target", nargs="?", default=".", help="project directory (default: .)")
    ap.add_argument("--owner", default=None, help="owner name (default: git config user.name)")
    args = ap.parse_args()

    target = Path(args.target).resolve()
    if not target.exists():
        print(f"error: target does not exist: {target}", file=sys.stderr)
        return 1
    if not TEMPLATES.is_dir():
        print(f"error: bundled templates not found at {TEMPLATES}", file=sys.stderr)
        return 1

    owner = args.owner or detect_owner(target)
    today = date.today().isoformat()
    created = skipped = 0

    for d in DIRS:
        dpath = target / d
        dpath.mkdir(parents=True, exist_ok=True)
        keep = dpath / ".gitkeep"
        if not keep.exists():
            keep.touch()

    for src_name, rel_dest in PLACEMENT.items():
        src = TEMPLATES / src_name
        dest = target / rel_dest
        if dest.exists():
            print(f"  skip  {rel_dest} (exists)")
            skipped += 1
            continue
        text = src.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
        text = text.replace("{{DATE}}", today).replace("{{OWNER}}", owner)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text, encoding="utf-8")
        print(f"  ok    {rel_dest}")
        created += 1

    print(f"\nARC initialized at {target}  (created {created}, skipped {skipped}, owner: {owner})")
    if created:
        print("Next: tell your agent to read ARC.md, or run arc_new.py to open the first arc.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
