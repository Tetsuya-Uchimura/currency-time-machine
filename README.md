# Currency Time Machine

**Sit back. From 1948 to today, the world's money plays around you as sound and light.**

A hands-only, seated WebXR experience for Meta Quest, built with the Immersive Web SDK (IWSDK).
Nine currencies float around you as glowing orbs, each trailing a ribbon of light drawn from its own past
year. Time fast-forwards from the quiet fixed-rate
world of 1948, through the Nixon Shock, the Plaza Accord, the birth of the euro and the 2008 crisis,
until the present catches up with you and today's real exchange rates appear.

It is not a chart to read. It is a way to *feel* how the balance of power between currencies has shifted.

- Play: https://currency-time-machine.pages.dev (open in the Meta Quest browser and tap Enter VR)
- Length: about 4 minutes; pause, resume or jump between eras at any time
- Input: hands only (pinch and poke). Controllers also work, but are never required.

Exchange rate data: Frankfurter (frankfurter.dev)

---

## How to play

| You do | What happens |
| --- | --- |
| Put on the headset and enter VR | 1948 begins at once. No menus, no tutorial screen. |
| **Pinch** (or **poke**) **Pause** on the small panel at your lap | Time and sound fade out smoothly; pinch again to resume. |
| Pinch or poke **1948 / 1971 / 1990 / 2008 / 2020** | Jump to that era. |
| **Pinch a glowing orb** (from afar, or touch it) | Solo: that currency comes forward in the mix, the others step back, and its **light lane** opens: its past 12 months, larger and auto-zoomed, with its change over the year and since its data began. Pinch again to release. |
| Pinch **Voice** | Captions are also read aloud. |
| At the end, pinch **Replay** | Start again from 1948. |

Everything is reachable with **one hand**, within about 60 cm while seated. There is no walking, no turning
around and no artificial movement of the world.

Without a headset, use **Watch in browser** on the start screen and click instead of pinching.

## What you see and hear

The listener stands in the place of the **US dollar** (the base currency). Every other currency is an orb
on an arc around you, arranged west to east like a map: CAD, GBP, DEM/EUR, CHF, INR, CNY, KRW, JPY, AUD.

| Data | Light | Sound |
| --- | --- | --- |
| Strength since the currency first appears (log change vs USD) | **Height** of the orb | **Pitch**, quantized to the D major pentatonic scale (never dissonant) |
| Short-term momentum (half-year change) | **Brightness** | |
| Speed of change (smoothed weekly moves) | A soft glow on each note | **Note density and loudness** |
| Market-wide turbulence (all currencies) | Sky hue and number of motes | **Drone tension, filter brightness, reverb** |
| The past year (weekly data) | A **light trail** behind each orb: time flows to the left, the orb is the present; the ribbon is thicker where the currency moved fast | |
| The currency's identity | Color, label and fixed position | Its own **timbre**, heard **from the orb's direction** (HRTF spatial audio) |

- **The era of silence (1948-1971):** rates were fixed, so the orbs sit still and only soft sustained
  tones sound. Orbs light up one by one as each currency's data begins.
- **Floating rates (1971-today):** the orbs start to move and play; the busier the market, the more they play.
- **Major moments** slow time down, ring a low gong and warm the sky. **Minor moments** only show a caption.
- **Today:** the clock catches up with the present. Each currency plays once, left to right, followed by a
  rising or falling grace note that says whether it gained or lost against the dollar since the previous
  business day. Because the ending uses live rates, it is different every day you open it. Each trail ends
  at its own currency's latest date; when those dates differ, or when the saved copy is used because live
  rates are unavailable, the caption says so (with the time the copy was fetched).

### Temporal light trails

Each orb is the tip of time: behind it (to its left) a ribbon of light shows the currency's last 52 weeks,
and as time moves on the shape flows away to the left while new moves are born at the orb.

- **Drawn from the data, not recorded.** Every frame the ribbon is sampled straight from the weekly history
  at the playback position, so it always covers exactly one year at any playback speed or frame rate, shows
  the right history immediately after a jump, and never invents values: its vertices are the weekly data
  points themselves, and weeks before a currency's data begins are simply not drawn.
- **One scale.** The compact trails use the same height scale as the orbs, so the right end of each ribbon
  is exactly where its orb is, and trails can be compared with each other.
- **Light lane (on pinch).** The expanded view is auto-zoomed to fit the year, and always says so with its
  range (for example "Auto-zoom: full height = +/-13%"); the zoom glides, never jumps. A dashed line marks
  where the year started; year ticks scroll with the data.
- **Markers and sparks.** A warm marker is pinned to the date of each event on the currencies it touched,
  so the moves that followed are drawn right after it. Each note leaves a small spark at the orb that
  drifts away with the history, and faint beads every quarter make the flow visible even when rates are flat.
