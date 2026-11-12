# Demo video script (target 2:45, hard limit under 3:00)

(The produced cut is in submission-video/: its storyboard.md, timeline.json and narration-en.md are the
source for the video as made, 2:30, with three shots recorded on a real Meta Quest. This page is the
plan. The two "new" rows below, the movable panel and touching Tock, are in the produced cut, after the
map pinch; it shows a high five, not a pat.)

Recorded from the IWSDK emulator with sound. The first 10 seconds show the most striking moment.

**Rule 17 (identifiable people):** until the organizers confirm in writing that historical leaders may be
shown, record from the contest-safe build (`npm run build:contest`, then `npx vite preview`): no names or
portraits. The shot list below notes what changes in that build.

## Shot list

| Time | Picture | Sound | On-screen text / voice-over |
| --- | --- | --- | --- |
| 0:00-0:10 | **Cold open: the time tunnel.** Rings of gold and cyan light come out of the dark, years run on the rings, the counter falls "2026 ... 1990 ... 1985". The tunnel opens onto 1985: the year stage, the chart's empty January-to-December axis, the world map. | The rush of the tunnel, then a soft shimmer on arrival. | (no voice-over) |
| 0:10-0:18 | Title card over the three bands. | Music, soft. | **Currency Time Machine**: travel through time. Meet the people, explore the events, and discover how currencies changed. |
| 0:18-0:40 | **Meet Tock.** The guide robot floats in, waves (happy eyes), the subtitle strip reads its welcome. Cut to the year selector: the dial, the famous years, the 1985 preview ("September 22: The Plaza Accord · Currencies to watch: JPY, DEM, GBP"). A hand ray pinches **Start Travel**. | Tock's voice (English: a pre-generated recording if they are made, else the browser's speech synthesis; each line is said in full) over the music, which steps back while it talks. | Subtitles on screen (always). |
| 0:40-1:10 | **1985, told by the guide.** "1985. The dollar is strong. Since 1980 the Mark has lost 46% of its value..." The robot points at the US marker; the top band shows the United States: the President and the Fed chair with their terms (contest build: offices and terms only). Then Japan, West Germany. The chart's lines grow from January; the guide's currencies are lit, the rest dimmed. | The currencies' voices play as the year flows; the music ducks when Tock speaks. | VO (sparingly): "Pick any year since 1948. A guide shows you who governed, what happened, and how money moved." |
| 1:10-1:35 | **September 22.** The year stops; a gong; the Historical Portal opens on Tokyo with the decision makers (contest build: the city and the policies). The marker "Plaza Accord" stands on the chart; the yen and Mark lines climb. "Look at the yen: in the eight weeks to November, it gained 19% against the dollar." | The gong, then the yen's voice rising. | Subtitles. |
| 1:35-1:55 | **Your own question.** Pinch South Korea's marker on the map: the year pauses, the stage shows Korea's leaders and the won so far; pinch again and the guide goes on. Poke **All** on the lap panel: all nine lines at full strength. | The won's voice alone. | VO: "Pinch any country to ask about it. One hand, seated." |
| (new) 1:55-2:01 | **Your space.** The hand pinches the lap panel's bar ("Grab to move") and carries the panel to the right; it stays there, facing the user. | The music. | VO: "Make the space your own." |
| (new) 2:01-2:08 | **Touch Tock.** Pinch Tock: it floats within reach and waves. A pat on its head (happy eyes, a soft bounce, the antenna glows); it holds up a hand ("High five!"); a high five (gold sparkles). | Tock's soft purr and chime (never under its voice). | VO: "And your guide is right beside you." |
| 1:55-2:15 | **The summary.** The year in one view: the event, the places, the ranking of the year's changes (same period only). Tock: "That was 1985: the Plaza Accord. Over the year, the Mark gained the most against the dollar, 27%..." Pinch **Next year**: the tunnel again, short. | Tock, then the tunnel. | Subtitles. |
| 2:15-2:35 | **Any year.** Fast cuts: 1997 (Seoul, the won falling half its value), 2008 (Lehman Brothers, then the coordinated rate cuts), 2022 (the yen). One shot of **Calm motion**: the rings stay still and a wave of light runs through them. | Gongs, tunnel, calm wave. | VO: "Every event checked against its source; the featured years against the records of those who acted." |
| 2:35-2:45 | End card. | Calm chord. | Play in your Quest browser: currency-time-machine.pages.dev / Built with Meta Immersive Web SDK / Exchange rate data: Frankfurter (frankfurter.dev) / Map: Natural Earth / Photos and portraits: Wikimedia Commons (see credits) |

## Recording notes

- Record the browser window and system audio together (e.g. OBS: Window Capture + Application Audio Capture), 1920x1080, 60 fps.
- In the emulator, switch input to **hands** and hide the device panels before recording. Keep the emulated
  hand away from the lap panel when pinching distant targets: within about 15 cm of anything pokeable (the
  panel, Tock) IWSDK gives the hand to its touch pointer, and the pinch does not reach far targets (this is
  why a map marker did not open from a hand resting by the panel). Moving the panel aside also works.
- The two new rows: the walk-through script submission-video/scripts/test-interact.mjs (scenarios
  `journey`, `panel`, `tock`) drives exactly these actions with the emulated hands. Keep the times: with
  both rows the video runs about 2:50.
- Turn **Guide voice** on at the start screen; captions stay on either way.
- Record in **English** (the default). The Japanese display is a review translation, not part of the entry.
- If the recordings are made with an AI voice, say so on screen or in the credits ("Tock's voice is AI-generated"): OpenAI's usage policies require it.
- Record on a PC browser with a natural voice installed (Edge's "Online (Natural)" voices, or Chrome's "Google US English"), or with the recordings: the voice is chosen automatically.
- Each Year Journey takes about 1.5 to 2 minutes in real time: record scenes as separate clips (the year
  selector's famous years get you there in one pinch).
- Keep the music audible under the voice-over (about -18 dB for music, voice on top).
- Keep total length under 3:00; aim for 2:45 to leave a safety margin.
