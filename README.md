# Currency Time Machine

**Travel through time. Meet the people, explore the events, and discover how currencies changed.**

A hands-only, seated WebXR experience for Meta Quest, built with the Immersive Web SDK (IWSDK).
Pick any year from 1948 to today. **Tock**, a small guide robot, sets the dial, and a tunnel of gold and
cyan light carries you there. Then the year plays out in front of you on three layers, all driven by one
clock:

1. **The year stage** (top): the year and its era, who governed the places that mattered (with portraits),
   each event on its date, and at the end a summary of the year.
2. **Multi-Currency Timeline** (middle): January to December, each currency's change in value against the
   US dollar since the year's first week, drawn as time passes, on one shared scale. The guide lights the
   currencies it is talking about; the others step back.
3. **Interactive World Currency Map** (bottom): each currency's home, its code and the same change; the
   robot points at the places it introduces, and you can pinch any of them to open its leaders.

Every fact says how it was checked. In the five featured years (1971, 1985, 1997, 2008, 2022) every event,
portal text and opening line is reviewed against quoted sources, mostly primary ones (ministries, central
banks, the IMF, government records); other years' events are matched automatically to a Wikipedia passage
that gives their date, and the app says so. Leaders' terms come from Wikidata, cross-checked with Wikipedia.
Every exchange-rate figure is computed from the weekly data, never typed in, and the featured years' figures
are cross-checked against the Federal Reserve's H.10 rates.

- Play: https://currency-time-machine.pages.dev (open in the Meta Quest browser and tap Enter VR)
- **Year Journey** (default): about 1.5 to 2 minutes per year; go to the previous or next year, or any other.
- **Full Journey**: the whole story from 1948 to today in about 4 minutes, with the guide in the background.
- Input: hands only (pinch and poke). Controllers, a mouse or a keyboard also work, but are never required.

Exchange rate data: Frankfurter (frankfurter.dev)

---

## How to play

