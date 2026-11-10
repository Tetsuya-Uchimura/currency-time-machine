# Ambient music: three pieces to compare

The music heard while choosing a year, while Tock explains, and in the summary. While the year flows,
the data music (one voice per currency) plays instead (see README, "Sound"). All of it is original
and made in code (Web Audio): no recordings, no existing music.

**Nothing here has been judged by ear yet.** The numbers below are measured on rendered files. Whether a
piece is pleasant has to be decided by listening: see "How to listen".

## Why the previous bed sounded monotonous

- One timbre: four identical soft waves, held at a fixed level. No attack, no decay, no articulation.
- Pentatonic-only chords (D E F# A B) with no dominant or leading tone: nothing builds tension, so
  nothing resolves.
- A chord every 8 s exactly, crossfaded over 3 s: a mechanical clock.
- Almost no melody: an occasional bell.
- A generous send into a 3.4 s hall made it washy.
- Unrelated to the bed but heard with it: an electronic blip before every line Tock spoke. Removed.

## The three pieces (src/audio/score.ts, played by src/audio/bed.ts)

| | A Cinematic Ambient (default) | B Gentle Piano | C Cosmic Atmosphere |
| --- | --- | --- | --- |
| Feel | warm, cinematic, hopeful | intimate, a little nostalgic | weightless, starry |
| Tempo | 66 bpm | 72 bpm | 50 bpm |
| Lead | a soft piano answering each chord | a short melody over a broken-chord left hand | sparse high "stars" with an echo |
| Pad | warm, in front | only a halo | brighter, breathing slowly |
| Bass | a soft low note per chord (never held) | the left hand's root | none |
| Form | two 16-bar sections, about 116 s | an 18-bar song, about 60 s; the second verse calmer | 23 slow bars, about 110 s |

Harmony is D major (the currencies play its pentatonic subset, so everything agrees):

- **A**: Dmaj9 - Bm9 - Gmaj9 - Asus4 - A - F#m7 - Gmaj9 - Em9 - A7sus4 - Dadd9, then Gmaj7 - D/F# - Em7 -
  Bm9 - Gmaj9 - Asus2 - A - D6/9. Suspensions resolve (Asus4 -> A, A7sus4 -> D); the second section moves
  to the subdominant side and lands on a long D6/9 with space.
- **B**: D - F#m - G - D/A - Bm - G - Em7 - Asus4 A | D - A/C# - Bm - F#m - G - D/F# - Em - A7sus4 A7 - D6.
- **C**: Dsus2 - Gmaj7#11 (a lydian colour) - Bm11 - Em9 - Asus2 - Gmaj9 - F#m11 - Dmaj9: open chords,
  slow changes.

What the tests check (tests/score.test.ts): every note in D major; no melody note a half step above a
sounding chord tone (no minor-9th clashes); no half steps inside a pad; registers (pads G3-C#5, bass no
lower than F#2, upper part D3-D6); voice leading (each new pad note within 3 semitones of the last chord);
chord lengths vary (1 to 4 bars), none longer than 20 s; fewer notes under the voice, but something
answers every long chord.

Timbres: pads are two oscillators detuned by 6 cents each, a soft saw-like spectrum, a low-pass that
sweeps very slowly. Notes common to two chords keep sounding and breathe; new notes swell in, staggered
from low to high. The piano-like note has a fast attack and a bright start that mellows (its own
low-pass envelope), and decays faster when higher, like a piano. Timing leans a few milliseconds per note
(fixed, not random), so nothing sits exactly on the grid.

## With Tock's voice

- Under the guide the bed plays only its core notes, about 0.8 of its level, and the data music almost
  leaves.
- While the voice speaks: the bed, the music and the reverb return duck together, held through pauses
  between sentences, and come back slowly. The bed also dips 6 dB around 2.5 kHz (the band that carries
  the voice's clarity).
- In the rendered previews, 2.4-3.3 % of the bed's energy is in 1-4 kHz.
- No sound marks the start of a line any more.

## How to listen

- **In the app**: add `?audition` to the address (any build, also the live site), or press `O` in the
  dev server. The panel switches A / B / C at once, can hold a mode (Selection, Guide, Summary, Flowing),
  and has a **Narration test**: the browser's English voice reads guide lines over the music, with
  Tock's duck.
- **Pick a piece for the whole journey**: `?bgm=A`, `?bgm=B` or `?bgm=C`. The audition panel also
  remembers the last choice on that browser.
- **Files**: the panel's Render buttons make 48 s WAVs: 18 s as on the selection screen, then as under the
  guide, with the voice's duck every 6 s. The voice itself is not in the file. They can be downloaded; in
  the dev server they are also saved to audition/ (git-ignored).
- **Numbers**: `python scripts/analyze_bgm.py` (needs numpy) measures the files in audition/.

## Measured (rendered previews, 2026-11-10)

| | A | B | C |
| --- | --- | --- | --- |
| RMS, selection part | -26.3 dBFS | -27.2 dBFS | -26.2 dBFS |
| RMS, guide part (with the duck) | -35.0 | -37.8 | -35.7 |
| Peak | -6.9 dBFS | -7.9 | -12.9 |
| Largest 100 ms rise (after the start) | 3.6 dB | 5.3 dB (piano attacks) | 3.5 dB |
| Energy below 120 Hz | 2.7 % | 0 % | 0 % |
| Energy in 1-4 kHz (the voice's band) | 3.1 % | 2.4 % | 3.2 % |
| Spectral change, median (higher: more movement) | 0.44 | 0.84 | 0.42 |
| Longest stretch with the same dominant pitch | 6.5 s | 2.0 s | 5.5 s |

In the app (1985, piece A, emulator meters):

- Bed level: about -32 dB with no voice, -40 to -43 dB under the voice.
- Data music under the guide: about -60 dB.
- The world beat (26 s) and the Plaza Accord beat (32 s) each went through five or six chords.
- Short-lived nodes: at most 59, back to 10-20, never accumulating.

## Performance

Live audio nodes:

- Pads: 2 oscillators per note, at most about 8 notes during a change.
- Piano-like notes: an oscillator, a filter and a gain each, at most about 12 at once (their tails).
- Fixed nodes: the bass, an echo, and the tone filters.

Notes are scheduled 0.6 s ahead on the audio clock, so a slow frame (even 5 fps) does not delay them.
**Not measured on Quest 3/3S.**

## Next ideas

- Choose one piece after listening. A is the default until then.
- More variation over long sessions: a third section for A, transposed or reharmonised returns.
- A touch of air above 6 kHz for C (now almost none, by design).
- Chords that follow the year's mood (calmer in the fixed-rate era, tenser around crises), and a short
  resolution phrase at the summary.
