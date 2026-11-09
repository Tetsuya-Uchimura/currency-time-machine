# Currency Time Machine

**Sit back. From 1948 to today, the world's money plays in front of you as light, sound and history.**

A hands-only, seated WebXR experience for Meta Quest, built with the Immersive Web SDK (IWSDK).
Three layers float in front of you, all driven by one clock:

1. **Historical Events** (top): the era you are in; at four major moments, photographs of the city at the
   time, the people who made the decisions, the policies and the date.
2. **Multi-Currency Timeline** (middle): nine glowing lines flowing from right to left, each currency's change
   in value against the US dollar over the last 12 months, on one shared scale.
3. **Interactive World Currency Map** (bottom): a holographic world map with each currency's home, its code
   and the same change, lighting up where history is happening.

Time fast-forwards from the quiet fixed-rate world of 1948, through the 1971 break between the dollar and
gold, the coordinated push on the dollar in 1985, the Asian currency crisis, the birth of the euro and the 2008
crisis, until the present catches up with you and today's real exchange rates appear. Look straight ahead and
you see at once **where** money is moving, **which** currencies move, **how much**, and **why**.

- Play: https://currency-time-machine.pages.dev (open in the Meta Quest browser and tap Enter VR)
- Length: about 4 minutes; pause, resume or jump between eras at any time
- Input: hands only (pinch and poke). Controllers also work, but are never required.

Exchange rate data: Frankfurter (frankfurter.dev)

---

## How to play

| You do | What happens |
| --- | --- |
| Put on the headset and enter VR | 1948 begins at once. No menus, no tutorial screen. |
| **Pinch** (or **poke**) **Pause** on the small panel at your lap | Time, sound, lines and map stop together; pinch again to resume. |
| Pinch or poke **1948 / 1971 / 1990 / 2008 / 2020** | Jump to that era: the chart shows that moment's past year at once. |
| **Pinch a currency on the map** (its marker or label) **or on the chart** (its label at the right) | Solo: its line comes first and the others fade (never vanish), its home region glows, and its voice comes forward in the mix. The chart header gives its change over the year and since its data began. Pinch again to release. |
| Pinch the **Historical Events** band while a city is shown | People and their roles, policies, the place and the sources. Time eases almost to a stop while you read; pinch again to continue. |
| Pinch **Voice** | Captions are also read aloud. |
| At the end, pinch **Replay** | Start again from 1948. |

The hand panel is within about 40 cm (pinch or touch); the three bands are 1.1 to 1.4 m away and are
pinched from where you sit. There is no walking, no turning around and no artificial movement of the world.

Without a headset, use **Watch in browser** on the start screen and click instead of pinching.

## The three bands

All three read the same playback position (`PlaybackClock`), every frame. Nothing has its own time.

```
           ┌──────────────── Historical Events (1.42 m, top) ───────────────┐
           │ photo │ city · date · currencies · rates │ people and offices  │
           └────────────────────────────────────────────────────────────────┘
           ┌──────────── Multi-Currency Timeline (1.30 m, middle) ──────────┐
           │ +10% ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄●  JPY ▲ +8.4%      │
           │   0% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●  DEM ▲ +3.1%      │
           │ −10% ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄●  KRW ▼ −12.1%     │
           │   52 weeks ago  ◀── time flows left ──  now                       │
           └────────────────────────────────────────────────────────────────┘
          ╱──────── Interactive World Currency Map (1.12 m, tilted back) ────────╲
         ╱   CAD ▼ −4.1%   GBP ▲ +7.8%   DEM ▲ +6.4%   CNY ▼ −13.2%   JPY ▲ +1.6%   ╲
```

The bands are stacked between about +28° and −37° of elevation, each turned to face your head: seen with
the eyes and a slight nod, never a turn. They sit at different depths (events farthest, the map nearest,
the motes beyond all of them), so moving your head shows real parallax. The camera and the world never move.

### Middle: Multi-Currency Timeline

- **One common base.** Every line is the change in value against the US dollar since the same moment: the
  left edge of the window, 52 weeks ago. `changePct(t) = (exp(strength(t) − strength(t0)) − 1) × 100`, where
  `strength` is the log value from the weekly data. Up means the currency gained against the dollar.
- **No invented data.** A currency whose data begins inside the window starts its line where its data starts,
  measured from that first week, and is marked with `*` and a footnote. Weeks without data are never drawn
  and never filled with 0%.
- **One shared y-axis.** The range is fitted to all lines together (never per currency) and glides when it
  changes. The 0% line is bright; gridlines carry their values (+10%, −10% …). If one line moves more than
  three times as much as the next largest, and it is not in focus, it may run along the edge marked
  "off scale" (its label keeps the true number) so the other eight are not flattened. A currency in an event
  or soloed is always fully on the scale, and a big move while the others are flat (the Mark in 1949) stays on.
