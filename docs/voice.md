# Tock's voice: speech, subtitles and recordings

English is the app's only spoken language. The Japanese display (src/i18n) is a review translation of
the same English lines: it changes the words shown, never what is said or when.

## Why the voice sounded mechanical and stopped mid-sentence (fixed 2026-11-10)

| Problem | Cause | Fix |
| --- | --- | --- |
| Lines cut off | Every new line called `speechSynthesis.cancel()`. The arrival line ("Here we are") was cut by the year's first beat a moment later, and the warp line by the arrival. | A line ends only when the voice has said it. A new beat waits for the previous line, up to 12 s (`YearRunner`, `GATE_S`). The arrival waits for the warp line. |
| Long explanations not finished | A beat ended at an *estimated* time (`lineSeconds` x 1.8 + 2 s, at most about 31 s). The next line then cancelled the voice. | With a working voice, a beat ends at the voice's real end plus a 0.45 s breath. The estimate is used only when there is no voice, or as a hard limit against an engine that never ends. |
| Stops after about 15 s, no `end` event | Chrome stops long utterances with some voices, and may never fire `end` for an utterance it garbage-collected. | One sentence per utterance (long sentences split at a comma), each kept referenced until it is done. A sentence whose `end` never comes is skipped once the engine is quiet. |
| Old callbacks | A cancelled utterance's `error`/`end` could end the next line. | Every callback carries its line's token; stale ones are ignored (tested). |
| Pause restarted the line | Pause cancelled speech; Resume said the whole line again while its time kept counting. | Pause stops at the current sentence; Resume says that sentence again and goes on. A recording pauses and resumes in place. |
| Mechanical sound | No voice was chosen: the system default (often an old desktop voice) read the whole line flat. | An English voice is chosen explicitly when the voices arrive (`voiceschanged`): natural/neural voices first ("Natural", "Online", "Google US English", Apple "Premium"), en-US first, novelty voices never. Sentences are spoken one at a time; codes are spoken as words ("KRW" -> "won", "→" -> "to"). Events use a slightly slower, steadier delivery; the warp a slightly brighter one. |
| Engine that never starts | The old 1.5 s watchdog trusted `speechSynthesis.speaking`, which Chromium reports as true forever when it has no voice. | A line that never fires `start` within 4 s fails. After two failures the journey runs on reading time, subtitles only, until the voice is switched on again or voices arrive. |

## Synchronisation

- One clock of record: the voice. `Narration.speaking` is true from the moment a line is handed over
  until its last sentence (or recording) ends, fails or is stopped.
- Year Journey beats, the intro, the selection line, the warp, the arrival and the summary all wait
  for it (`ExperienceSystem.lineDone`, `YearRunner.update`). With no working voice, they wait for the
  reading time of the **English** line, so the journey's timing never depends on the display language.
- Tock's mouth moves while the voice is actually speaking (from `start` to `end`), or for the reading
  time without a voice.
- The music ducks under the voice (`onSpeaking`). The chart and map highlight stay on the beat's
  currencies until the beat ends.