| You do | What happens |
| --- | --- |
| Choose **Year Journey** (or **Full Journey**) on the start screen and enter VR | Tock says hello (about 15 s; **Skip intro** at any time). Subtitles are always on; **Guide voice** reads them aloud. |
| Turn the dial: **-10 / -1 / +1 / +10**, a decade, or a famous year (**1971, 1985, 1997, 2008, 2022**) | The year's verified events are previewed (date, places, currencies to watch). The same dial is on the panel at your lap. |
| Pinch **Start Travel** | The time tunnel: rings of light and the years running back to your year (about 3 s; **Skip** jumps to the arrival). You never move. |
| Watch the year | The guide introduces the world, then the leaders of two or three places, then each event on its date; the line of the currency in question is lit and the robot points at its home on the map. The year stops at each of these moments while the guide speaks. |
| **Pinch a country's marker on the map** (or a currency's label on the chart) | That place opens: its leaders this year, how it is governed, and its currency so far. The guide pauses. Pinch it again to go on. |
| Pinch **All** | Show all nine currencies at full strength (the guide's spotlight off). |
| At the end of the year | The summary: events, places, policymakers, and the ranking of the year's changes. **Explore another year, Previous year, Next year, Replay this year, Full Journey.** |
| **Pause**, **Voice**, **Skip**, **Calm**, **Lang** on the lap panel | Pause and resume, speech on/off, skip a line, reduced motion for the tunnel, and the display language (EN / JA). |

On a PC: click the buttons with the mouse, or use the keyboard: `[` `]` change the year by one, `-` `=`
by ten, Enter starts the travel (or goes to the next year), Escape skips, Space pauses, `I` switches the
display language.

## Languages

**English is the app's language.** Every line, event and panel is written in English, and Tock speaks
English only. **Japanese (日本語) is a review translation** for the developer and Japanese-speaking
reviewers: the same English, translated, shown in the subtitles and on every panel. It is chosen on the
start screen (Language: English / 日本語; English by default), with `?lang=ja` in the address, with the lap
panel's **Lang** button, or with `I` on a PC, at any moment: the year, the clock, the beat being said, the
selection, the chart and the map stay as they are; only the words shown change.

- **One journey.** The guide's beats, their order and their moments are built once, from the data. Each
  line is built in English and in Japanese from the same values (src/guide/guide-scripts.ts `Beat.text`
  and `Beat.ja`). No Japanese-only content, timing or voice.
- **Voice in Japanese mode.** With **Voice** on, the English line is said and its Japanese translation is
  shown. With **Voice** off, the subtitles carry the journey alone, timed by the English line's reading
  time (the same timing in both languages).
- **Where the Japanese comes from.** Fixed lines and sentence patterns: src/i18n/en.ts (the source) and
  src/i18n/ja.ts (each translation next to a copy of the English it translates). Events, portals, places,
  offices and eras: content/i18n/ja-text.json, keyed by the English. People's names: Wikidata's Japanese
  label of the same item (content/i18n/names-ja.json, `npm run names:ja`), never transliterated by hand; 30
  people with no Japanese label keep their English name. `npm run i18n` builds public/data/i18n-ja.json.
- **Nothing left behind.** A change to an English template makes its Japanese stale; changed data text has
  no translation yet. Both show English, are logged in dev builds, and fail the tests
  (tests/i18n.test.ts) and `npm run i18n:check`. The tests also check that every number (years, dates,
  amounts, percentages) of every English line is in its Japanese, for every year. Status:
  [docs/translation-status.md](docs/translation-status.md).
- **Not translated:** currency codes, rates, numbers and dates (formatted from the same ISO date),
  licence and author credits, and the lap panel's button labels (its font has Latin letters only).

## Tock's voice

The voice waits for itself: a line ends when it has been said, never when an estimate runs out, so long
explanations are said in full and a new line never cuts the previous one. Without a working voice, the
reading time of the English line decides. Details, the causes of the earlier cut-offs and the fixes:
[docs/voice.md](docs/voice.md).

- **Best first:** a pre-generated recording of the exact words (found by their hash), then the browser's
  speech synthesis with an explicitly chosen natural English voice (one sentence at a time), then
  subtitles only.
- **Pause** stops the voice at the sentence it is saying and goes on from there; **Skip** ends the line;
  **Voice** off stops it at once. Tock's mouth moves while the voice is speaking.
- **Recordings** are ready to be made (scripts/voice-lines.ts lists every line; scripts/voice_tool.py
  estimates, generates and publishes), but none are made yet: paid generation waits for approval.
  Estimated cost for every line of every year: about $1.3-2.3 with OpenAI, $3-6 with ElevenLabs.

## Year Journey

### The guide robot

Tock is made in code from a few simple shapes (no external model): a pearl body with a matcap shading
generated at load, a dark visor with glowing eyes, an antenna with a gold "time" light, two side rings and two
floating hands. It is about 15 cm tall, floats beside the panels on your left (never in front of your face)
and shows what it is doing:

| Mood | How it shows |
| --- | --- |
| Idle | slow float, gentle sway, a blink every few seconds |
| Talking | the mouth light moves with the line, a small nod, the antenna glows |
| Pointing | turns toward a map marker, reaches out, and a soft beam joins its hand to the marker |
| Excited | happy eye arcs, a livelier bob, faster side rings (an event, an arrival) |
| Traveling | leans into the tunnel, thruster bright |
| Thinking | looks up and aside, three dots breathe above its head (while you choose a year) |

Its voice is English (see [Tock's voice](#tocks-voice)): a pre-generated recording when there is one,
otherwise the browser's speech synthesis with a natural English voice chosen explicitly. Speech starts only
after a user action, subtitles never depend on it, and while it speaks the music steps back so the words
stay clear.

### The time tunnel

Sixteen thin rings of gold and cyan light come out of the depth toward you, with streaks of light, drifting
motes, years passing on the rings, and the year counter running to your destination. The camera never moves:
the rings move, and they fade before they get near, so nothing sweeps through the edge of your vision. The
robot and the lap panel stay put as fixed reference points, and a still ring frames the view. There is no
white flash; the arrival is a soft warm glow. **Calm motion** keeps the rings still and runs a slow wave of
light through them instead. It lasts about 3 seconds and can be skipped.

### How a year is told

1. **The world**: the year, its era, the two or three places to watch (from the year's events, then the
   biggest movers).
2. **The leaders**: for each place, who held office during the year (two names when it changed hands) and,
   for central banks, who led them; each place by its own system (presidents, prime ministers, chancellors,
   the Swiss Federal Council, the Communist Party's leader and the Premier; the euro area is the European
   Central Bank, not one head of government). West Germany and Germany are told apart.
3. **The events**: each event at the first weekly observation on or after its day (the card names both: "Event
   on Sunday, September 22 ... the first observation after it, Friday, September 27"), with a gong, a marker on
   the chart and the lines it touched lit; the four great moments also open their Historical Portal (city
   photographs, decision makers), whose rates are dated too ("Yen 242 (Sep 20) → 219 (Sep 27)"). An event whose
   sources give only the month or the year is told at the end of the year, said to be undated, with no stop,
   gong or marker: no day is made up for it.
4. **The currencies**: the sharpest eight-week stretch of the year while it happens, then the year's result.
5. **The summary**: events, places, policymakers and the year's changes, ranked.

The five featured years (1971, 1985, 1997, 2008, 2022) have their own opening line; any number in it is
computed from the data. Every other year works the same way from the data alone, and says so when it has
no verified event.

### Measuring a year

- The year runs from its **first weekly observation** (on or after 1 January) to its **last** (on or before
  31 December), and the app names both dates. Nothing is interpolated across New Year.
- Change is the change in a currency's **value against the US dollar**: (rate at the start / rate at the end
  - 1). A stronger yen means fewer yen per dollar: a positive number.
- A currency whose data begins inside the year (JPY in 1969) is measured from its first week and is
  **not ranked** with the others. 1948 begins in June (the data's first week). The latest year is
  **year to date**, and nothing after the last observation is shown.
- The chart draws each line only up to the playhead: the year is never shown ahead of time.
- **Event dates and rate dates are different things.** Rates are weekly observations (Fridays). The year stops
  at the first observation on or after an event's day, and the app names that observation's date.

### Where the facts come from

| What | Source and check |
| --- | --- |
| Leaders (23 offices, 1948 to today) | Wikidata "position held" with start and end dates (`npm run leaders`). Each term is cross-checked against the person's English Wikipedia infobox; 190+ terms agree, the rest are Wikidata-only and listed for review. Periods with no recorded holder show "no verified record". Gaps filled by name are verified the same way. Report: [docs/leaders-verification.md](docs/leaders-verification.md). |
| Portraits | The person's Wikidata image, used only with a free license that allows reuse with attribution (public domain, CC0, CC BY, CC BY-SA, OGL, GODL-India, GFDL, Attribution), with its credit on screen. |
| Events (60 shown, 1948 to 2026) | Written in `content/annual-events.json`, checked by `npm run events` at two levels the app tells apart. **Reviewed** (16, every event of the featured years, the 2026 yen intervention and the Bank of Japan's 2024 exit from negative rates): quotes from named sources (`content/sources.json`), mostly primary, each found in its source, one giving the day; the Japanese interventions are rows of the Ministry of Finance's own intervention data. **Matched** (44): an automatic check that one passage of a Wikipedia article (a sentence and the next) has the date and keywords; a page that has them in different places does not pass (this left out two events and turned two into year-only ones). When the sources give only the month or the year, the app shows no more. Report: [docs/events-verification.md](docs/events-verification.md). |
| Featured years | Every portal summary, policy, person's role, portal scene and opening line of 1971, 1985, 1997, 2008 and 2022, next to the quotes behind it (`content/featured-review.json`, `npm run review`). Tests fail if the app's wording changes without a new review. Report: [docs/featured-years-review.md](docs/featured-years-review.md). |
| Exchange rates | Frankfurter composite rates, weekly (see Data). For the featured years, every weekly observation and every figure the app states is recomputed from the Federal Reserve's H.10 rates (`npm run rates`): 58 figures agree, one is explained (the won on 26 December 1997, a day it swung by a fifth: -51.6% for the year with the composite, -43.8% with H.10). Report: [docs/rates-crosscheck.md](docs/rates-crosscheck.md). |

### Contest-safe build (Rule 17)

The official rules of the Meta VR Start Developer Competition 2026 (section 17) restrict references to and
depictions of identifiable people other than the entrant. Showing historical leaders by name and portrait is
central to this design, but **the organizers' written permission has not been confirmed**. Until it is,
`npm run build:contest` makes a build that shows **no names or portraits of real people**: the guide speaks
of offices, not names, the panels show offices and terms only, the Historical Portals keep their places and
policies, and the names and portraits are removed from the built files: in English, in the Japanese review
translation (its names are removed from data/i18n-ja.json), and in recordings (only lines the contest build
says are kept; `npm run check:contest` fails if a recording says a name or carries one in its metadata). The
public site and the demo video must be made from this build unless the organizers confirm in writing.

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
  every image's license from Wikimedia Commons (public domain, CC0, CC BY, CC BY-SA, KOGL Type 1, OGL, GODL-India, GFDL, Attribution only; no
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
- **Optional spoken captions** (Voice button): recordings or the browser's speech synthesis, in English;
  long subtitles turn their pages with the voice.
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
  The map markers and labels, the chart labels, the Year Journey's buttons and the hand panel carry
  `RayInteractable` (pinch) and `PokeInteractable` (touch); presses arrive as the `Pressed` tag (buttons
  light up with `Hovered`) and UIKit `click` events. The hand panel is written in UIKitML. Solo, the guide's
  spotlight and event emphasis are one shared state read by the chart, the map and the sound.
- **One clock.** The Year Journey plays one year through the same `PlaybackClock` as the Full Journey, in a
  window (`setWindow`) it can never leave, and stops at the guide's beats (`stopAt`). The phases (intro,
  select, warp, review, summary, Full Journey, today) are one state machine in `experience.ts`; changing
  year clears the subtitles, speech, portals and spotlight, so nothing from another year lingers.
- **Sound** is fully procedural Web Audio: one `PannerNode` (HRTF) per currency, additive and FM voices
  built from `PeriodicWave`s, a generated reverb impulse, and a drone chord. It shares three.js's
  `AudioContext`, so the `AudioListener` IWSDK attaches to your head drives the spatialization.
- **Visuals** are procedural: nine dynamic ribbon meshes (about 54 points each) with an additive glow shader,
  unlit spheres with halos, a 2,500-point dot map recolored in place, canvas-texture labels redrawn only when
  their text changes, a shader sky and a point cloud of motes. Geometry and textures are created once and
  reused; nothing is allocated per frame for them. No dynamic lights, no shadows, no post effects. The robot
  is about 20 small meshes with matcap and unlit materials; the time tunnel is 16 thin ring meshes, one line
  set and one point cloud, hidden when not in use. Aimed at 72 fps on Quest 3 (measured at 56 to 60 fps in
  the desktop emulator; not yet measured on a headset).

```
scripts/build_history.py   Frankfurter -> public/data/history.json + snapshot.json (Python, tested)
scripts/build_map.py       Natural Earth -> public/data/world-map.json (Equal Earth dots + coastlines)
scripts/build_media.py     verified people, portraits and city photos -> public/data/history-content.json
scripts/build_leaders.py   Wikidata + Wikipedia -> public/data/leaders.json, portraits (every year's leaders)
scripts/build_events.py    content/annual-events.json, reviewed or matched against sources -> public/data/annual-events.json
scripts/review_featured.py the featured years' statements vs their quotes -> docs/featured-years-review.md
scripts/check_rates.py     the featured years' rates and figures vs the Fed's H.10 -> docs/rates-crosscheck.md
scripts/check_build.py     checks a built dist/ (full, or contest-safe: no real person's name anywhere)
content/sources.json       the sources quoted as evidence (publisher, title, link, primary or not)
content/featured-review.json  the featured years' statements, as reviewed, with their evidence
.github/workflows/ci.yml   CI: npm ci, typecheck, tests, both builds, each checked
scripts/strip_people.py    the contest-safe build: removes names and portraits from dist/
scripts/simulate-pacing.ts how long each era and event takes with the current pacing
functions/api/today.ts     Cloudflare Pages Function for today's rates (cached, with fallback)
src/index.ts               boot: World.create, load data, start screen
src/config.ts              currencies, the three bands' placement (BANDS), chart/map sizes, voice positions
src/experience.ts          the conductor: phases, one clock -> top band, chart, map, robot and sound
src/guide/guide-scripts.ts what the guide says for any year, and when, in English and Japanese (pure, tested)
src/a11y/narration.ts      Tock's voice: recordings, then speech synthesis, sentence by sentence (tested)
src/i18n/                  the display language: English templates (en.ts), Japanese (ja.ts), dates, line breaking
content/i18n/              Japanese data texts (by English) and names (from Wikidata)
scripts/i18n.ts            builds public/data/i18n-ja.json; lists missing or stale translations
scripts/build_names_ja.py  people's names in Japanese from Wikidata labels
scripts/voice-lines.ts     every line Tock can say, for every year and both builds -> content/voice/lines.json
scripts/voice_tool.py      recordings: estimate, generate (paid, only with --yes), publish, check
src/playback/year-journey.ts  walks a year's beats on the clock; the tunnel's year counter (pure, tested)
src/data/annual-currency.ts   a year's window, annual changes, ranking, sharpest move (pure, tested)
src/data/annual-history.ts    regions and systems, leaders in a year, the year's events (pure, tested)
src/visual/guide-robot.ts     Tock, the guide robot
src/visual/time-machine-tunnel.ts  the time tunnel
src/visual/year-selector.ts   the year selector and the subtitle strip
src/visual/year-stage.ts      the top band during a year: world, leaders, event, summary
src/visual/ui-button.ts       pinchable canvas buttons
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
tests/                     pytest for the data, media, map, leaders and events pipelines; node:test for the
                           year math, guide script, runner, chart, map, layout, portals, trails, Pages Function
```

## Development

Requirements: Node.js 22.18+ (`.nvmrc`; the tests run TypeScript directly, which needs 22.18 or later) or
24+, Python 3.10+ with `python -m pip install -r requirements-dev.txt` (pytest, Pillow, pypdf).

```bash
npm install
npm run dev        # IWSDK dev server with the built-in XR emulator (https://localhost:8081)
npm test           # pytest (data, media, map pipelines) + node:test (chart, map, layout, portals, ...)
npm run data       # re-download history and rebuild public/data/history.json + snapshot.json
npm run map        # rebuild the world map from Natural Earth
npm run media      # re-verify people and rebuild portraits and city photos
npm run leaders    # rebuild every year's leaders from Wikidata (cross-checked with Wikipedia) + portraits
npm run events     # re-check the Year Journey's events against their sources (network, cached)
npm run review     # re-check the featured years' statements against their quotes (network, cached)
npm run rates      # cross-check the featured years' rates with the Fed's H.10 (network, cached)
npm run pacing     # print when each event happens in the time-lapse
npm run i18n       # rebuild public/data/i18n-ja.json and docs/translation-status.md (i18n:check fails on gaps)
npm run names:ja   # people's names in Japanese from Wikidata (network, cached)
npm run voice:lines     # list every line Tock can say (content/voice/lines.json)
npm run voice:estimate  # characters, minutes and cost of recording them (nothing is sent)
npm run build      # production build into dist/
npm run build:contest  # the same without any real person's name or portrait (Rule 17)
npm run check:build    # check a full build in dist/ (run after npm run build)
npm run check:contest  # check a contest-safe build in dist/ (run after npm run build:contest)
```

In the emulator, enter XR, then switch the input to hands to try pinch and poke. Point a hand at a button,
a map marker or a chart label and pinch. (Keep the emulated hand away from the lap panel, or its ray hits the
panel first.)

Dev builds only (not in production): `y` opens the year selector, `9` starts the Full Journey, keys `1`-`5`
jump to its chapters, `g h j k l b n m ,` pinch CAD to AUD and `u` the US dollar's marker, `p` pauses,
`0` / `6` / `7` jump before the 1985 moment / the Asian crisis / the 2022 yen slide, `8` goes to the last
weeks, and `c` lifts the frame-time cap (useful when a backgrounded emulator window is throttled to 1 fps).

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
| Leaders' portraits (218) | Wikimedia Commons via Wikidata, each with its license (public domain, CC0, CC BY, CC BY-SA, OGL, GODL-India, GFDL, Attribution, Copyrighted free use), author and source: see [docs/leaders-verification.md](docs/leaders-verification.md); shown with their credit |
| City photographs and portraits | Wikimedia Commons, each with its own license (public domain, CC0, CC BY, CC BY-SA, KOGL Type 1), author and source: see [docs/portal-assets.md](docs/portal-assets.md) and [docs/history-verification.md](docs/history-verification.md) |

| Component | License |
| --- | --- |
| Immersive Web SDK (`@iwsdk/*`) | MIT |
| three.js (`super-three`) | MIT |
| pmndrs UIKit, Horizon kit, Lucide kit, pointer-events | MIT |
| Lucide icons (Pause, Play, Volume2) | ISC |
| Inter font (bundled by UIKit) | SIL Open Font License 1.1 |
| Exchange rate data | Frankfurter (frankfurter.dev), attribution shown in the app and here |
