# Devpost submission draft

**Track:** Entertainment / **Category:** New Experience
**Play:** https://currency-time-machine.pages.dev / **Code:** https://github.com/Tetsuya-Uchimura/currency-time-machine / **Video:** <YouTube URL>

## Tagline (max 140 characters)

> 78 years of the world's money as light, sound and history: where it moved, how much, and why. Sit back and pinch.

(113 characters)

## Description (max 500 words)

### Inspiration

Exchange rates are usually a wall of numbers. Yet behind them are some of the biggest stories of the last
century: a world tied to gold, the night the anchor was cut, currencies that soared or collapsed in weeks.
We wanted to make that history something you can *feel* in a few minutes, with your ears and your body
rather than by reading a chart.

### What it does

You sit down and history starts: it is 1948. Three layers of light float in front of you, all driven by one
clock. At the top, the era you are in. In the middle, nine glowing lines flow from right to left: each
currency's change against the US dollar over the past year, on one shared scale. At the bottom, a holographic world map shows where each currency lives, with the same numbers.
Each currency also sings with its own voice from its own direction, faster when its market is restless.

In the fixed-rate era almost nothing moves, and you hear calm. In 1971 the dollar's link to gold is cut and
the lines come alive. At four great moments (1971, 1985, 1997, 2008) the top layer opens onto the city at
the time, with photographs, the people who decided, and the rates moving live, while the currencies involved
light up on the chart and their countries glow on the map.
Finally the clock catches up with the present and today's real exchange rates appear, so the ending is
different every day.

Pinch a currency on the map or the chart to hear it alone. Pinch the small panel at your lap to pause or jump
between eras. Everything works with one hand, seated, in about four minutes.

### How we built it

Built on Meta's Immersive Web SDK with three.js. The history is static: a Python build script downloads
daily composite rates since 1948 from the Frankfurter API, resamples them weekly, links the Deutsche Mark to
the euro, and checks the data for artefacts. Today's rates come through a Cloudflare Pages Function with
edge caching and a bundled fallback, so the experience works even if the API is down.

All sound is synthesized live with Web Audio: one HRTF-spatialized voice per currency, pitch quantized to a
pentatonic scale so it never clashes, note density driven by volatility, and a drone whose tension follows
market turbulence. Chart lines are sampled from the weekly data every frame, from a common start, never
inventing a value; the map is drawn from public-domain Natural Earth data. Visuals are procedural and light.

### Challenges

Making data musical without making it noisy; pacing 78 years into minutes while giving key moments room to
breathe; and designing light that reacts to sound without ever flashing.

### What's next

Choosing your own home currency as your position, more voices (more currencies), a calm "listen to today"
mode, and haptic pulses on major moments.

(about 486 words)

## How we implemented hand interactions

- **Hands-first, no controller required.** Every interactive object uses IWSDK's input stack: the map
  markers and labels, the chart labels, the history band and the hand panel carry `RayInteractable` (pinch
  from a distance via the hand's target ray), and the currencies and panel also `PokeInteractable` (direct
  touch with the index fingertip). Presses reach our ECS system as the `Pressed` tag and as UIKit `click`
  events (panel buttons). Pinching a currency on the map or the chart solos it everywhere at once: its line,
  its region and its voice.
- **One hand, seated.** The panel rests low and close like a lap tray (about 40 cm below and 33 cm in front of
  the eyes); the three layers sit 1.1 to 1.4 m away, within about +28 to -37 degrees, so everything is
  seen with the eyes and a slight nod and pinched from the seat with either hand. Nothing needs two hands.
- **Anchored to you.** When the session starts, the whole scene is placed relative to your head position and
  facing, so it fits any seat height and posture. There is no locomotion at all.
- **Tested without a headset.** We developed and tested entirely in IWSDK's built-in emulator, scripting real
  hand gestures (fingertip pokes and pinches) to verify every control.

## What excites us about the future of VR

We are excited about VR as a medium for *understanding*, not only for escape. Spatial audio lets many
streams of information be present at once without crowding the eyes, and hands make interaction feel
natural to people who have never held a game controller. When the web can deliver this in seconds, with
no install, a few minutes on a bus is enough to feel something about the world's history. We think short,
calm, comfortable experiences like this, open to anyone, are where VR can grow next.