- **Flowing time.** The lines are sampled from the weekly data at the playhead every frame, not recorded:
  the window is 52 weeks at any playback speed or frame rate, pause stops the flow, a chapter jump shows the
  target's past year at once (with a short glide), Replay returns to 1948, and Today ends each line at its
  own latest rate. Year lines and quarter ticks scroll with the data.
- **Light.** Each line is a glowing ribbon (an additive shader, no post-processing): older parts are darker,
  the newest point is a small glowing orb that pulses with the currency's notes, and the line is thicker
  where the currency moved fast. Notes leave sparks that drift away with the history.
- **Readable nine.** Normally all lines are thin and identified by color and label. In an event, its
  currencies' lines get brighter and thicker and the others step back a little; in solo the chosen line comes
  first and the others fade to a quarter. The right-hand labels ("JPY ▲ +8.4%") are spread so they never
  overlap, with leader lines to their lines.
- **Events on the time axis.** A marker stands on each event's actual day (for example 22 September 1985),
  which is kept apart from the weekly observation days the lines are drawn from. Markers appear only once the
  playhead has reached the day.

### Bottom: Interactive World Currency Map

- **A holographic table.** A dot-matrix world (Natural Earth 1:110m, public domain) in the Equal Earth
  projection (equal-area, so no region looks bigger than it is), with faint coastlines and a graticule,
  rendered locally. No map service is called at runtime (`npm run map` rebuilds `public/data/world-map.json`).
- **Markers are the stars.** Each currency has a glowing pin at a symbolic anchor for its home (the middle
  of the country; Frankfurt for the Mark and the euro; Bern for the franc) and a label with its code, the
  change, an arrow (▲ ▼) and the place. The number is exactly the one at the right edge of the chart (same
  window, same base). The note on the map says markers show a currency's home, not where it is traded.
- **USD is the base,** with its own white ring and "the base" label; it has no line and no solo.
- **DEM → EUR.** The label reads West Germany, then Germany (from the German monetary union of 1 July 1990),
  then **Euro area** from 1999 (code EUR). The euro area is drawn as its member countries, each lighting up
  from the day it adopted the euro (Greece 2001 … Croatia 2023, Bulgaria 2026); it is never shown as one
  country. Before July 1990 no country is tinted for the Mark, because the map cannot separate West from East
  Germany.
- **Home regions glow** faintly in each currency's color while its data runs, brighter in an event or solo.
- **No crowding in Europe.** Markers stay at their real positions; labels are placed off the crowded areas
  (GBP over the North Atlantic, DEM/EUR to the north, CHF over the Atlantic off Iberia) with leader lines,
  and a test checks that no two labels overlap and no label covers a marker.

### Top: Historical Events

- **Between events** the band shows the year and month, the era (Bretton Woods: fixed rates; After the gold
  link; Floating rates; Floating rates and the euro) with a one-line description, the latest caption, and a
  journey line from 1948 to today with the playhead on it. Major moments on the journey line show only their
  year until the playhead reaches them: nothing is given away early.
- **At four major moments** a Historical Portal takes the band (details below): a photograph of the city at
  the time, the decision makers' portraits and offices, the event's name, actual date, currencies and a
  live readout. At the same moment the chart lights the currencies involved and the map lights their regions,
  and a soft shimmer and the sky tint join in; the gong rings on the date.

| Moment | City and era | Currencies emphasized |
| --- | --- | --- |
| Aug 1971, the dollar-gold break | Washington, D.C., 1971 | JPY, DEM, CHF |
| Sep 1985, a coordinated push on the dollar | Tokyo, 1984-1987 (the meeting itself was in New York) | JPY, DEM |
| Dec 1997, the Asian currency crisis | Seoul, 1996-1998 | KRW |
| Oct 2008, the global financial crisis | New York, around 2008 | JPY, KRW, AUD, GBP |

### Sound

The listener stands in the place of the **US dollar** (the base currency). Each currency has its own
timbre, heard from its own direction: the nine voices are spread from left to right in the map's west-to-east
order, at eye level by the chart (about 1.2 m away), rising a little with their lines. They are never moved
down to the map, so they stay easy to tell apart.

