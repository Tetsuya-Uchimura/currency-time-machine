"""
Contest-safe build, second step: remove real people's names and portraits
from a built site (dist/), so they are not even shipped.

`npm run build:contest` builds with VITE_SHOW_PEOPLE=false (the app shows no
names or portraits), then runs this on dist/:
  - data/leaders.json        names emptied, portraits removed (offices and dates stay)
  - data/history-content.json  people removed from every event card
  - data/annual-events.json  source titles and links removed (some articles and
                             statements are named after people); publishers stay
  - media/leaders/, media/people/   deleted
City photographs (places, no identifiable people as subjects) are kept.

Usage:  python scripts/strip_people.py dist
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path


def strip(dist: Path) -> dict:
    report = {"leaders": 0, "cards": 0, "dirs": []}
    leaders = dist / "data" / "leaders.json"
    if leaders.exists():
        data = json.loads(leaders.read_text(encoding="utf-8"))
        for t in data["terms"]:
            t["name"] = ""
            t["portrait"] = None
            report["leaders"] += 1
        leaders.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    content = dist / "data" / "history-content.json"
    if content.exists():
        data = json.loads(content.read_text(encoding="utf-8"))
        for e in data["events"]:
            report["cards"] += len(e.get("people", []))
            e["people"] = []
        content.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    events = dist / "data" / "annual-events.json"
    if events.exists():
        data = json.loads(events.read_text(encoding="utf-8"))
        for e in data["events"]:
            # Publishers stay (the app names them); titles and links go (some name people).
            e["sources"] = [{"publisher": s.get("publisher", "Wikipedia"), "title": "", "url": "", "primary": bool(s.get("primary"))} for s in e["sources"]]
        events.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for sub in ("leaders", "people"):
        d = dist / "media" / sub
        if d.exists():
            shutil.rmtree(d)
            report["dirs"].append(str(d))
    return report


if __name__ == "__main__":
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "dist")
    if not (target / "index.html").exists():
        raise SystemExit(f"{target} is not a built site (no index.html)")
    print(strip(target))
