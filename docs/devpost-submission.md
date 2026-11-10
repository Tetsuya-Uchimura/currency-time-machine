# Devpost submission draft

**Track:** Entertainment / **Category:** New Experience
**Play:** https://currency-time-machine.pages.dev / **Code:** https://github.com/Tetsuya-Uchimura/currency-time-machine / **Video:** <YouTube URL>

> Rule 17: the organizers have not confirmed that identifiable historical people may be shown. Unless they do, submit the contest-safe build (`npm run build:contest`) and a video recorded from it, and do not claim compliance.

## Tagline (max 140 characters)

> Pick a year, ride a time tunnel with a guide robot, and see who led, what happened and how money moved. Hands only.

(115 characters)

## Description (max 500 words)

### Inspiration

Exchange rates are usually a wall of numbers. Yet behind them are some of the biggest stories of the last
century: a world tied to gold, the night the anchor was cut, currencies that soared or collapsed in weeks.
We wanted anyone, not only economists, to be able to ask "what happened in 1985?" and find out in two
minutes, with their eyes, ears and hands.

### What it does

Pick any year from 1948 to today. Tock, a small guide robot, sets the dial and a tunnel of gold and cyan
light carries you back (you never move; the light does). Then the year plays out on three layers driven by
one clock. At the top, the year's world: who governed the places that mattered, with portraits and terms,
and each event on its date. In the middle, nine glowing lines draw January to December: each currency's
change against the US dollar since the year's first week, on one shared scale. At the bottom, a holographic
world map shows where each currency lives.

Tock tells the year in order: the world, the leaders, the events, the currencies. It lights the lines it is
talking about, points at countries on the map, and pauses the year while it speaks. Pinch any country to ask
about it; pinch again and the story goes on. At the end, a summary ranks the year's changes, and you can go to
the next year, the previous one, any other, or the full journey from 1948 to today.

Every fact says how it was checked. In the five featured years, every event, portal text and opening line is
reviewed against quoted sources, mostly primary (ministries, central banks, the IMF); other years' events are
matched to a Wikipedia passage with their date, and say so. Every figure is computed from weekly rates, never
typed in, and cross-checked against the Federal Reserve's H.10.

### How we built it

Built on Meta's Immersive Web SDK with three.js. Python build scripts download composite rates since 1948
from the Frankfurter API, assemble 346 leadership terms in 23 offices from Wikidata (cross-checked with
Wikipedia infoboxes, with licensed portraits), and check every event against a quoted passage that gives
its date. The robot is made in code from a few shapes with a generated matcap; the tunnel is sixteen shader
rings, streaks and motes. Sound is synthesized live with Web Audio: one spatialized voice per currency, a
gong for events, a tunnel rush, and the music ducks under the robot's speech-synthesis voice. Subtitles are
always on.

### Challenges

Telling any of 79 years well without inventing anything; making the time travel feel thrilling without
moving the user; and keeping nine currencies readable by letting the guide choose what to light.

### What's next

Japanese narration (the script is built for translation), richer stories for more years, and your own home
currency as the base.

(about 480 words)

## How we implemented hand interactions

- **Hands-first, no controller required.** Every interactive object uses IWSDK's input stack: the year
  selector's dial and buttons, the summary's buttons, the map markers and labels, the chart labels, the history
  band and the hand panel carry `RayInteractable` (pinch from a distance via the hand's target ray) and
  `PokeInteractable` (direct touch with the index fingertip). Presses reach our ECS system as the `Pressed`
  tag (buttons light up with `Hovered`) and as UIKit `click` events (panel buttons). Pinching a country on the
  map opens its leaders and pauses the guide; pinching again resumes. The dial, Start Travel, Skip, Pause
  and Voice are repeated on the lap panel, within poking reach.
- **One hand, seated.** The panel rests low and close like a lap tray (about 40 cm below and 33 cm in front of
  the eyes); the three layers sit 1.1 to 1.4 m away, within about +28 to -37 degrees, so everything is
  seen with the eyes and a slight nod and pinched from the seat with either hand. Nothing needs two hands.
- **Anchored to you.** When the session starts, the whole scene is placed relative to your head position and
  facing, so it fits any seat height and posture. There is no locomotion at all.
- **Tested without a headset.** We developed and tested entirely in IWSDK's built-in emulator, scripting real
  hand gestures (ray pinches from the seat) to verify the controls. Performance and readability on a real
  Quest have not been measured yet.

## What excites us about the future of VR

We are excited about VR as a medium for *understanding*, not only for escape. Spatial audio lets many
streams of information be present at once without crowding the eyes, and hands make interaction feel
natural to people who have never held a game controller. When the web can deliver this in seconds, with
no install, a few minutes on a bus is enough to feel something about the world's history. We think short,
calm, comfortable experiences like this, open to anyone, are where VR can grow next.
