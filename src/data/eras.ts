/**
 * Eras of the international monetary system, shown in the Historical Events
 * band between events (with the year, the latest caption and a progress line).
 * Short, conservative descriptions; no outcome is shown before its date.
 * Pure data (no imports), unit tested in tests/layout.test.ts.
 */

export interface Era {
  /** First day of the era (ISO date). */
  from: string;
  name: string;
  text: string;
}

export const ERAS: Era[] = [
  {
    from: '1900-01-01',
    name: 'Bretton Woods: fixed rates',
    text: 'Currencies are pegged to the US dollar, and the dollar to gold. Rates move only when a government resets its peg.',
  },
  {
    // The United States suspends the dollar's convertibility into gold.
    from: '1971-08-15',
    name: 'After the gold link',
    text: 'The dollar no longer converts into gold. Governments try to hold new fixed rates.',
  },
  {
    // Fixed rates among the major currencies end in March 1973.
    from: '1973-03-01',
    name: 'Floating rates',
    text: 'The major currencies float: markets set their prices every day. Some others stay managed by their governments.',
  },
  {
    from: '1999-01-01',
    name: 'Floating rates and the euro',
    text: 'Countries of the euro area share one currency, the euro, which takes over from the Deutsche Mark. The major currencies keep floating.',
  },
];

export function eraAt(date: string): Era {
  let era = ERAS[0];
  for (const e of ERAS) if (date >= e.from) era = e;
  return era;
}
