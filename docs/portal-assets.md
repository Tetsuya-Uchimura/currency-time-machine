# Historical Portals: image assets and rights record

This file records every visual used in the Historical Portals, where it came from, and how its use was
checked. It must be updated before any new image is added to the app.

## Current status (2026-11-09)

**No photographs are used.** All four windows show code-generated city impressions, drawn at runtime by
[src/visual/city-painter.ts](../src/visual/city-painter.ts). They are labelled on screen as
"Artistic impression, not a photograph".

| Scene | Event date | Visual | Period shown | Source | License / rights | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Washington, D.C. | 1971-08-20 | Code-generated impression (`washington-1971`) | early 1970s | Original work in this repository | Same as the project | Not applicable (no third-party material) |
| Tokyo | 1985-09-27 | Code-generated impression (`tokyo-1985`) | mid-1980s | Original work in this repository | Same as the project | Not applicable |
| Seoul | 1997-12-12 | Code-generated impression (`seoul-1997`) | late 1990s | Original work in this repository | Same as the project | Not applicable |
| New York | 2008-10-17 | Code-generated impression (`newyork-2008`) | around 2008 | Original work in this repository | Same as the project | Not applicable |

What the impressions contain, and what they deliberately avoid:

- Generic silhouettes only: low-rise blocks with an obelisk and a dome (Washington); dense mid-rise blocks,
  a generic lattice tower and an elevated railway (Tokyo); apartment slabs under mountains, a generic hilltop
  tower and a river bridge (Seoul); stepped skyscrapers and a generic suspension bridge (New York).
- No people, no text, no signs, no logos, no brand names, no flags.
- They are impressions of an era, not records of a day: they do not show any real event, and they are never
  presented as photographs.

## Why no photographs yet

The brief asks for photos of the right city and period with no identifiable people, no famous people, no
advertising, logos or legible brand names, and rights confirmed item by item (not merely "found on the web"
or "royalty free"). We could not complete that check for all four scenes within this iteration:

- City street and skyline photos of the 1970s-2000s very often contain people, shop signs or billboards,
  which the competition rules restrict, so each candidate has to be reviewed by eye at full resolution.
- Public-domain status is easiest to establish for works of the US federal government; it is much harder for
  Tokyo in the 1980s and Seoul in the 1990s, where photos are usually under copyright or under licenses
  that need careful attribution and share-alike handling.

Rather than ship anything uncertain, the app uses impressions now and supports verified photos later.

## How to add a verified photograph later

1. Find a candidate in a collection that states rights per item, for example:
   - Library of Congress, Prints & Photographs (check the item's "Rights Advisory"; some collections are
     dedicated to the public domain by the photographer).
   - US National Archives (works of US federal employees are generally public domain; check the item record).
   - Wikimedia Commons (read the file page's license and its source; do not rely on the Commons tag alone,
     follow it to the original source).
2. Check the image itself at full size: no identifiable people, no famous people, no legible signs,
   advertising, logos or brand names. Note the photo's own date; if it differs from the event year, the
   window must show the range (for example "1968-1973").
3. Optimize it: WebP, at most 1024 px on the long side, saved under `public/portals/` (never a remote URL).
4. Record it in the table above: file, city, date or period, source URL, author, license, and who checked
   it and when.
5. In [src/data/portals.ts](../src/data/portals.ts), set the scene's `visual` to a `photo` entry with
   `imagePath`, `imageDateOrPeriod`, `sourceUrl`, `license`, `attribution`, a `fallbackStyle`, and
   `assetVerificationStatus: 'verified'` only after steps 1-4. Any other status is ignored and the
   impression is shown; a missing or broken file also falls back to the impression.

## Other names and brands in the project (rules check)

- On-screen texts were reviewed for named people and brands. Event names that refer to a person or a
  business ("Nixon Shock", "Plaza Accord", named after a president and a hotel) were replaced with neutral
  descriptions: "the dollar-gold break", "a coordinated push on the dollar". A unit test
  (`tests/portals.test.ts`) fails if such names appear in captions or window texts.
- "Frankfurter (frankfurter.dev)" is shown because the data source asks for attribution; it is a credit,
  not advertising. "Meta Quest" and "Immersive Web SDK" name the platform and SDK of the competition.
- Developer-facing documents also name tools (Cloudflare, Wrangler, OBS); they are not shown in the app.
