"""Pre-generated recordings of Tock's English lines: estimate, generate, publish.

The app plays a recording when public/voice/manifest.json lists the hash of
the exact words of a line (src/a11y/narration.ts), and falls back to the
browser's speech synthesis otherwise. A recording can never say something
else than its subtitle: changed words change the hash, and the old recording
is simply not found.

Lines come from content/voice/lines.json (node scripts/voice-lines.ts).
Recordings are listed in content/voice/recordings.json (hash -> file, provider,
model, voice); public/voice/manifest.json is built from it.

  python scripts/voice_tool.py estimate [--years 1985,1997]
      characters and cost per provider (nothing is sent anywhere)
  python scripts/voice_tool.py generate --provider openai|elevenlabs [--years 1985,1997] [--limit N] --yes
      PAID: sends each missing line to the provider and saves an MP3. Needs
      OPENAI_API_KEY or ELEVENLABS_API_KEY (and ELEVENLABS_VOICE_ID) in the
      environment; keys are never read from files. Without --yes it only says
      what it would do and what it would cost.
  python scripts/voice_tool.py generate --provider sapi --limit 2 --yes
      Development only: Windows' built-in voice (free, offline) to test the
      playback path; such files are never published (see manifest).
  python scripts/voice_tool.py manifest
      writes public/voice/manifest.json (published providers only)
  python scripts/voice_tool.py check
      every listed file exists, matches its line, and carries no metadata

Standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LINES = ROOT / "content" / "voice" / "lines.json"
RECORDINGS = ROOT / "content" / "voice" / "recordings.json"
OUT_DIR = ROOT / "public" / "voice"
MANIFEST = OUT_DIR / "manifest.json"

# Prices as published on 2026-11-10 (see docs/voice.md for the sources). USD.
PRICES = {
    "openai tts-1-hd ($30 / 1M characters)": lambda chars: chars * 30 / 1e6,
    "openai gpt-4o-mini-tts (~$0.015 / minute, community estimate)": lambda chars: chars / 15 / 60 * 0.015,
    "elevenlabs v4 or multilingual v2 ($0.08 / 1K characters)": lambda chars: chars * 0.08 / 1000,
    "elevenlabs flash / turbo ($0.04 / 1K characters)": lambda chars: chars * 0.04 / 1000,
}
PUBLISHED = {"openai", "elevenlabs"}

# Tock's voice: natural American English, bright, curious, clear; tension for big events, wonder for the warp.
OPENAI_MODEL = "gpt-4o-mini-tts"
OPENAI_VOICE = "cedar"
OPENAI_INSTRUCTIONS = (
    "You are Tock, a friendly robot guide to the history of money. Speak natural American English: warm, "
    "bright and curious, never childish, never robotic. Clear and unhurried, like a good museum guide. "
    "Names, dates and numbers are pronounced carefully. For moments of crisis, a little more gravity; "
    "for time travel, a little excitement."
)
ELEVEN_MODEL = "eleven_multilingual_v2"


def fnv1a64(text: str) -> str:
    """The app's textHash: FNV-1a 64 of the UTF-8 bytes, 16 hex digits."""
    h = 0xCBF29CE484222325
    for b in text.encode("utf-8"):
        h ^= b
        h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return f"{h:016x}"


def strip_id3(data: bytes) -> bytes:
    """Remove an ID3v2 tag at the start of an MP3 (no metadata is published with a recording)."""
    if data[:3] != b"ID3" or len(data) < 10:
        return data
    size = (data[6] << 21) | (data[7] << 14) | (data[8] << 7) | data[9]
    return data[10 + size + (10 if data[5] & 0x10 else 0) :]


def load_lines(years: list[int] | None) -> list[dict]:
    lines = json.loads(LINES.read_text(encoding="utf-8"))["lines"]
    if years:
        keep = {str(y) for y in years}
        lines = [l for l in lines if any(f".{y}" in l["id"] for y in keep) or not l["id"].startswith(("year.", "warp.", "arrive."))]
    return lines


def load_recordings() -> dict:
    return json.loads(RECORDINGS.read_text(encoding="utf-8")) if RECORDINGS.exists() else {"recordings": {}}