| Data | Light | Sound |
| --- | --- | --- |
| Strength since the currency first appears (log change vs USD) | | **Pitch**, quantized to the D major pentatonic scale (never dissonant) |
| Change over the last 52 weeks (common base) | **Line height** in the chart, the number on the map | |
| Short-term momentum (half-year change) | **Brightness** of the line's head | |
| Speed of change (smoothed weekly moves) | Line thickness, a glow on each note | **Note density and loudness** |
| Market-wide turbulence (all currencies) | Sky hue and number of motes | **Drone tension, filter brightness, reverb** |
| The currency's identity | Color, code, label and place on the map | Its own **timbre** and direction (HRTF spatial audio) |

- **The era of silence (1948-1971):** rates were fixed, so the lines lie flat and only soft sustained tones
  sound; devaluations show as steps. Lines and markers wake up as each currency's data begins.
- **Floating rates (1971-today):** the lines start to move and play; the busier the market, the more they play.
- **Major moments** slow time down and tint the sky as their caption appears; a low gong rings on the
  event's date. **Minor moments** only show a caption.
- **Today:** the clock catches up with the present. Each currency plays once, west to east, followed by a
  rising or falling grace note that says whether it gained or lost against the dollar since the previous
  business day. Because the ending uses live rates, it is different every day you open it. Each line ends
  at its own currency's latest date; when those dates differ, or when the saved copy is used because live
  rates are unavailable, the caption says so (with the time the copy was fetched).

### Historical Portals (the top band at major moments)

Each portal answers three questions at once:

- **Where:** photographs of the city at the time, one across the band (dimmed) and a clear one floating in
  front of it on the left, with the city, country and period in the title plate.
- **Who and why:** portrait cards of the main decision makers with their office at the time. Pinch the band
  for everyone involved, what each did, the policies, and the sources. Time eases almost to a stop while
  the card is open.
- **What happened:** the event's actual date and currencies (with their chart colors), and a live line per
  affected currency, "Yen 242 → 153 per USD (+58% vs USD)": the rate at the last weekly observation on or
  before the decision's date (the day itself may fall between observations; no rate is invented for it) and
  at the playhead, updated as time flows on (before the date, only the current rate).

- **Two clocks kept apart.** The portal opens with the caption, a little before the event (the
  "approaching" state). Its highlight (a slight brightening, spreading motes, the gong, the lines lighting
  up again) happens when the playhead reaches the **actual date**. The rates themselves are never altered:
  the moves you then see are the real weekly data playing on.
- **Cinematic, never flashy.** A thin outline draws itself from the top, the city fades in, then the title.
  Leaving, color and brightness drain first, then the outline. Each portal is on screen for about 6 to 10
  seconds and is always gone before the next caption, so scenes of different eras never mix.
- **Pause, jumps, Replay.** Pausing freezes the portal and its timers. A jump or Replay clears the open
  portal at once (with a short fade) and shows the right one if you land just before a moment.
- **Verified facts, licensed images.** `npm run media` (`scripts/build_media.py`) builds the content from
  `content/history.json`: it checks that each person held the stated office on the date (Wikidata, or the
  English Wikipedia infobox where Wikidata has no dated record), takes their portrait from Wikidata, reads
  every image's license from Wikimedia Commons (public domain, CC0, CC BY, CC BY-SA, KOGL Type 1 only; no
  NC/ND), and stores optimized local WebP files (portraits 288 px, city photos at most 1024 px). People it
  cannot verify are left out; people without a portrait get a plain initials plate, never a stand-in face.
  If the photos cannot be loaded, the portal falls back to a code-generated city impression labelled
  "Artistic impression, not a photograph". Records: [docs/history-verification.md](docs/history-verification.md)
  (generated) and [docs/portal-assets.md](docs/portal-assets.md).
- **Competition rules: open issue.** The portals show real, identifiable people (names and portraits) and
  real streets. Rule 17 of the competition restricts depicting identifiable people other than the entrant.
  **This has not been cleared with the organizers** and must be confirmed with them before submission.

### The historical moments

Every event was checked against the bundled data before it was included. The captions are our own short
factual sentences.

| Tier | When | Moment | What the data shows (vs USD) |
| --- | --- | --- | --- |
| minor | Jun 1948 | Deutsche Mark launched | DEM is the first series in the data |
| minor | Nov 1967 | Pound devalued | GBP from $2.80 to $2.40 |
| minor | Dec 1969 | The yen joins (held at 360 yen to the dollar since 1949) | JPY data begins at about 358 |
| **major** | Aug 1971 | The dollar-gold break | JPY 357 to 320 by December |
| **major** | Feb 1973 | Floating rates | 3rd most turbulent week in the whole history (JPY -12%) |
| minor | Jan 1981 | Yuan and won appear | CNY and KRW data begin |
| **major** | Sep 1985 | Coordinated push on the dollar | JPY 242 to 127 within two years |
| minor | Sep 1992 | Pound leaves the ERM | GBP -14% in two weeks |
| **major** | Dec 1997 | Asian Financial Crisis | KRW 889 to 1,695 (the won lost almost half its value) |
| **major** | Jan 1999 | Euro launched | the DEM line hands over to EUR; the map shows the euro area |
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
- **Euro handover:** the EUR slot is carried by the Deutsche Mark until 1999-01-01, then by the euro, chained
  with the DEM/EUR ratio measured in the data (1.9558, matching the official 1.95583) so there is no jump.
