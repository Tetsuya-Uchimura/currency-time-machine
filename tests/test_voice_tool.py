"""Tests for scripts/voice_tool.py (recordings) and scripts/build_names_ja.py (Japanese names)."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import build_names_ja as names  # noqa: E402
import voice_tool as vt  # noqa: E402


def test_hash_is_the_apps_hash():
    # Same values as src/a11y/narration.ts textHash (tests/narration.test.ts).
    assert vt.fnv1a64("") == "cbf29ce484222325"
    assert vt.fnv1a64("a") == "af63dc4c8601ec8c"
    assert vt.fnv1a64("Here we are: 1985.") == "6d290f84eddfe30a"


def test_id3_tags_are_removed():
    audio = b"\xff\xfb\x90\x00" + b"\x00" * 20
    tag = b"ID3\x04\x00\x00" + bytes([0, 0, 0, 10]) + b"TIT2nameXX"
    assert vt.strip_id3(tag + audio) == audio
    assert vt.strip_id3(audio) == audio


def test_estimate_counts_characters_and_costs():
    e = vt.estimate([{"text": "a" * 1000}, {"text": "b" * 500}])
    assert e["characters"] == 1500
    costs = e["cost (USD)"]
    assert abs(costs["elevenlabs v4 or multilingual v2 ($0.08 / 1K characters)"] - 0.12) < 1e-9
    assert abs(costs["openai tts-1-hd ($30 / 1M characters)"] - 0.045) < 0.01


def test_every_line_hash_matches_its_words():
    lines = json.loads((vt.LINES).read_text(encoding="utf-8"))["lines"]
    assert len(lines) > 500
    for line in lines:
        assert vt.fnv1a64(line["text"]) == line["hash"]
        assert line["modes"]


def test_contest_lines_name_no_one():
    lines = json.loads((vt.LINES).read_text(encoding="utf-8"))["lines"]
    people = {n for n in names.people() if " " in n}
    for line in lines:
        if "contest" in line["modes"]:
            assert not any(p in line["text"] for p in people), line["id"]


def test_japanese_labels_lose_disambiguation_only():
    label = lambda v: {"labels": {"ja": {"value": v}}}  # noqa: E731
    assert names.japanese_label(label("キャメロン・フロマンティール・コボルド (初代コボルド男爵)")) == "キャメロン・フロマンティール・コボルド"
    assert names.japanese_label(label("中曽根　康弘")) == "中曽根 康弘"
    assert names.japanese_label(label("竹下登")) == "竹下登"
    assert names.japanese_label({}) is None


def test_contest_strip_drops_names_and_full_build_recordings():
    import tempfile

    with tempfile.TemporaryDirectory() as d:
        _contest_strip(Path(d))


def _contest_strip(tmp_path: Path) -> None:
    import check_build
    import strip_people

    (tmp_path / "index.html").write_text("<html></html>", encoding="utf-8")
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "i18n-ja.json").write_text(
        json.dumps({"text": {"The Plaza Accord": "プラザ合意"}, "names": {"Noboru Takeshita": "竹下登"}}, ensure_ascii=False),
        encoding="utf-8",
    )
    voice = tmp_path / "voice"
    voice.mkdir()
    (voice / "aaaa.mp3").write_bytes(b"\xff\xfbfull line")
    (voice / "bbbb.mp3").write_bytes(b"\xff\xfbcontest line")
    (voice / "manifest.json").write_text(
        json.dumps(
            {
                "lines": {
                    "aaaa": {"file": "voice/aaaa.mp3", "id": "year.1985.leaders-JPN", "modes": ["full"]},
                    "bbbb": {"file": "voice/bbbb.mp3", "id": "guide.intro.1", "modes": ["full", "contest"]},
                }
            }
        ),
        encoding="utf-8",
    )
    report = strip_people.strip(tmp_path)
    assert report["names_ja"] == 1 and report["recordings_removed"] == 1
    data = json.loads((tmp_path / "data" / "i18n-ja.json").read_text(encoding="utf-8"))
    assert data["names"] == {} and data["text"]
    assert not (voice / "aaaa.mp3").exists() and (voice / "bbbb.mp3").exists()
    assert check_build.voice_problems(tmp_path, "contest", set()) == []
    # A recording whose bytes name someone (e.g. in a metadata tag) is caught.
    (voice / "bbbb.mp3").write_bytes(b"ID3 TPE1 Noboru Takeshita")
    assert any("metadata" in p for p in check_build.voice_problems(tmp_path, "contest", {"Noboru Takeshita"}))
