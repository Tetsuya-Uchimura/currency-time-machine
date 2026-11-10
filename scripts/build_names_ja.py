"""People's names in Japanese, for the review translation: Wikidata's Japanese
label of each person the app names (leaders and the portals' decision makers),
found by the same Wikidata item (Q-id) the app already verified. No name is
transliterated by hand: a person without a Japanese label keeps the English
name in the Japanese display (listed in the report).

Writes content/i18n/names-ja.json:
  {"source": ..., "names": {"Richard Nixon": {"qid": "Q9588", "ja": "リチャード・ニクソン"}}, "missing": [...]}

Run:  python scripts/build_names_ja.py      (network; cached in data-raw/media/)
Standard library only (shares build_media's cached fetch and User-Agent).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_media as bm  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "content" / "i18n" / "names-ja.json"


def people(root: Path = ROOT) -> dict[str, str]:
    """English name -> Q-id, for everyone the app can name."""
    out: dict[str, str] = {}
    leaders = json.loads((root / "public" / "data" / "leaders.json").read_text(encoding="utf-8"))
    for t in leaders["terms"]:
        out.setdefault(t["name"], t["qid"])
    content = json.loads((root / "public" / "data" / "history-content.json").read_text(encoding="utf-8"))
    for e in content["events"]:
        for p in e.get("people", []):
            qid = (p.get("verified") or {}).get("qid") or p.get("qid")
            if qid:
                out.setdefault(p["name"], qid)
    return out


def japanese_label(entity: dict) -> str | None:
    """The entity's Japanese label (Wikidata), with the ideographic space normalised."""
    lab = (entity.get("labels") or {}).get("ja", {}).get("value")
    if not lab:
        return None
    # Some labels carry a disambiguation in brackets ("... (初代コボルド男爵)"): the name only.
    return re.sub(r"\s*[(（][^()（）]*[)）]\s*$", "", lab.replace("　", " ")).strip() or None


def main() -> int:
    who = people()
    qids = sorted(set(who.values()))
    ents: dict = {}
    for i in range(0, len(qids), 40):
        res = bm.api(bm.WIKIDATA, action="wbgetentities", ids="|".join(qids[i : i + 40]), props="labels", languages="ja")
        ents.update(res["entities"])
    names: dict[str, dict] = {}
    missing: list[str] = []
    for name, qid in sorted(who.items()):
        ja = japanese_label(ents.get(qid, {}))
        if ja:
            names[name] = {"qid": qid, "ja": ja}
        else:
            missing.append(name)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "source": "Wikidata, Japanese label (labels.ja) of each person's item",
                "names": names,
                "missing": missing,
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"{len(names)} names in Japanese, {len(missing)} without a Japanese label -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
