# Exchange rates: cross-check against the Federal Reserve's H.10

Generated 2026-11-10 by `scripts/check_rates.py`. Do not edit by hand.

The app's rates are Frankfurter's composite rates sampled weekly (Fridays). Here each weekly observation
of the featured years is compared with the Federal Reserve's H.10 noon buying rate in New York for the same
day (FRED series DEX...; the last business day before it when that day has no rate). A week fails above
1.5%. FRED no longer serves H.10's daily Deutsche Mark rates, so the Mark (to 1998) is compared
month by month (our weekly mean vs H.10's monthly average, limit 2.0%). The figures the guide and
the portals state are then recomputed from H.10.

- **OK**: within the limit. **differs**: above it but under 5.0%. Most of these are weeks of fast moves
  (October 2008, the September and October 2022 interventions), when rates taken at different hours can differ by
  a few percent; they were not checked one by one.
  **explained**: above 5.0%, checked by hand against both daily series (see the end). **FAIL**: anything else.
- The app shows the weekly composite. A difference here does not make a stated figure wrong, but it shows how
  much a figure taken on one day can depend on the hour, in the most volatile weeks.

## Weekly observations

| Year | Currency | Weeks | Median difference | Largest difference | Result |
| --- | --- | --- | --- | --- | --- |
| 1971 | DEM | 12 months (monthly averages) | 0.06% | 0.35% (1971-08-01: 3.404 vs 3.416) | OK |
| 1971 | GBP | 52 | 0.01% | 0.24% (1971-10-08: 0.4022 vs 0.4032) | OK |
| 1971 | CHF | 52 | 0.01% | 1.90% (1971-05-07: 4.216 vs 4.137) | **differs** |
| 1971 | CAD | 53 | 0.03% | 0.12% (1971-05-07: 1.008 vs 1.007) | OK |
| 1971 | JPY | 51 | 0.02% | 0.11% (1971-05-14: 357.1 vs 357.5) | OK |
| 1971 | AUD | 51 | 0.00% | 0.00% (1971-12-31: 0.8413 vs 0.8413) | OK |
| 1985 | DEM | 12 months (monthly averages) | 0.26% | 1.13% (1985-02-01: 3.265 vs 3.303) | OK |
| 1985 | GBP | 52 | 0.35% | 1.40% (1985-09-06: 0.7441 vs 0.7547) | OK |
| 1985 | CHF | 52 | 0.34% | 1.47% (1985-05-03: 2.671 vs 2.711) | OK |
| 1985 | CAD | 52 | 0.13% | 1.28% (1985-02-22: 1.37 vs 1.387) | OK |
| 1985 | JPY | 52 | 0.17% | 0.71% (1985-08-30: 237.3 vs 239) | OK |
| 1985 | AUD | 52 | 0.37% | 0.89% (1985-09-20: 1.444 vs 1.432) | OK |
| 1985 | INR | 52 | 0.00% | 0.00% (1985-01-04: 12.5 vs 12.5) | OK |
| 1985 | CNY | 52 | 0.40% | 0.65% (1985-10-25: 3.138 vs 3.159) | OK |
| 1985 | KRW | 52 | 0.24% | 0.47% (1985-10-25: 891.5 vs 895.7) | OK |
| 1997 | DEM | 12 months (monthly averages) | 0.19% | 0.48% (1997-07-01: 1.785 vs 1.794) | OK |
| 1997 | GBP | 52 | 0.26% | 1.07% (1997-08-15: 0.6281 vs 0.6215) | OK |
| 1997 | CHF | 52 | 0.45% | 1.54% (1997-05-09: 1.445 vs 1.423) | **differs** |
| 1997 | CAD | 52 | 0.15% | 0.63% (1997-08-01: 1.38 vs 1.389) | OK |
| 1997 | JPY | 52 | 0.29% | 2.47% (1997-08-08: 118.2 vs 115.3) | **differs** |
| 1997 | AUD | 52 | 0.20% | 1.15% (1997-05-23: 1.292 vs 1.307) | OK |
| 1997 | INR | 52 | 0.05% | 1.26% (1997-12-19: 39.5 vs 40) | OK |
| 1997 | CNY | 52 | 0.30% | 0.43% (1997-06-27: 8.293 vs 8.329) | OK |
| 1997 | KRW | 52 | 0.23% | 15.76% (1997-12-26: 1,743 vs 1,506) | **explained** |
| 2008 | EUR | 52 | 0.32% | 1.90% (2008-12-19: 0.707 vs 0.7207) | **differs** |
| 2008 | GBP | 52 | 0.26% | 2.16% (2008-10-24: 0.626 vs 0.6398) | **differs** |
| 2008 | CHF | 52 | 0.44% | 1.81% (2008-12-19: 1.09 vs 1.111) | **differs** |
| 2008 | CAD | 52 | 0.34% | 3.08% (2008-10-10: 1.153 vs 1.19) | **differs** |
| 2008 | JPY | 52 | 0.35% | 3.26% (2008-10-24: 95.66 vs 92.64) | **differs** |
| 2008 | AUD | 52 | 0.34% | 4.26% (2008-10-24: 1.553 vs 1.622) | **differs** |
| 2008 | INR | 52 | 0.32% | 2.82% (2008-07-25: 42.26 vs 41.1) | **differs** |
| 2008 | CNY | 52 | 0.06% | 0.90% (2008-09-12: 6.842 vs 6.781) | OK |
| 2008 | KRW | 52 | 0.20% | 1.75% (2008-10-31: 1,300 vs 1,278) | **differs** |
| 2022 | EUR | 52 | 0.19% | 1.08% (2022-03-04: 0.9065 vs 0.9164) | OK |
| 2022 | GBP | 52 | 0.28% | 2.34% (2022-09-23: 0.8942 vs 0.9157) | **differs** |
| 2022 | CHF | 52 | 0.25% | 0.97% (2022-11-04: 1.008 vs 0.9981) | OK |
| 2022 | CAD | 52 | 0.28% | 0.96% (2022-04-22: 1.259 vs 1.272) | OK |
| 2022 | JPY | 52 | 0.23% | 2.75% (2022-10-21: 150.4 vs 146.3) | **differs** |
| 2022 | AUD | 52 | 0.49% | 1.54% (2022-10-21: 1.595 vs 1.57) | **differs** |
| 2022 | INR | 52 | 0.11% | 0.69% (2022-11-04: 82.6 vs 82.03) | OK |
| 2022 | CNY | 52 | 0.09% | 0.78% (2022-12-30: 6.951 vs 6.897) | OK |
| 2022 | KRW | 52 | 0.16% | 2.07% (2022-11-11: 1,349 vs 1,378) | **differs** |

## Figures stated in the app

| Claim | App data | H.10 | Result |
| --- | --- | --- | --- |
| 1985 opening: DEM change 1980-01-04 to 1985-01-04 (H.10: monthly averages) | -45.8% | -45.6% | OK |
| 1985 opening: JPY change 1980-01-04 to 1985-01-04 | -6.5% | -7.3% | OK |
| 1985 portal: USD peak against DEM before the Plaza meeting (22 September) | 1985-03-08 | 1985-02-01 | OK |
| 1985 portal: USD peak against JPY before the Plaza meeting (22 September) | 1985-02-22 | 1985-02-13 | OK |
| portal scene 1971: JPY about 357 per USD (August 1971) | 357.4 | 357.4 | OK |
| portal scene 1971: JPY about 280 per USD (end of 1973) | 279.8 | 280.4 | OK |
| portal scene 1985: JPY about 242 per USD (September 1985) | 241.6 | 240.1 | OK |
| portal scene 1985: JPY about 127 per USD (end of 1987) | 126.5 | 126.1 | OK |
| portal scene 1985: DEM about 2.9 per USD (September 1985; H.10 monthly average) | 2.889 | 2.838 | OK |
| portal scene 1985: DEM about 1.6 per USD (end of 1987; H.10 monthly average) | 1.634 | 1.633 | OK |
| 1997 portal: KRW about 888 per USD (late June 1997) | 888.2 | 890 | OK |
| 1997 portal: KRW about 1,700 per USD at the end of 1997 (app: last week, 26 Dec; H.10: 31 Dec) | 1,743 | 1,695 | OK |
| portal scene 1997: KRW recovered part of the loss in 1998 (end of 1997 to end of 1998) | 1,743 -> 1,208 | 1,506 -> 1,208 | OK |
| 2008 portal: KRW about 1,040 per USD (late June 2008) | 1,040 | 1,042 | OK |
| 2008 portal: KRW about 1,470 per USD (late November 2008) | 1,470 | 1,468 | OK |
| 2008 portal: AUD lost about a third against USD (late June to late November) | -31.7% | -31.9% | OK |
| portal scene 2008: AUD lost about a third against USD (mid-July to late October) | -33.7% | -36.6% | OK |
| portal scene 2008: the yen rose against USD (late June to late November) | 106.9 -> 95.41 | 106.3 -> 95.46 | OK |
| 1971 year: DEM 1971-01-01 to 1971-12-31 (H.10: monthly averages) | +11.6% | +11.3% | OK |
| 1971 year: GBP 1971-01-01 to 1971-12-31 | +6.7% | +6.6% | OK |
| 1971 year: CHF 1971-01-01 to 1971-12-31 | +10.2% | +10.3% | OK |
| 1971 year: CAD 1971-01-01 to 1971-12-31 | +0.8% | +0.8% | OK |
| 1971 year: JPY 1971-01-01 to 1971-12-31 | +13.6% | +13.6% | OK |
| 1985 year: DEM 1985-01-04 to 1985-12-27 (H.10: monthly averages) | +26.8% | +26.2% | OK |
| 1985 year: GBP 1985-01-04 to 1985-12-27 | +24.3% | +24.5% | OK |
| 1985 year: CHF 1985-01-04 to 1985-12-27 | +25.1% | +26.3% | OK |
| 1985 year: CAD 1985-01-04 to 1985-12-27 | -5.7% | -5.6% | OK |
| 1985 year: JPY 1985-01-04 to 1985-12-27 | +24.6% | +25.2% | OK |
| 1985 year: AUD 1985-01-04 to 1985-12-27 | -16.3% | -16.0% | OK |
| 1985 year: INR 1985-01-04 to 1985-12-27 | +2.5% | +2.5% | OK |
| 1985 year: CNY 1985-01-04 to 1985-12-27 | -12.0% | -12.2% | OK |
| 1985 year: KRW 1985-01-04 to 1985-12-27 | -7.1% | -7.0% | OK |
| 1997 year: DEM 1997-01-03 to 1997-12-26 (H.10: monthly averages) | -12.9% | -9.8% | OK |
| 1997 year: GBP 1997-01-03 to 1997-12-26 | -1.5% | -1.2% | OK |
| 1997 year: CHF 1997-01-03 to 1997-12-26 | -5.9% | -5.3% | OK |
| 1997 year: CAD 1997-01-03 to 1997-12-26 | -4.2% | -4.3% | OK |
| 1997 year: JPY 1997-01-03 to 1997-12-26 | -10.9% | -10.7% | OK |
| 1997 year: AUD 1997-01-03 to 1997-12-26 | -17.4% | -17.1% | OK |
| 1997 year: INR 1997-01-03 to 1997-12-26 | -8.4% | -8.5% | OK |
| 1997 year: CNY 1997-01-03 to 1997-12-26 | +0.2% | +0.2% | OK |
| 1997 year: KRW 1997-01-03 to 1997-12-26 | -51.6% | -43.8% | **explained** (see below) |
| 2008 year: EUR 2008-01-04 to 2008-12-26 | -4.8% | -4.9% | OK |
| 2008 year: GBP 2008-01-04 to 2008-12-26 | -25.3% | -25.6% | OK |
| 2008 year: CHF 2008-01-04 to 2008-12-26 | +3.6% | +3.4% | OK |
| 2008 year: CAD 2008-01-04 to 2008-12-26 | -18.6% | -18.2% | OK |
| 2008 year: JPY 2008-01-04 to 2008-12-26 | +21.1% | +19.6% | OK |
| 2008 year: AUD 2008-01-04 to 2008-12-26 | -22.4% | -22.2% | OK |
| 2008 year: INR 2008-01-04 to 2008-12-26 | -18.4% | -19.1% | OK |
| 2008 year: CNY 2008-01-04 to 2008-12-26 | +6.4% | +6.3% | OK |
| 2008 year: KRW 2008-01-04 to 2008-12-26 | -28.6% | -27.8% | OK |
| 2022 year: EUR 2022-01-07 to 2022-12-30 | -5.7% | -5.8% | OK |
| 2022 year: GBP 2022-01-07 to 2022-12-30 | -11.0% | -11.1% | OK |
| 2022 year: CHF 2022-01-07 to 2022-12-30 | -0.3% | -0.5% | OK |
| 2022 year: CAD 2022-01-07 to 2022-12-30 | -6.1% | -6.6% | OK |
| 2022 year: JPY 2022-01-07 to 2022-12-30 | -12.6% | -12.3% | OK |
| 2022 year: AUD 2022-01-07 to 2022-12-30 | -5.6% | -5.3% | OK |
| 2022 year: INR 2022-01-07 to 2022-12-30 | -10.1% | -10.2% | OK |
| 2022 year: CNY 2022-01-07 to 2022-12-30 | -8.3% | -7.5% | OK |
| 2022 year: KRW 2022-01-07 to 2022-12-30 | -4.8% | -4.7% | OK |

## Explained differences

- KRW 1997-12-26: Composite 1,743 vs H.10 1,506 on 26 December 1997. The won swung by up to a fifth a day that month (H.10: 1,960 on 23 December, 1,506 on 26 December, 1,695 on 31 December; composite: 1,954, 1,743, 1,697). Both daily series agree before and after that week. The year's change the guide states for the won (first to last weekly observation, 3 January to 26 December) therefore depends on the hour: -51.6% with the composite, -43.8% with H.10.