- **Coverage (composite, vs USD):** DEM 1948, GBP/CHF 1949, CAD 1953, JPY 1969, AUD 1971, INR 1973,
  CNY/KRW 1981, EUR 1999. Lines and map markers wake up when their data begins; nothing is back-filled.
- **Quality checks:** the build fails on interior gaps over 8 weeks and on any single-week move above ~65%
  (this is how the 1960 French franc redenomination artefact was caught; FRF is not used).
- **Today's rates:** `GET /api/today` is a Cloudflare Pages Function that proxies Frankfurter, compares the
  latest business day with the previous one, and caches the result for 3 hours. It answers within 2.5 s.
  If Frankfurter is slow or down, the app **falls back to the snapshot bundled at build time**
  (`public/data/snapshot.json`), so the experience never breaks.

## Accessibility

Designed in from the start, not added at the end:

- **One hand, pinch or poke only.** Every control works with either hand: the hand panel by touch or
  pinch, the currencies (map markers and labels, chart labels) and the history band by ray-pinch from the seat.
- **Seated, no movement.** No locomotion, no snap turns, no moving world: nothing that causes motion sickness.
  The bands are anchored to where your head is (and faces) when you enter, so they fit any seat height, and
  all three are in view with the eyes and a slight nod (about +28° to −37°).
- **Understandable by ear alone.** Each currency has its own timbre and direction; pitch encodes strength,
  density encodes volatility, the drone's tension encodes market stress, a gong marks major moments, a soft
  chime marks each new decade, and the ending's grace notes say up or down.
- **Optional spoken captions** (Voice button) using the browser's speech synthesis.
- **Never color alone.** Every line and marker also carries its currency code, its label has an arrow and a
  sign (▲ +8.4%, ▼ −12.1%), its place on the map is fixed, and each currency has its own sound. Chart labels
  and map labels use the same code and the same color. The palette is based on Okabe-Ito, a
  color-vision-deficiency-safe palette.
- **Readable text.** Light text on dark glass panels; the year is always on screen (large in the top band,
  with the month at the top right of the chart). Captions show for 6 to 7.5 s (at least 3.5 s even when the
  next one is waiting) and stay put while paused. Labels never overlap.
- **Photosensitivity-safe light.** Brightness changes are slew-rate limited, glows fade slowly, notes per
  currency are capped below 3 per second, emphasis rises over about half a second, the map's slow scan light
  only moves while time flows, the emphasis ring breathes at 0.4 Hz, and the sky changes over seconds.
  Nothing flashes 3 or more times per second.
- **No moving world.** The lines scroll inside the chart only; the camera and the bands never move.
- **Honest images.** Photos and portraits are labelled with their year, author and license; a code-generated
  city impression (only if photos fail to load) says so on screen.
- **Comfortable sound.** Pentatonic scale (no clashes), a gentle compressor, smooth fades on pause and jumps,
  and no sudden volume jumps.
- **Quick to start, easy to stop.** It starts on entering VR and pauses automatically when the system menu
  opens or the page is hidden, then resumes where you left off.

## How it is built

- **Immersive Web SDK 1.1** (Meta) on three.js: an ECS app (`ExperienceSystem`) with IWSDK's input stack.
  The map markers and labels, the chart labels and the hand panel carry `RayInteractable` (pinch) and
  `PokeInteractable` (touch); presses arrive as the `Pressed` tag and UIKit `click` events. The hand panel
  is written in UIKitML. Solo and event emphasis are one shared state read by the chart, the map and the sound.
- **Sound** is fully procedural Web Audio: one `PannerNode` (HRTF) per currency, additive and FM voices
  built from `PeriodicWave`s, a generated reverb impulse, and a drone chord. It shares three.js's
  `AudioContext`, so the `AudioListener` IWSDK attaches to your head drives the spatialization.
- **Visuals** are procedural: nine dynamic ribbon meshes (about 54 points each) with an additive glow shader,
  unlit spheres with halos, a 2,500-point dot map recolored in place, canvas-texture labels redrawn only when
  their text changes, a shader sky and a point cloud of motes. Geometry and textures are created once and
  reused; nothing is allocated per frame for them. No dynamic lights, no shadows, no post effects. Aimed at
  72 fps on Quest 3 (measured at 60 fps in the desktop emulator; not yet measured on a headset).