- Subtitles: a line longer than the strip is cut into pages. Pages turn with the voice's progress
  (characters spoken, or a recording's playback time), or with the reading time.
- Japanese display: the subtitle shows the Japanese translation of the line being said in English.
  Changing the language redraws the words only; the year, clock, beat and voice go on.
- Full Journey: a caption stays while its line is said (time keeps flowing there; a hard limit of
  the caption's maximum plus 12 s).

## Pre-generated recordings (ready, not generated yet)

`node scripts/voice-lines.ts` writes every line the scripts can say, for every year, in the full and
the contest-safe builds, to content/voice/lines.json. Each line has an id, the spoken words and their
hash: FNV-1a 64 of the UTF-8 words, the same in TypeScript (`textHash`) and Python (`fnv1a64`). The
app looks a recording up by that hash. A recording can therefore never say something else than the
subtitle. If the words change, the old recording is not found and the browser's voice says the new
words.

`python scripts/voice_tool.py estimate|generate|manifest|check` estimates, generates (paid, only
with `--yes`; keys only from environment variables), publishes public/voice/manifest.json, and
checks that every file exists, matches its words and carries no ID3 metadata. The contest build keeps
only recordings of lines that build says (`modes` contains "contest"), and `npm run check:contest`
fails if a recording says, or its bytes contain, a person's name.

Order at run time: recording -> browser speech synthesis -> subtitles only.

## Lines and characters (2026-11-10)

| Scope | Lines | Characters | About |
| --- | --- | --- | --- |
| Every year, both builds (distinct lines) | 695 | 76,362 | 85 min, 41 MB of MP3 at 64 kbit/s |
| Full build only | | 74,428 | |
| Contest build only | | 60,826 | |
| 1985 and 1997, with the fixed lines | 42 | 4,360 | 5 min, 2.3 MB |

The 2026 lines change as the year's data grows (they say "our data runs to ..."): they fall back to
speech synthesis until regenerated.

## OpenAI or ElevenLabs

Prices and terms from the providers' own pages, read on 2026-11-10:

| | OpenAI (Speech API) | ElevenLabs |
| --- | --- | --- |
| Models | gpt-4o-mini-tts (can be steered: "warm, curious, a little gravity for crises"), tts-1, tts-1-hd | Eleven v4 ("most emotive"), Multilingual v2, Flash/Turbo (faster, cheaper) |
| Price | gpt-4o-mini-tts: $0.60 / 1M input tokens + $12 / 1M audio tokens (about $0.015 a minute, a community estimate); tts-1-hd: $30 / 1M characters | v4 and Multilingual v2: $0.08 / 1K characters; Flash/Turbo: $0.04 / 1K characters (API, pay as you go) |
| All lines (76K chars) | about $1.3 (gpt-4o-mini-tts) to $2.3 (tts-1-hd) | about $6.1 (v4 / v2), $3.1 (Flash) |
| 1985 + 1997 (4.4K chars) | about $0.07-0.13 | about $0.35 (v4 / v2) |
| Voices | 13 built-in; "marin" and "cedar" recommended for quality; optimised for English | Large library, voice design and cloning; one voice for every line |
| Consistency | Same built-in voice every time; style instructions can drift a little between lines | Same voice id every time; very consistent |
| Expressiveness | Good, steerable by instructions | Best of the two (v4 "audio tags" for emotion) |
| Formats | MP3, Opus, AAC, FLAC, WAV, PCM | MP3 (128/192 kbit/s by plan), PCM 44.1 kHz |
| Timing for subtitles | None returned: the app pages subtitles by playback time | A with-timestamps endpoint exists (character timings; not checked on its API page) |
| Terms | Usage policies require telling users the voice is AI-generated | Commercial licence from the Starter plan ($6/month); the free plan is not for commercial use |
| Caveat | tts-1, tts-1-hd and gpt-4o-mini-tts are deprecated and shut down on 6 January 2027. Recordings made before then stay ours; regenerating later needs the Realtime API (gpt-realtime-2.1-mini). | — |

Playback on Meta Quest: both give ordinary MP3 files, played by an HTML audio element. Quest Browser
plays MP3; the first play needs a user gesture (the app's Start or Enter VR button already gives it).
**Not tested on a headset.**

### Recommendation

1. Generate 1985 and 1997 first, with OpenAI gpt-4o-mini-tts (voice "cedar", the instructions in
   scripts/voice_tool.py). That costs well under $1. Listen in the browser and on the headset.
2. If its delivery is not natural enough, generate the same 42 lines with ElevenLabs Multilingual v2
   or v4 (about $0.35, Starter plan for commercial use) and compare.
3. Then generate every year with the chosen one (about $1.3 to $6), and add the AI-voice disclosure to
   the credits ("Tock's voice is AI-generated").

**Nothing has been generated: paid generation waits for the owner's approval.**

## Sources

- OpenAI pricing: https://developers.openai.com/api/docs/pricing
- OpenAI gpt-4o-mini-tts (deprecated): https://developers.openai.com/api/docs/models/gpt-4o-mini-tts
- OpenAI text-to-speech guide (voices, formats, disclosure, shutdown date): https://developers.openai.com/api/docs/guides/text-to-speech
- ElevenLabs API pricing: https://elevenlabs.io/pricing/api
- ElevenLabs models: https://elevenlabs.io/docs/overview/models
- ElevenLabs plans: https://elevenlabs.io/pricing
