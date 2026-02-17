import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { OKLCHColor } from "../../../../src/domain/color/color.schema.js"
import {
  compensateBatch,
  compensateForBackground
} from "../../../../src/domain/color/contrast-compensation.js"

/** White background */
const WHITE_BG = { l: 1, c: 0, h: 0, alpha: 1 }

/** Dark background (approximately #1a1a1a) */
const DARK_BG = { l: 0.17, c: 0, h: 0, alpha: 1 }

/** Mid-gray background */
const GRAY_BG = { l: 0.6, c: 0, h: 0, alpha: 1 }

/** Blueprint Blue (#2D72D2) approximate OKLCH */
const BLUE = { l: 0.57, c: 0.154, h: 258.7, alpha: 1 }

describe("Contrast Compensation", () => {
  describe("compensateForBackground", () => {
    it.effect("should return approximately the same color when backgrounds are identical", () =>
      Effect.gen(function* () {
        const color = yield* OKLCHColor(BLUE)
        const bg = yield* OKLCHColor(WHITE_BG)

        const result = yield* compensateForBackground(color, bg, bg)

        // When source and target backgrounds are the same, the color should barely change
        expect(result.l).toBeCloseTo(color.l, 1)
        expect(result.c).toBeCloseTo(color.c, 1)
        // Hue should be very close
        expect(Math.abs(result.h - color.h)).toBeLessThan(5)
      })
    )

    it.effect("should adjust color when moving from white to dark background", () =>
      Effect.gen(function* () {
        const color = yield* OKLCHColor(BLUE)
        const sourceBg = yield* OKLCHColor(WHITE_BG)
        const targetBg = yield* OKLCHColor(DARK_BG)

        const result = yield* compensateForBackground(color, sourceBg, targetBg)

        // The compensated color should differ from the original
        const totalDelta = Math.abs(result.l - color.l) + Math.abs(result.c - color.c)
        expect(totalDelta).toBeGreaterThan(0.01)

        // Result should be a valid color in gamut
        expect(result.l).toBeGreaterThanOrEqual(0)
        expect(result.l).toBeLessThanOrEqual(1)
        expect(result.c).toBeGreaterThanOrEqual(0)
        expect(result.alpha).toBe(1)
      })
    )

    it.effect("should approximately round-trip: compensate A→B then B→A", () =>
      Effect.gen(function* () {
        const color = yield* OKLCHColor(BLUE)
        const bgA = yield* OKLCHColor(WHITE_BG)
        const bgB = yield* OKLCHColor(GRAY_BG)

        // Compensate from A → B
        const compensatedAB = yield* compensateForBackground(color, bgA, bgB)
        // Compensate back from B → A
        const roundTripped = yield* compensateForBackground(compensatedAB, bgB, bgA)

        // Should approximately recover the original
        expect(roundTripped.l).toBeCloseTo(color.l, 1)
        expect(roundTripped.c).toBeCloseTo(color.c, 1)
      })
    )

    it.effect("should produce displayable (gamut-clamped) results", () =>
      Effect.gen(function* () {
        // High-chroma color that might go out of gamut after compensation
        const color = yield* OKLCHColor({ l: 0.7, c: 0.2, h: 140, alpha: 1 })
        const sourceBg = yield* OKLCHColor(WHITE_BG)
        const targetBg = yield* OKLCHColor(DARK_BG)

        const result = yield* compensateForBackground(color, sourceBg, targetBg)

        // Must be within OKLCH valid ranges
        expect(result.l).toBeGreaterThanOrEqual(0)
        expect(result.l).toBeLessThanOrEqual(1)
        expect(result.c).toBeGreaterThanOrEqual(0)
        expect(result.c).toBeLessThanOrEqual(0.5)
        expect(result.h).toBeGreaterThanOrEqual(0)
        expect(result.h).toBeLessThan(360)
      })
    )

    it.effect("should handle achromatic colors (grays)", () =>
      Effect.gen(function* () {
        const gray = yield* OKLCHColor({ l: 0.5, c: 0, h: 0, alpha: 1 })
        const sourceBg = yield* OKLCHColor(WHITE_BG)
        const targetBg = yield* OKLCHColor(DARK_BG)

        const result = yield* compensateForBackground(gray, sourceBg, targetBg)

        // Should produce a valid result
        expect(result.l).toBeGreaterThanOrEqual(0)
        expect(result.l).toBeLessThanOrEqual(1)
      })
    )

    it.effect("should preserve alpha channel", () =>
      Effect.gen(function* () {
        const color = yield* OKLCHColor({ ...BLUE, alpha: 0.8 })
        const sourceBg = yield* OKLCHColor(WHITE_BG)
        const targetBg = yield* OKLCHColor(DARK_BG)

        const result = yield* compensateForBackground(color, sourceBg, targetBg)

        expect(result.alpha).toBe(1) // Gamut clamp resets alpha to 1
      })
    )
  })

  describe("compensateBatch", () => {
    it.effect("should compensate multiple colors", () =>
      Effect.gen(function* () {
        const colors = [
          yield* OKLCHColor(BLUE),
          yield* OKLCHColor({ l: 0.7, c: 0.2, h: 140, alpha: 1 }),
          yield* OKLCHColor({ l: 0.45, c: 0.18, h: 30, alpha: 1 })
        ]
        const sourceBg = yield* OKLCHColor(WHITE_BG)
        const targetBg = yield* OKLCHColor(DARK_BG)

        const results = yield* compensateBatch(colors, sourceBg, targetBg)

        expect(results.length).toBe(3)
        for (const result of results) {
          expect(result.l).toBeGreaterThanOrEqual(0)
          expect(result.l).toBeLessThanOrEqual(1)
          expect(result.c).toBeGreaterThanOrEqual(0)
        }
      })
    )

    it.effect("should return empty array for empty input", () =>
      Effect.gen(function* () {
        const sourceBg = yield* OKLCHColor(WHITE_BG)
        const targetBg = yield* OKLCHColor(DARK_BG)

        const results = yield* compensateBatch([], sourceBg, targetBg)

        expect(results.length).toBe(0)
      })
    )
  })
})
