/**
 * Historical Portals: scene metadata (pure data, no imports, unit tested).
 *
 * A portal is a "window onto the era": a city scene that rises behind the
 * orbs as one of four major moments approaches and fades once it has passed.
 *
 * Visuals: only assets whose rights were verified item by item may be used
 * (see docs/portal-assets.md). Until a photograph is verified, every scene
 * uses a code-generated city impression, and the window says so on screen
 * ("Artistic impression, not a photograph"). A photo entry with any other
 * verification status is ignored at runtime and the impression is shown.
 *
 * Text rules (competition rules + accuracy): no named people, no brands or
 * logos, no causal claims beyond the record; numbers come from the bundled
 * Frankfurter data and were checked in tests/portals.test.ts.
 */

/** Code-generated city impressions (src/visual/city-painter.ts). */
export type CityStyle = 'washington-1971' | 'tokyo-1985' | 'seoul-1997' | 'newyork-2008';

export type PortalVisual =
  | { kind: 'impression'; style: CityStyle }
  | {
      kind: 'photo';
      /** Local, optimized asset under public/ (never a remote URL). */
      imagePath: string;
      /** When the photo was taken (may differ from the event year). */
      imageDateOrPeriod: string;
      sourceUrl: string;
      license: string;
      attribution: string;
      /** Only 'verified' photos are ever displayed. */
      assetVerificationStatus: 'verified' | 'pending' | 'rejected';
      /** Shown instead if the photo is not verified or fails to load. */
      fallbackStyle: CityStyle;
    };

export interface PortalScene {
  /** Id of the event in src/data/events.ts this window belongs to. */
  eventId: string;
  /** The event's actual date (the highlight happens here, not at the caption). */
  eventDate: string;
  city: string;
  region: string;
  /** Era the scene evokes, shown on the window. */
  period: string;
  title: string;
  /** Pinch the window: two or three short sentences. */
  detail: string;
  visual: PortalVisual;
  /** Slots whose trails are highlighted (config SLOTS ids). */
  affectedSlots: string[];
  /** Sky tint while the window is open (hex). */
  tint: number;
  /** Frame and particle color (hex). */
  accent: number;
}

export const IMPRESSION_NOTE = 'Artistic impression, not a photograph';

export const PORTAL_SCENES: PortalScene[] = [
  {
    eventId: 'gold-break',
    eventDate: '1971-08-20',
    city: 'Washington, D.C.',
    region: 'United States',
    period: 'early 1970s',
    title: 'The dollar-gold break',
    detail:
      'In August 1971 the United States stopped exchanging dollars for gold with other governments. ' +
      'By 1973 fixed exchange rates had given way to floating ones: the yen went from about 357 to about 280 per dollar.',
    visual: { kind: 'impression', style: 'washington-1971' },
    affectedSlots: ['JPY', 'EUR', 'CHF'],
    tint: 0x18243a,
    accent: 0x9fc2ff,
  },
  {
    eventId: 'dollar-adjustment',
    eventDate: '1985-09-27',
    city: 'Tokyo',
    region: 'Japan',
    period: 'mid-1980s',
    title: 'A coordinated push on the dollar',
    detail:
      'In September 1985 five major economies agreed to act together against a strong dollar. ' +
      'Over the next two years the yen went from about 242 to about 127 per dollar, and the mark from about 2.9 to about 1.6.',
    visual: { kind: 'impression', style: 'tokyo-1985' },
    affectedSlots: ['JPY', 'EUR'],
    tint: 0x3a2412,
    accent: 0xffc58a,
  },
  {
    eventId: 'asian-crisis',
    eventDate: '1997-12-12',
    city: 'Seoul',
    region: 'South Korea',
    period: 'late 1990s',
    title: 'The Asian currency crisis',
    detail:
      'From mid-1997, money flowed out of several East and Southeast Asian economies and their currencies fell. ' +
      'The won went from about 888 to about 1,743 per dollar by the end of 1997, then recovered part of the loss in 1998.',
    visual: { kind: 'impression', style: 'seoul-1997' },
    affectedSlots: ['KRW'],
    tint: 0x3a1420,
    accent: 0xff9c9c,
  },
  {
    eventId: 'gfc',
    eventDate: '2008-10-17',
    city: 'New York',
    region: 'United States',
    period: 'around 2008',
    title: 'The global financial crisis',
    detail:
      'In autumn 2008 a banking crisis that began in the United States spread around the world. ' +
      'Investors moved into the dollar and the yen; the won fell from about 1,040 to about 1,470 per dollar, ' +
      'and the Australian dollar lost about a third of its value against it.',
    visual: { kind: 'impression', style: 'newyork-2008' },
    affectedSlots: ['JPY', 'KRW', 'AUD', 'GBP'],
    tint: 0x2a1622,
    accent: 0xbfd4ff,
  },
];

/** The style to draw: a verified photo's own image is used only when verified. */
export function sceneStyle(scene: PortalScene): CityStyle {
  return scene.visual.kind === 'impression' ? scene.visual.style : scene.visual.fallbackStyle;
}

/** Path of a photo that may be shown, or null (not verified / no photo). */
export function displayablePhoto(scene: PortalScene): string | null {
  const v = scene.visual;
  if (v.kind !== 'photo' || v.assetVerificationStatus !== 'verified') return null;
  if (!v.imagePath || /^[a-z]+:\/\//i.test(v.imagePath)) return null; // local assets only
  return v.imagePath;
}

/** Provenance line shown on the window. */
export function provenance(scene: PortalScene): string {
  const v = scene.visual;
  if (displayablePhoto(scene) && v.kind === 'photo') return `Photo: ${v.attribution} (${v.imageDateOrPeriod}), ${v.license}`;
  return IMPRESSION_NOTE;
}
