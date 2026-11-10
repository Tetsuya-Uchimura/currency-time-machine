"""Numbers for the BGM previews rendered by the audition panel (audition/bgm-*.wav).

They do not say whether the music is pleasant (that is for the ear); they check
what can be measured: loudness and headroom, sudden jumps, how much energy sits
in the voice's band and in the deep bass, harshness, and how much the sound
changes over time (a held chord shows as a flat spectrum).

  python scripts/analyze_bgm.py                 -> table for every audition/bgm-*.wav
Needs numpy (requirements-dev does not include it: analysis only).
"""

from __future__ import annotations

import json
import sys
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "audition"


def load(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path)) as w:
        sr = w.getframerate()
        ch = w.getnchannels()
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
    return data.reshape(-1, ch).mean(axis=1), sr


def db(x: float) -> float:
    return 20 * np.log10(max(x, 1e-9))


def analyse(path: Path, guide_from: float = 18.0) -> dict:
    x, sr = load(path)
    win = int(0.1 * sr)
    frames = x[: len(x) // win * win].reshape(-1, win)
    rms = np.sqrt((frames**2).mean(axis=1))
    rms_db = np.array([db(r) for r in rms])
    sel = slice(int(4 / 0.1), int(guide_from / 0.1))
    gui = slice(int((guide_from + 2) / 0.1), None)
    # Sudden jumps: the largest rise between 100 ms frames (ignoring near-silence).
    # (From 2 s in: the very start rises from silence.)
    body = rms_db[20:]
    rises = np.diff(body)[body[1:] > -60]
    # Spectrum per 0.5 s.
    n = int(0.5 * sr)
    seg = x[: len(x) // n * n].reshape(-1, n) * np.hanning(n)
    spec = np.abs(np.fft.rfft(seg, axis=1)) ** 2
    f = np.fft.rfftfreq(n, 1 / sr)
    total = spec.sum(axis=1) + 1e-12

    def band(lo: float, hi: float) -> float:
        m = (f >= lo) & (f < hi)
        return float((spec[:, m].sum(axis=1) / total).mean() * 100)

    # Change over time: spectral flux between 0.5 s frames (normalised), and how long the
    # dominant pitch stays the same.
    norm = spec / total[:, None]
    flux = np.abs(np.diff(norm, axis=0)).sum(axis=1)
    peaks = f[np.argmax(spec[:, (f > 80) & (f < 1200)], axis=1) + np.argmax((f > 80))]
    longest = run = 1
    for a, b in zip(peaks, peaks[1:]):
        run = run + 1 if abs(a - b) < 3 else 1
        longest = max(longest, run)
    return {
        "file": path.name,
        "peak dBFS": round(db(np.abs(x).max()), 1),
        "RMS selection": round(db(np.sqrt((x[int(4 * sr) : int(guide_from * sr)] ** 2).mean())), 1),
        "RMS guide": round(db(np.sqrt((x[int((guide_from + 2) * sr) :] ** 2).mean())), 1),
        "max 100ms rise dB": round(float(rises.max()) if rises.size else 0, 1),
        "<120 Hz %": round(band(20, 120), 1),
        "1-4 kHz (voice) %": round(band(1000, 4000), 1),
        ">6 kHz %": round(band(6000, sr / 2), 2),
        "flux (change) median": round(float(np.median(flux)), 3),
        "longest same dominant pitch s": round(longest * 0.5, 1),
        "rms selection range dB": round(float(rms_db[sel].max() - rms_db[sel].min()), 1),
        "rms guide range dB": round(float(rms_db[gui].max() - rms_db[gui].min()), 1),
    }


def main() -> int:
    files = sorted(DIR.glob("bgm-*.wav"))
    if not files:
        print("no audition/bgm-*.wav: render them in the audition panel (dev server)")
        return 1
    rows = [analyse(p) for p in files]
    keys = list(rows[0])
    print(json.dumps(rows, indent=1))
    (DIR / "analysis.json").write_text(json.dumps(rows, indent=1), encoding="utf-8")
    return 0 if keys else 1


if __name__ == "__main__":
    sys.exit(main())