def save_recordings(rec: dict) -> None:
    RECORDINGS.parent.mkdir(parents=True, exist_ok=True)
    RECORDINGS.write_text(json.dumps(rec, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")


def estimate(lines: list[dict]) -> dict:
    chars = sum(len(l["text"]) for l in lines)
    minutes = chars / 15 / 60
    return {
        "lines": len(lines),
        "characters": chars,
        "minutes (about 15 characters a second)": round(minutes, 1),
        "mp3 size at 64 kbit/s (MB)": round(minutes * 60 * 64 / 8 / 1000, 1),
        "cost (USD)": {k: round(f(chars), 2) for k, f in PRICES.items()},
    }


def openai_tts(text: str) -> bytes:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise SystemExit("OPENAI_API_KEY is not set in the environment")
    body = json.dumps({"model": OPENAI_MODEL, "voice": OPENAI_VOICE, "input": text, "instructions": OPENAI_INSTRUCTIONS, "response_format": "mp3"})
    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech",
        data=body.encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def elevenlabs_tts(text: str) -> bytes:
    key = os.environ.get("ELEVENLABS_API_KEY")
    voice = os.environ.get("ELEVENLABS_VOICE_ID")
    if not key or not voice:
        raise SystemExit("ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID must be set in the environment")
    body = json.dumps({"text": text, "model_id": ELEVEN_MODEL})
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_64",
        data=body.encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def sapi_tts(text: str) -> bytes:
    """Windows' built-in voice, to a WAV (development tests only: never published)."""
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "line.wav"
        txt = Path(d) / "line.txt"
        txt.write_text(text, encoding="utf-8")
        ps = (
            "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
            f"$s.SetOutputToWaveFile('{out}'); $s.Speak([IO.File]::ReadAllText('{txt}')); $s.Dispose()"
        )
        subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)
        return out.read_bytes()


def generate(args) -> int:
    lines = load_lines(args.years)
    rec = load_recordings()
    todo = [l for l in lines if l["hash"] not in rec["recordings"]]
    if args.only:
        todo = [l for l in todo if l["id"] in args.only]
    if args.limit:
        todo = todo[: args.limit]
    est = estimate(todo)
    print(json.dumps({"provider": args.provider, **est}, indent=1))
    if not args.yes:
        print("Nothing generated: add --yes to send these lines to the provider (paid for openai and elevenlabs).")
        return 0
    say = {"openai": openai_tts, "elevenlabs": elevenlabs_tts, "sapi": sapi_tts}[args.provider]
    ext = "wav" if args.provider == "sapi" else "mp3"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for i, l in enumerate(todo, 1):
        data = strip_id3(say(l["text"]))
        name = f"{l['hash']}.{ext}"
        (OUT_DIR / name).write_bytes(data)
        rec["recordings"][l["hash"]] = {
            "id": l["id"],
            "file": f"voice/{name}",
            "text": l["text"],
            "modes": l["modes"],
            "provider": args.provider,
            "model": OPENAI_MODEL if args.provider == "openai" else ELEVEN_MODEL if args.provider == "elevenlabs" else "System.Speech",
            "voice": OPENAI_VOICE if args.provider == "openai" else os.environ.get("ELEVENLABS_VOICE_ID", "") if args.provider == "elevenlabs" else "default",
            "bytes": len(data),
        }
        save_recordings(rec)
        print(f"{i}/{len(todo)} {l['id']} ({len(data)} bytes)")
    return write_manifest(dev=args.provider == "sapi")


def write_manifest(dev: bool = False) -> int:
    rec = load_recordings()["recordings"]
    lines = {}
    for h, r in sorted(rec.items()):
        if r["provider"] not in PUBLISHED and not dev:
            continue
        lines[h] = {"file": r["file"], "id": r["id"], "modes": r["modes"]}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({"lines": lines}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(lines)} recordings in {MANIFEST.relative_to(ROOT)}{' (development: includes unpublished providers)' if dev else ''}")
    return 0


def check() -> int:
    rec = load_recordings()["recordings"]
    problems = []
    for h, r in rec.items():
        if fnv1a64(r["text"]) != h:
            problems.append(f"{r['id']}: hash does not match its text")
        f = ROOT / "public" / r["file"]
        if not f.exists():
            problems.append(f"{r['id']}: missing {r['file']}")
        elif f.read_bytes()[:3] == b"ID3":
            problems.append(f"{r['id']}: has an ID3 tag")
    current = {l["hash"] for l in json.loads(LINES.read_text(encoding="utf-8"))["lines"]} if LINES.exists() else set()
    stale = [r["id"] for h, r in rec.items() if current and h not in current]
    print(f"{len(rec)} recordings; {len(problems)} problems; {len(stale)} no longer said by the app (their line changed)")
    for p in problems:
        print("  " + p)
    return 1 if problems else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["estimate", "generate", "manifest", "check"])
    ap.add_argument("--provider", choices=["openai", "elevenlabs", "sapi"], default="openai")
    ap.add_argument("--years", type=lambda s: [int(x) for x in s.split(",")], default=None)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--only", type=lambda s: s.split(","), default=None, help="line ids, comma-separated")
    ap.add_argument("--yes", action="store_true", help="really send the lines (paid)")
    args = ap.parse_args(argv)
    if not LINES.exists():
        raise SystemExit("content/voice/lines.json missing: run node scripts/voice-lines.ts")
    if args.command == "estimate":
        print(json.dumps(estimate(load_lines(args.years)), indent=1))
        return 0
    if args.command == "generate":
        return generate(args)
    if args.command == "manifest":
        return write_manifest()
    return check()


if __name__ == "__main__":
    sys.exit(main())
