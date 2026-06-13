#!/usr/bin/env python3
"""arc_status.py — status overview across all arcs.

Parses frontmatter and task markers of every arc in .arc/ and .arc/archive/,
printing a table (default) or JSON (--json). Use it to resume work cold or to
answer "where are we?".

Usage:
    python3 arc_status.py [target_dir] [--json]
"""

import argparse
import json
import re
import sys
from pathlib import Path

FM_RE = re.compile(r"^---\n(.*?)\n---", re.DOTALL)
TASK_RE = re.compile(r"^- \[([ >x!\-])\]", re.MULTILINE)


def field(front: str, key: str, default: str = "?") -> str:
    m = re.search(rf"^{key}:\s*(.*?)\s*(?:#.*)?$", front, re.MULTILINE)
    return m.group(1).strip() if m and m.group(1).strip() else default


def _read_lf(path: Path) -> str:
    """Read UTF-8 and normalize CRLF/CR to LF so ^...$ regexes are reliable on Windows."""
    return path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")


def parse_arc(path: Path, archived: bool) -> dict:
    text = _read_lf(path)
    fm = FM_RE.match(text)
    front = fm.group(1) if fm else ""
    # count tasks only within section 4, falling back to the whole file
    sec = re.search(r"^## 4 · Tasks\n(.*?)(?=^## |\Z)", text, re.DOTALL | re.MULTILINE)
    markers = TASK_RE.findall(sec.group(1) if sec else text)
    counts = {k: markers.count(k) for k in (" ", ">", "x", "!", "-")}
    return {
        "id": field(front, "id", path.stem.split("-")[0]),
        "title": field(front, "title"),
        "status": field(front, "status"),
        "plan_version": field(front, "plan_version", "1"),
        "updated": field(front, "updated"),
        "tasks_done": counts["x"],
        "tasks_total": len(markers),
        "tasks_in_progress": counts[">"],
        "tasks_blocked": counts["!"],
        "archived": archived,
        "file": str(path),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("target", nargs="?", default=".", help="project directory (default: .)")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of a table")
    args = ap.parse_args()

    arc_dir = Path(args.target).resolve() / ".arc"
    if not arc_dir.is_dir():
        print(f"error: {arc_dir} not found — run arc_init.py first", file=sys.stderr)
        return 1

    arcs = [parse_arc(p, False) for p in sorted(arc_dir.glob("ARC-*.md"))]
    arcs += [parse_arc(p, True) for p in sorted((arc_dir / "archive").glob("ARC-*.md"))]

    if args.json:
        print(json.dumps(arcs, indent=2))
        return 0

    index_text = _read_lf(arc_dir / "INDEX.md") if (arc_dir / "INDEX.md").exists() else ""
    focus = re.search(r"^active_focus:\s*(.+)$", index_text, re.MULTILINE)
    next_id = re.search(r"^next_id:\s*(.+)$", index_text, re.MULTILINE)

    if not arcs:
        print("no arcs found")
        return 0

    headers = ["ID", "STATUS", "V", "TASKS", "UPDATED", "TITLE"]
    rows = []
    for a in arcs:
        status = a["status"] + (" (archived)" if a["archived"] else "")
        tasks = f"{a['tasks_done']}/{a['tasks_total']}" if a["tasks_total"] else "—"
        if a["tasks_blocked"]:
            tasks += f" !{a['tasks_blocked']}"
        rows.append([a["id"], status, a["plan_version"], tasks, a["updated"], a["title"]])

    widths = [max(len(h), *(len(r[i]) for r in rows)) for i, h in enumerate(headers)]
    line = "  ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
    print(line)
    print("-" * len(line))
    for r in rows:
        print("  ".join(str(c).ljust(widths[i]) for i, c in enumerate(r)))

    active = sum(1 for a in arcs if not a["archived"])
    in_prog = [a["id"] for a in arcs if a["status"] in ("in-progress", "refining") and not a["archived"]]
    print(f"\n{active} active, {len(arcs) - active} archived"
          + (f" · focus: {focus.group(1).strip()}" if focus else "")
          + (f" · next_id: {next_id.group(1).strip()}" if next_id else ""))
    if in_prog:
        print(f"resume from: {', '.join(in_prog)} (read Status Notes + last Worklog entry)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
