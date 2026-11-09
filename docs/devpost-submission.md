# Devpost submission draft

**Track:** Entertainment / **Category:** New Experience
**Play:** https://currency-time-machine.pages.dev / **Code:** https://github.com/Tetsuya-Uchimura/currency-time-machine / **Video:** <YouTube URL>

## Tagline (max 140 characters)

> 78 years of the world's money, played around you as sound and light. Sit back, pinch, and feel history move.

(108 characters)

## Description (max 500 words)

### Inspiration

Exchange rates are usually a wall of numbers. Yet behind them are some of the biggest stories of the last
century: a world tied to gold, the night the anchor was cut, currencies that soared or collapsed in weeks.
We wanted to make that history something you can *feel* in a few minutes, with your ears and your body
rather than by reading a chart.

### What it does

You sit down and history starts: it is 1948. Around you float the currencies of the world as glowing orbs,
arranged west to east like a map, each trailing a ribbon of light drawn from its own past year. You stand
in the place of the US dollar. Time fast-forwards. In the
fixed-rate era almost nothing moves, and you hear calm. In 1971 the dollar's link to gold is cut and the
orbs come alive: each currency rises when it strengthens and sinks when it weakens, sings with its own
voice from its own direction, and plays faster when its market is restless, while its light trail keeps
the shape of the past year flowing away behind it. The Plaza Accord, the Asian
crisis, the birth of the euro and the 2008 crisis arrive as storms of sound and light. Finally the clock
catches up with the present and today's real exchange rates appear, so the ending is different every day.

Pinch a currency to hear it alone and open its light lane: its last twelve months, larger, with the change. Pinch the small panel at your lap to pause or jump between eras.
Everything works with one hand, seated, in about four minutes.

### How we built it

Built on Meta's Immersive Web SDK with three.js. The history is static: a Python build script downloads
daily composite rates since 1948 from the Frankfurter API, resamples them weekly, links the Deutsche Mark to
the euro, and checks the data for artefacts. Today's rates come through a Cloudflare Pages Function with
edge caching and a bundled fallback, so the experience works even if the API is down.

All sound is synthesized live with Web Audio: one HRTF-spatialized voice per currency, pitch quantized to a
pentatonic scale so it never clashes, note density driven by volatility, and a drone whose tension follows
market turbulence. All visuals are procedural, kept light for Quest.

### Challenges

Making data musical without making it noisy; pacing 78 years into minutes while giving key moments room to
breathe; and designing light that reacts to sound without ever flashing.

### What's next

Choosing your own home currency as your position, more voices (more currencies), a calm "listen to today"
mode, and haptic pulses on major moments.

(about 440 words)

## How we implemented hand interactions

- **Hands-first, no controller required.** Every interactive object uses IWSDK's input stack: orbs and the
  hand panel carry both `RayInteractable` (pinch from a distance via the hand's target ray) and
  `PokeInteractable` (direct touch with the index fingertip). Presses reach our ECS system as the `Pressed`
  tag (orbs) and as UIKit `click` events (panel buttons).
- **One hand, seated.** The panel rests low and close like a lap tray (about 40 cm below and 33 cm in front of
  the eyes), and the orbs sit on a 90 degree arc 60 cm away, so everything is reachable with either hand
  without leaning, and nothing needs two hands.
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
