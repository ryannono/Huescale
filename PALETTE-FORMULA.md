# Blueprint BP7 Intent Palette — Formula

The recipe for the final intent palette, encoded so it is reproducible and never
lost. The whole palette derives from **one source ramp (orange)** plus two
perceptual transforms. Re-running the pipeline regenerates every value exactly.

```bash
npx tsx scripts/build-final-palette.ts
```

This writes [`palette.final.json`](./palette.final.json) (every hue × `light`/`dark`)
and validates each generated value against the approved Figma swatches. Last run:
**all chromatic + grey ramps reproduce Figma exactly** (100/100 stops).

Scope: intents only to start — `orange`, `green`, `blue`, `red`, `grey`, plus the
`white` / `black` alpha overlay ramps. Scale is `100` (lightest) → `1000` (darkest).

---

## 1. Orange is the source of truth

[`patterns/default.json`](./patterns/default.json) is the orange ramp. Anchored at
stop **500 = `#BD5200`**, it defines the per-stop OKLCH **lightness / chroma / hue**
progression that every other chromatic hue inherits. Change orange and the whole
palette moves with it.

## 2. Light chromatic ramps — optical-appearance transform

For each hue, take orange's appearance (its L + C at each stop) and stamp it onto
the hue's own **hue angle**, anchored at stop 500:

| Hue    | 500 anchor (hue source) | Role      |
| ------ | ----------------------- | --------- |
| orange | `#BD5200`               | reference |
| blue   | `#2D72D2`               | target    |
| green  | `#008F37`               | target    |
| red    | `#CD4246`               | target    |

Mechanically: `applyOpticalAppearance(orange, anchor)` → generate all 10 stops from
the orange pattern → gamut-clamp to sRGB. (`src/domain/color/color.ts`,
`src/usecases/generatePalette.ts`.)

## 3. Light grey — Helmholtz-Kohlrausch compensation

Grey is not a hue transform. It is a near-neutral ramp whose **perceived
brightness** is matched to orange's chromatic stops using the H-K (Nayatani) model,
so grey reads as the same "weight" as the colors at each step.

- Source: [`patterns/gray-source.json`](./patterns/gray-source.json) — the approved
  ramp, loaded directly as the source of truth.
- Originally generated via `scripts/hk-compensate-gray.ts` with
  `--reference patterns/default.json --hue 257 --chroma 0.025`.
- Stops **100–700** are the H-K output as approved; **800–1000** were hand-tuned to
  ease into a real (non-pure) black instead of a uniform-step cliff.

## 4. Dark mode — CIECAM02 simultaneous-contrast compensation

Every light stop (chromatic **and** grey) is adapted from a white viewing context to
a black one so it appears perceptually equivalent on a dark background:

| Parameter   | Value                            |
| ----------- | -------------------------------- |
| method      | CIECAM02 forward → inverse       |
| source bg   | `#ffffff`                        |
| target bg   | `#000000`                        |
| Yb          | `15` (effective dark-screen adaptation; see `contrast-compensation.ts`) |

(`src/domain/color/contrast-compensation.ts`, `src/domain/color/ciecam02.ts`. Yb was
tuned empirically via `scripts/tune-yb.ts`.)

## 5. white / black — fixed alpha ramps

Authored opacity scales, not derived. Light and dark differ only at the subtle end.

| Stop | white light | white dark | black light | black dark |
| ---- | ----------- | ---------- | ----------- | ---------- |
| 100  | 6%          | 7%         | 2.5%        | 3%         |
| 200  | 12%         | 11%        | 9%          | 10%        |
| 300  | 20%         | 16%        | 12%         | 20%        |
| 400  | 30%         | 30%        | 30%         | 30%        |
| 500  | 50%         | 50%        | 50%         | 50%        |
| 600  | 80%         | 80%        | 80%         | 80%        |
| 700  | 85%         | 85%        | 85%         | 85%        |
| 800  | 90%         | 90%        | 90%         | 90%        |
| 900  | 95%         | 95%        | 95%         | 95%        |
| 1000 | 100%        | 100%       | 100%        | 100%       |

Bases: white `#ffffff`, black `#000105`. Emitted as `#RRGGBBAA` (or `#RRGGBB` at 100%).

---

## Where it lives

| Artifact                              | Purpose                                            |
| ------------------------------------- | -------------------------------------------------- |
| `scripts/build-final-palette.ts`      | The pipeline. Formula encoded as named constants.  |
| `patterns/default.json`               | Orange source ramp (the master pattern).           |
| `patterns/gray-source.json`           | Approved light grey ramp.                          |
| `palette.final.json`                  | Generated output: all hues × light/dark.           |
| `PALETTE-FORMULA.md`                  | This document.                                     |

The Figma swatches are embedded in the pipeline as the validation oracle, so any
future change that drifts from the approved palette fails loudly on the next run.

**Next step:** wire `palette.final.json` into Blueprint's
`packages/core/src/design-tokens/tokens/base/palette.tokens.json` (light) and a
`tokens/themes/dark/palette.tokens.json` override (dark).