- **Jumps and replay.** Pause freezes the trails; a chapter jump makes trails and orbs glide to the new time
  (no blanking, no flash); Replay clears captions, markers, highlights and the solo lane.
- **Sound and light in sync.** Lights answer a note when it is actually heard (its scheduled audio time),
  not when it was booked, so even the ending's roll call lights each orb with its own note.
- **Light for Quest.** One small dynamic ribbon per trail (about 54 points) with an additive glow shader,
  plus point sprites; no post-processing, nothing allocated per frame for geometry.

### The historical moments

Every event was checked against the bundled data before it was included. The captions are our own short
factual sentences.

| Tier | When | Moment | What the data shows (vs USD) |
| --- | --- | --- | --- |
| minor | Jun 1948 | Deutsche Mark launched | DEM is the first series in the data |
| minor | Nov 1967 | Pound devalued | GBP from $2.80 to $2.40 |
| minor | Dec 1969 | The yen joins (held at 360 yen to the dollar since 1949) | JPY data begins at about 358 |
| **major** | Aug 1971 | Nixon Shock | JPY 357 to 320 by December |
| **major** | Feb 1973 | Floating rates | 3rd most turbulent week in the whole history (JPY -12%) |
| minor | Jan 1981 | Yuan and won appear | CNY and KRW data begin |
| **major** | Sep 1985 | Plaza Accord | JPY 240 to 128 within two years |
| minor | Sep 1992 | Pound leaves the ERM | GBP -14% in two weeks |
| **major** | Dec 1997 | Asian Financial Crisis | KRW 889 to 1,695 (the won lost almost half its value) |
| **major** | Jan 1999 | Euro launched | the DEM orb hands over to EUR |
| **major** | Oct 2008 | Global Financial Crisis | most turbulent year since 1973; AUD -12% in one week |
| minor | Jan 2015 | Swiss franc cap removed | CHF 1.02 to 0.87 overnight |
| minor | Jun 2016 | Brexit vote | GBP -10% in two weeks |
| minor | Mar 2020 | Pandemic dash for dollars | AUD 1.52 to 1.68 and back within three months |
| **major** | Oct 2022 | The yen's slide | JPY 114 to 150 |

The 2020 move was sharp but short-lived, so it is a minor moment that does not stop the flow of time.

## Data