```
scripts/build_history.py   Frankfurter -> public/data/history.json + snapshot.json (Python, tested)
scripts/build_map.py       Natural Earth -> public/data/world-map.json (Equal Earth dots + coastlines)
scripts/build_media.py     verified people, portraits and city photos -> public/data/history-content.json
scripts/simulate-pacing.ts how long each era and event takes with the current pacing
functions/api/today.ts     Cloudflare Pages Function for today's rates (cached, with fallback)
src/index.ts               boot: World.create, load data, start screen
src/config.ts              currencies, the three bands' placement (BANDS), chart/map sizes, voice positions
src/experience.ts          the conductor: one clock -> events band, chart, map and sound; solo; today ending
src/data/chart-series.ts   common-base % change, shared y-range, gridlines, label spreading (pure, tested)
src/data/world-map.ts      projection, currency anchors, labels, DEM/euro area over time (pure, tested)
src/data/eras.ts           the eras shown between events
src/data/                  timeline math, events and chapters, history content, today loader
src/playback/clock.ts      time-lapse pacing (era speeds + slow-downs): the single source of time
src/audio/                 sound engine, pentatonic scale, timbres, note queue (sound/light sync)
src/visual/multi-currency-chart.ts  the middle band
src/visual/world-currency-map.ts    the bottom band
src/visual/era-panel.ts             the top band between events
src/visual/historical-portals.ts    the top band at major moments; city-painter.ts paints the fallback
src/visual/glow.ts         shared glowing ribbons, sparks, line sets and text planes
src/visual/trail-sampling.ts  samples a 52-week window from the weekly data (pure, tested)
src/playback/portal-director.ts  when a portal opens, highlights and closes (pure, tested)
public/ui/hand-panel.uikitml  the hand panel
tests/                     pytest for the data, media and map pipelines; node:test for the chart, map,
                           layout, portals, history content, trails and the Pages Function
```

## Development

Requirements: Node.js 22.12+ (or 20.19+), Python 3.10+ with pytest.

```bash
npm install
npm run dev        # IWSDK dev server with the built-in XR emulator (https://localhost:8081)
npm test           # pytest (data, media, map pipelines) + node:test (chart, map, layout, portals, ...)
npm run data       # re-download history and rebuild public/data/history.json + snapshot.json
npm run map        # rebuild the world map from Natural Earth
npm run media      # re-verify people and rebuild portraits and city photos
npm run pacing     # print when each event happens in the time-lapse
npm run build      # production build into dist/
```

In the emulator, enter XR, then switch the input to hands to try pinch and poke. Point a hand at a map
marker or a chart label and pinch to solo that currency.

Dev builds only (not in production): keys `1`-`5` jump to the chapters, `g h j k l b n m ,` solo CAD to AUD,
`p` pauses, `0` / `6` / `7` jump before the 1985 moment / the Asian crisis / the 2022 yen slide, `8` goes to
the last weeks, `9` replays, and `c` lifts the frame-time cap (useful when a backgrounded emulator window is
throttled to 1 fps). Handy for checking scenes and recording clips.

### Deploy (Cloudflare Pages)

Recommended: connect the GitHub repository in the Cloudflare dashboard
(Workers & Pages > Create > Pages > Connect to Git), with build command `npm run build` and output
directory `dist`. The `functions/` folder is deployed automatically as `/api/today`. No secrets are needed.

Alternatively, deploy from your machine with Wrangler using the values in `.env.example`.

## Assets and licenses

Geometry, most textures and all sounds are generated in code. External media, all stored locally (the app
never loads media from other sites at runtime):

| Asset | Source and license |
| --- | --- |
| World map (land, countries) | Natural Earth 1:110m, public domain |
| City photographs and portraits | Wikimedia Commons, each with its own license (public domain, CC0, CC BY, CC BY-SA, KOGL Type 1), author and source: see [docs/portal-assets.md](docs/portal-assets.md) and [docs/history-verification.md](docs/history-verification.md) |

| Component | License |
| --- | --- |
| Immersive Web SDK (`@iwsdk/*`) | MIT |
| three.js (`super-three`) | MIT |
| pmndrs UIKit, Horizon kit, Lucide kit, pointer-events | MIT |
| Lucide icons (Pause, Play, Volume2) | ISC |
| Inter font (bundled by UIKit) | SIL Open Font License 1.1 |
| Exchange rate data | Frankfurter (frankfurter.dev), attribution shown in the app and here |
