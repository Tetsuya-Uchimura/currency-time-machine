"""
Check a built site (dist/) before it is deployed or submitted.

  full     (npm run build): everything the app loads is there, people and
           portraits included, and every portrait the data names exists.
  contest  (npm run build:contest): the same, but with no real person's name
           or portrait anywhere in the shipped files (Rule 17 safe build).

Both modes check that index.html's scripts exist, that every data file parses,
that the events say how they were checked, and that the hand panel ships.

Usage:  python scripts/check_build.py dist --mode full|contest
Standard library only. Exit code 1 with a list of problems if a check fails.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ["history.json", "snapshot.json", "world-map.json", "leaders.json", "annual-events.json", "history-content.json"]
TEXT_EXT = {".html", ".js", ".map", ".json", ".css", ".uikitml", ".txt", ".md", ".svg"}


def people_names() -> set[str]:
    """Every real person the source data names (full names: at least two words)."""
    names = {t["name"] for t in json.loads((ROOT / "public" / "data" / "leaders.json").read_text(encoding="utf-8"))["terms"]}
    hist = json.loads((ROOT / "content" / "history.json").read_text(encoding="utf-8"))
    names |= {p["name"] for p in hist["people"].values()}
    return {n for n in names if n and " " in n.strip()}


def name_hits(dist: Path, names: set[str]) -> list[str]:
    pattern = re.compile(r"\b(" + "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True)) + r")\b")
    hits = []
    for f in dist.rglob("*"):
        if f.is_file() and f.suffix.lower() in TEXT_EXT:
            for m in pattern.finditer(f.read_text(encoding="utf-8", errors="replace")):
                hits.append(f"{f.relative_to(dist)}: {m.group(1)}")
    return hits


def check(dist: Path, mode: str) -> list[str]:
    problems: list[str] = []
    index = dist / "index.html"
    if not index.exists():
        return [f"{dist}: no index.html"]
    html = index.read_text(encoding="utf-8")
    for ref in re.findall(r'(?:src|href)="\./([^"]+)"', html):
        if not (dist / ref).exists():
            problems.append(f"index.html refers to missing {ref}")
    if not re.search(r'<script[^>]+src="\./assets/[^"]+\.js"', html):
        problems.append("index.html has no bundled script")
    data = {}
    for name in DATA:
        p = dist / "data" / name
        try:
            data[name] = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError) as err:
            problems.append(f"data/{name}: {err}")
    if not (dist / "ui" / "hand-panel.uikitml").exists():
        problems.append("ui/hand-panel.uikitml is missing")
    if not list((dist / "media" / "places").glob("*.webp")):
        problems.append("media/places has no city photos")
    events = data.get("annual-events.json", {}).get("events", [])
    if len(events) < 40:
        problems.append(f"only {len(events)} events")
    for e in events:
        if e.get("status") not in ("reviewed", "matched"):
            problems.append(f"event {e.get('id')}: no status")
    leaders = data.get("leaders.json", {}).get("terms", [])
    cards = data.get("history-content.json", {}).get("events", [])
    if mode == "full":
        if not leaders or any(not t["name"] for t in leaders):
            problems.append("leaders.json: names missing in the full build")
        for t in leaders:
            if t["portrait"] and not (dist / t["portrait"]["src"]).exists():
                problems.append(f"missing portrait {t['portrait']['src']}")
        if not any(c.get("people") for c in cards):
            problems.append("history-content.json: no people in the full build")
    else:
        if any(t["name"] or t["portrait"] for t in leaders):
            problems.append("leaders.json still has names or portraits")
        if any(c.get("people") for c in cards):
            problems.append("history-content.json still has people")
        for sub in ("leaders", "people"):
            if (dist / "media" / sub).exists():
                problems.append(f"media/{sub} is shipped")
        for e in events:
            if any(s.get("title") or s.get("url") for s in e["sources"]):
                problems.append(f"event {e['id']}: source titles or links shipped")
                break
        problems += [f"a person's name is shipped: {h}" for h in name_hits(dist, people_names())]
    return problems


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dist", nargs="?", default="dist")
    ap.add_argument("--mode", choices=["full", "contest"], required=True)
    args = ap.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    problems = check(Path(args.dist), args.mode)
    if problems:
        print(f"{args.mode} build: {len(problems)} problem(s)")
        for p in problems[:60]:
            print("  " + p)
        return 1
    print(f"{args.mode} build OK: {args.dist}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