- **Source:** [Frankfurter](https://frankfurter.dev) API v2, default **composite (blended) rates only**. We never use the
  `providers` parameter or provider-specific endpoints. No stock market data is used.
- **History is static.** `scripts/build_history.py` downloads daily USD-based rates from 1948 once, at build time,
  and writes `public/data/history.json` (about 200 KB). The app never calls the API for history.
- **Weekly resampling:** we take the last observation on or before each Friday. We do not use the API's
  `group=week` because its partial bucket at each year boundary can be off (e.g. AUD 1.66 on 2000-01-01 vs
  about 1.537 in the daily data).
- **Euro handover:** the EUR orb is carried by the Deutsche Mark until 1999-01-01, then by the euro, chained
  with the DEM/EUR ratio measured in the data (1.9558, matching the official 1.95583) so there is no jump.
- **Coverage (composite, vs USD):** DEM 1948, GBP/CHF 1949, CAD 1953, JPY 1969, AUD 1971, INR 1973,
  CNY/KRW 1981, EUR 1999. Orbs light up when their data begins; nothing is back-filled.
- **Quality checks:** the build fails on interior gaps over 8 weeks and on any single-week move above ~65%
  (this is how the 1960 French franc redenomination artefact was caught; FRF is not used).
- **Today's rates:** `GET /api/today` is a Cloudflare Pages Function that proxies Frankfurter, compares the
  latest business day with the previous one, and caches the result for 3 hours. It answers within 2.5 s.
  If Frankfurter is slow or down, the app **falls back to the snapshot bundled at build time**
  (`public/data/snapshot.json`), so the experience never breaks.

## Accessibility

Designed in from the start, not added at the end:

- **One hand, pinch or poke only.** Every control works with either hand, by ray-pinch from a distance or by direct touch.
- **Seated, within 60 cm.** No locomotion, no snap turns, no moving world: nothing that causes motion sickness.
  The scene is anchored to where your head is when you enter, so it fits any seat height.
- **Understandable by ear alone.** Each currency has its own timbre and direction; pitch encodes strength,
  density encodes volatility, the drone's tension encodes market stress, a gong marks major moments, a soft
  chime marks each new decade, and the ending's grace notes say up or down.
- **Optional spoken captions** (Voice button) using the browser's speech synthesis.
- **Never color alone.** Height, brightness, label, position and sound all carry the same information, and
  each trail's shape shows the direction of change. The palette is based on Okabe-Ito, a
  color-vision-deficiency-safe palette.
- **Large, high-contrast captions** (about 3.6 cm text at 1.1 m, white on near-black) with a year always on
  screen. Captions show for 6 to 7.5 s (at least 3.5 s even when the next one is waiting) and stay put
  while paused.
- **Photosensitivity-safe light.** Brightness changes are slew-rate limited, glows fade slowly, notes per orb
  are capped below 3 per second, and the sky changes over seconds. Trail highlights rise over about half a
  second and lanes cross-fade. Nothing flashes 3 or more times per second.
- **No moving world.** The trails scroll inside their small ribbons only; the camera and the scene never move.
- **Comfortable sound.** Pentatonic scale (no clashes), a gentle compressor, smooth fades on pause and jumps,
  and no sudden volume jumps.
- **Quick to start, easy to stop.** It starts on entering VR and pauses automatically when the system menu
  opens or the page is hidden, then resumes where you left off.

## How it is built

- **Immersive Web SDK 1.1** (Meta) on three.js: an ECS app (`ExperienceSystem`) with IWSDK's input stack.
  Orbs and the hand panel carry `RayInteractable` (pinch) and `PokeInteractable` (touch); presses arrive as
  the `Pressed` tag and UIKit `click` events. Panels are written in UIKitML.
- **Sound** is fully procedural Web Audio: one `PannerNode` (HRTF) per currency, additive and FM voices
  built from `PeriodicWave`s, a generated reverb impulse, and a drone chord. It shares three.js's
  `AudioContext`, so the `AudioListener` IWSDK attaches to your head drives the spatialization.
- **Visuals** are procedural: unlit spheres with additive halos, canvas-texture labels, a shader sky and a
  point cloud of motes. Kept light for 72 fps on Quest 3: low-poly meshes, no dynamic lights, no shadows,
  no post effects.

```
scripts/build_history.py   Frankfurter -> public/data/history.json + snapshot.json (Python, tested)
scripts/simulate-pacing.ts how long each era and event takes with the current pacing
functions/api/today.ts     Cloudflare Pages Function for today's rates (cached, with fallback)
src/index.ts               boot: World.create, load data, start screen
src/experience.ts          the conductor: clock, events, captions, solo, today ending
src/data/                  timeline math, events and chapters, today loader
src/playback/clock.ts      time-lapse pacing (era speeds + slow-downs)
src/audio/                 sound engine, pentatonic scale, timbres
src/visual/                orbs, guides, sky and motes, light trails (trails.ts) and their pure math
                           (trail-sampling.ts, unit tested)
src/audio/note-queue.ts    releases note events when they are heard (sound/light sync)
public/ui/*.uikitml        caption board and hand panel
tests/                     pytest for the data pipeline, node:test for the function and the trails
```

## Development

Requirements: Node.js 22.12+ (or 20.19+), Python 3.10+ with pytest.

```bash
npm install
npm run dev        # IWSDK dev server with the built-in XR emulator (https://localhost:8081)
npm test           # pytest (data pipeline) + node:test (Pages Function)
npm run data       # re-download history and rebuild public/data/*.json
npm run pacing     # print when each event happens in the time-lapse
npm run build      # production build into dist/
```

In the emulator, enter XR, then switch the input to hands to try pinch and poke.

Dev builds only (not in production): keys `1`-`5` jump to the chapters, `g h j k l b n m ,` solo CAD to AUD,
`p` pauses, `0` / `6` / `7` jump before the Plaza Accord / the Asian crisis / the 2022 yen slide, `8` goes to
the last weeks and `9` replays. Handy for checking scenes and recording clips.

### Deploy (Cloudflare Pages)

Recommended: connect the GitHub repository in the Cloudflare dashboard
(Workers & Pages > Create > Pages > Connect to Git), with build command `npm run build` and output
directory `dist`. The `functions/` folder is deployed automatically as `/api/today`. No secrets are needed.

Alternatively, deploy from your machine with Wrangler using the values in `.env.example`.

## Assets and licenses

No external media assets: all geometry, textures and sounds are generated in code.

| Component | License |
| --- | --- |
| Immersive Web SDK (`@iwsdk/*`) | MIT |
| three.js (`super-three`) | MIT |
| pmndrs UIKit, Horizon kit, Lucide kit, pointer-events | MIT |
| Lucide icons (Hand, Pause, Play, Volume2) | ISC |
| Inter font (bundled by UIKit) | SIL Open Font License 1.1 |
| Exchange rate data | Frankfurter (frankfurter.dev), attribution shown in the app and here |
