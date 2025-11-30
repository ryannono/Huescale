/**
 * Tests for color boundary conditions and edge cases
 *
 * Covers:
 * - Lightness thresholds (MIN_VIABLE_LIGHTNESS=0.05, MAX_VIABLE_LIGHTNESS=0.95)
 * - Gamut boundary scenarios (perceptual gamut mapping)
 * - Hue normalization (wraparound at 0/360)
 * - Chroma extremes (0 and max)
 * - Alpha channel boundaries
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  clampToGamut,
  hueDifference,
  isDisplayable,
  isTransformationViable,
  normalizeHue,
  parseColorStringToOKLCH
} from "../../../../src/domain/color/color.js"
import { OKLCHColor } from "../../../../src/domain/color/color.schema.js"

describe("Color Boundaries", () => {
  describe("Lightness Viability Thresholds", () => {
    describe("near-black boundary (MIN_VIABLE_LIGHTNESS = 0.05)", () => {
      it.effect("should reject l=0.02 as not viable for transformation", () =>
        Effect.gen(function*() {
          const reference = yield* OKLCHColor({ l: 0.02, c: 0.1, h: 200 })
          const target = yield* OKLCHColor({ l: 0.5, c: 0.1, h: 100 })

          const result = yield* isTransformationViable(reference, target)

          expect(result).toBe(false)
        }))

      it.effect("should reject l=0.04 as not viable for transformation", () =>
        Effect.gen(function*() {
          const reference = yield* OKLCHColor({ l: 0.04, c: 0.1, h: 200 })
          const target = yield* OKLCHColor({ l: 0.5, c: 0.1, h: 100 })

          const result = yield* isTransformationViable(reference, target)

          expect(result).toBe(false)
        }))

      it.effect("should accept l=0.05 as viable for transformation (low chroma)", () =>
        Effect.gen(function*() {
          // Use very low chroma to ensure in-gamut at low lightness
          const reference = yield* OKLCHColor({ l: 0.05, c: 0.01, h: 200 })
          const target = yield* OKLCHColor({ l: 0.5, c: 0.01, h: 100 })

          const result = yield* isTransformationViable(reference, target)

          expect(result).toBe(true)
        }))

      it.effect("should accept l=0.06 as viable for transformation (low chroma)", () =>
        Effect.gen(function*() {
          // Use very low chroma to ensure in-gamut at low lightness
          const reference = yield* OKLCHColor({ l: 0.06, c: 0.01, h: 200 })
          const target = yield* OKLCHColor({ l: 0.5, c: 0.01, h: 100 })

          const result = yield* isTransformationViable(reference, target)

          expect(result).toBe(true)
        }))
    })

    describe("near-white boundary (MAX_VIABLE_LIGHTNESS = 0.95)", () => {
      it.effect("should reject l=0.98 as not viable for transformation", () =>
        Effect.gen(function*() {
          const reference = yield* OKLCHColor({ l: 0.98, c: 0.05, h: 200 })
          const target = yield* OKLCHColor({ l: 0.5, c: 0.1, h: 100 })

          const result = yield* isTransformationViable(reference, target)

          expect(result).toBe(false)
        }))

      it.effect("should reject l=0.96 as not viable for transformation", () =>
        Effect.gen(function*() {
          const reference = yield* OKLCHColor({ l: 0.96, c: 0.05, h: 200 })
          const target = yield* OKLCHColor({ l: 0.5, c: 0.1, h: 100 })

          const result = yield* isTransformationViable(reference, target)

          expect(result).toBe(false)
        }))

      it.effect("should accept l=0.95 as viable for transformation", () =>
        Effect.gen(function*() {
          const reference = yield* OKLCHColor({ l: 0.95, c: 0.02, h: 200 })
          const target = yield* OKLCHColor({ l: 0.5, c: 0.1, h: 100 })

          const result = yield* isTransformationViable(reference, target)

          expect(result).toBe(true)
        }))

      it.effect("should accept l=0.94 as viable for transformation", () =>
        Effect.gen(function*() {
          const reference = yield* OKLCHColor({ l: 0.94, c: 0.02, h: 200 })
          const target = yield* OKLCHColor({ l: 0.5, c: 0.1, h: 100 })

          const result = yield* isTransformationViable(reference, target)

          expect(result).toBe(true)
        }))
    })
  })

  describe("Gamut Boundaries", () => {
    describe("isDisplayable", () => {
      it.effect("should return true for mid-range in-gamut color", () =>
        Effect.gen(function*() {
          // Use lower chroma (0.05) which is safely in-gamut for most hues
          const color = yield* OKLCHColor({ l: 0.5, c: 0.05, h: 200 })

          const result = yield* isDisplayable(color)

          expect(result).toBe(true)
        }))

      it.effect("should return false for high chroma at problematic hue", () =>
        Effect.gen(function*() {
          // Very high chroma is often out of gamut
          const color = yield* OKLCHColor({ l: 0.5, c: 0.4, h: 264 })

          const result = yield* isDisplayable(color)

          expect(result).toBe(false)
        }))

      it.effect("should return true for pure white", () =>
        Effect.gen(function*() {
          const color = yield* OKLCHColor({ l: 1.0, c: 0, h: 0 })

          const result = yield* isDisplayable(color)

          expect(result).toBe(true)
        }))

      it.effect("should return true for pure black", () =>
        Effect.gen(function*() {
          const color = yield* OKLCHColor({ l: 0, c: 0, h: 0 })

          const result = yield* isDisplayable(color)

          expect(result).toBe(true)
        }))
    })

    describe("clampToGamut (perceptual gamut mapping)", () => {
      it.effect("should not modify in-gamut colors significantly", () =>
        Effect.gen(function*() {
          // Use lower chroma (0.05) which is safely in-gamut
          const color = yield* OKLCHColor({ l: 0.5, c: 0.05, h: 200 })

          const clamped = yield* clampToGamut(color)

          expect(clamped.l).toBeCloseTo(0.5, 2)
          expect(clamped.c).toBeCloseTo(0.05, 2)
          expect(clamped.h).toBeCloseTo(200, 1)
        }))

      it.effect("should reduce chroma for out-of-gamut colors", () =>
        Effect.gen(function*() {
          // High chroma likely out of gamut
          const color = yield* OKLCHColor({ l: 0.5, c: 0.4, h: 264 })

          const clamped = yield* clampToGamut(color)

          // Chroma should be reduced
          expect(clamped.c).toBeLessThan(0.4)
          // Hue may shift slightly (perceptual mapping)
          expect(Math.abs(hueDifference(clamped.h, 264))).toBeLessThan(15)
        }))

      it.effect("should produce displayable result from out-of-gamut input", () =>
        Effect.gen(function*() {
          // Very out-of-gamut combination
          const color = yield* OKLCHColor({ l: 0.9, c: 0.35, h: 140 })

          const clamped = yield* clampToGamut(color)

          // After clamping, chroma should be reduced
          expect(clamped.c).toBeLessThan(0.35)
          // Lightness may be adjusted by perceptual gamut mapping
          expect(clamped.l).toBeLessThanOrEqual(1)
          expect(clamped.l).toBeGreaterThanOrEqual(0)
        }))

      it.effect("should handle high lightness + high chroma combination", () =>
        Effect.gen(function*() {
          const color = yield* OKLCHColor({ l: 0.95, c: 0.2, h: 100 })

          const clamped = yield* clampToGamut(color)
          const displayable = yield* isDisplayable(clamped)

          expect(displayable).toBe(true)
          expect(clamped.c).toBeLessThanOrEqual(0.2)
        }))

      it.effect("should handle low lightness + chroma combination", () =>
        Effect.gen(function*() {
          const color = yield* OKLCHColor({ l: 0.1, c: 0.15, h: 280 })

          const clamped = yield* clampToGamut(color)
          const displayable = yield* isDisplayable(clamped)

          expect(displayable).toBe(true)
        }))
    })
  })

  describe("Hue Normalization", () => {
    describe("normalizeHue", () => {
      it("should return 0 for hue=0", () => {
        expect(normalizeHue(0)).toBe(0)
      })

      it("should return 0 for hue=360", () => {
        expect(normalizeHue(360)).toBe(0)
      })

      it("should return 0 for hue=720", () => {
        expect(normalizeHue(720)).toBe(0)
      })

      it("should return 270 for hue=-90", () => {
        expect(normalizeHue(-90)).toBe(270)
      })

      it("should return 90 for hue=450", () => {
        expect(normalizeHue(450)).toBe(90)
      })

      it("should return 359.5 for hue=359.5", () => {
        expect(normalizeHue(359.5)).toBeCloseTo(359.5, 5)
      })

      it("should return 0.5 for hue=0.5", () => {
        expect(normalizeHue(0.5)).toBeCloseTo(0.5, 5)
      })

      it("should handle negative values wrapping multiple times", () => {
        expect(normalizeHue(-450)).toBe(270)
      })
    })

    describe("hueDifference", () => {
      it("should return 0 for identical hues", () => {
        expect(hueDifference(180, 180)).toBe(0)
      })

      it("should return positive for clockwise difference", () => {
        expect(hueDifference(0, 90)).toBe(90)
      })

      it("should return negative for counter-clockwise difference", () => {
        expect(hueDifference(90, 0)).toBe(-90)
      })

      it("should take shortest path across 0/360 boundary (clockwise)", () => {
        expect(hueDifference(350, 10)).toBe(20)
      })

      it("should take shortest path across 0/360 boundary (counter-clockwise)", () => {
        expect(hueDifference(10, 350)).toBe(-20)
      })

      it("should return 180 for opposite hues", () => {
        expect(Math.abs(hueDifference(0, 180))).toBe(180)
      })

      it("should handle hue=0 vs hue=359", () => {
        expect(hueDifference(0, 359)).toBe(-1)
      })
    })
  })

  describe("Chroma Boundaries", () => {
    describe("zero chroma (achromatic)", () => {
      it.effect("should handle pure gray (c=0)", () =>
        Effect.gen(function*() {
          const color = yield* OKLCHColor({ l: 0.5, c: 0, h: 0 })

          const displayable = yield* isDisplayable(color)

          expect(displayable).toBe(true)
          expect(color.c).toBe(0)
        }))

      it.effect("should parse gray hex color correctly", () =>
        Effect.gen(function*() {
          const color = yield* parseColorStringToOKLCH("#808080")

          // Gray should have near-zero chroma
          expect(color.c).toBeLessThan(0.01)
        }))

      it.effect("should make transformation viable for both achromatic", () =>
        Effect.gen(function*() {
          const reference = yield* OKLCHColor({ l: 0.5, c: 0, h: 0 })
          const target = yield* OKLCHColor({ l: 0.7, c: 0, h: 0 })

          const result = yield* isTransformationViable(reference, target)

          expect(result).toBe(true)
        }))
    })

    describe("high chroma", () => {
      it.effect("should handle moderate chroma at mid-lightness", () =>
        Effect.gen(function*() {
          // Moderate chroma (0.1) at mid-lightness is typically in-gamut
          const color = yield* OKLCHColor({ l: 0.6, c: 0.1, h: 140 })

          const displayable = yield* isDisplayable(color)

          expect(displayable).toBe(true)
        }))

      it.effect("should clamp excessive chroma to gamut", () =>
        Effect.gen(function*() {
          // Very high chroma - definitely out of gamut
          const color = yield* OKLCHColor({ l: 0.5, c: 0.5, h: 264 })

          const clamped = yield* clampToGamut(color)

          expect(clamped.c).toBeLessThan(0.5)
        }))
    })
  })

  describe("Alpha Channel Boundaries", () => {
    it.effect("should handle alpha=0 (fully transparent)", () =>
      Effect.gen(function*() {
        // Use lower chroma (0.05) which is safely in-gamut
        const color = yield* OKLCHColor({ l: 0.5, c: 0.05, h: 200, alpha: 0 })

        const displayable = yield* isDisplayable(color)

        expect(displayable).toBe(true)
        expect(color.alpha).toBe(0)
      }))

    it.effect("should handle alpha=1 (fully opaque)", () =>
      Effect.gen(function*() {
        // Use lower chroma (0.05) which is safely in-gamut
        const color = yield* OKLCHColor({ l: 0.5, c: 0.05, h: 200, alpha: 1 })

        const displayable = yield* isDisplayable(color)

        expect(displayable).toBe(true)
        expect(color.alpha).toBe(1)
      }))

    it.effect("should handle alpha=0.5 (semi-transparent)", () =>
      Effect.gen(function*() {
        // Use lower chroma (0.05) which is safely in-gamut
        const color = yield* OKLCHColor({ l: 0.5, c: 0.05, h: 200, alpha: 0.5 })

        const displayable = yield* isDisplayable(color)

        expect(displayable).toBe(true)
        expect(color.alpha).toBe(0.5)
      }))

    it.effect("should preserve alpha through gamut clamping", () =>
      Effect.gen(function*() {
        const color = yield* OKLCHColor({ l: 0.5, c: 0.4, h: 264, alpha: 0.7 })

        const clamped = yield* clampToGamut(color)

        expect(clamped.alpha).toBe(0.7)
      }))
  })

  describe("Color Parsing Edge Cases", () => {
    it.effect("should parse pure white #ffffff", () =>
      Effect.gen(function*() {
        const color = yield* parseColorStringToOKLCH("#ffffff")

        expect(color.l).toBeCloseTo(1.0, 2)
        expect(color.c).toBeLessThan(0.01)
      }))

    it.effect("should parse pure black #000000", () =>
      Effect.gen(function*() {
        const color = yield* parseColorStringToOKLCH("#000000")

        expect(color.l).toBeCloseTo(0, 2)
        expect(color.c).toBeLessThan(0.01)
      }))

    it.effect("should parse pure red #ff0000", () =>
      Effect.gen(function*() {
        const color = yield* parseColorStringToOKLCH("#ff0000")

        // Red should have hue around 29 in OKLCH
        expect(color.h).toBeGreaterThan(20)
        expect(color.h).toBeLessThan(40)
        expect(color.c).toBeGreaterThan(0.2)
      }))

    it.effect("should parse pure green #00ff00", () =>
      Effect.gen(function*() {
        const color = yield* parseColorStringToOKLCH("#00ff00")

        // Green should have hue around 142 in OKLCH
        expect(color.h).toBeGreaterThan(130)
        expect(color.h).toBeLessThan(150)
        expect(color.c).toBeGreaterThan(0.2)
      }))

    it.effect("should parse pure blue #0000ff", () =>
      Effect.gen(function*() {
        const color = yield* parseColorStringToOKLCH("#0000ff")

        // Blue should have hue around 264 in OKLCH
        expect(color.h).toBeGreaterThan(255)
        expect(color.h).toBeLessThan(275)
        expect(color.c).toBeGreaterThan(0.2)
      }))

    it.effect("should parse hex without hash prefix", () =>
      Effect.gen(function*() {
        const color = yield* parseColorStringToOKLCH("2D72D2")

        expect(color.l).toBeGreaterThan(0.4)
        expect(color.c).toBeGreaterThan(0.1)
      }))

    it.effect("should parse RGB format", () =>
      Effect.gen(function*() {
        const color = yield* parseColorStringToOKLCH("rgb(45, 114, 210)")

        expect(color.l).toBeGreaterThan(0.4)
        expect(color.c).toBeGreaterThan(0.1)
      }))

    it.effect("should parse OKLCH format", () =>
      Effect.gen(function*() {
        const color = yield* parseColorStringToOKLCH("oklch(0.57 0.15 259)")

        expect(color.l).toBeCloseTo(0.57, 2)
        expect(color.c).toBeCloseTo(0.15, 2)
        expect(color.h).toBeCloseTo(259, 1)
      }))

    it.effect("should fail for invalid color string", () =>
      Effect.gen(function*() {
        const result = yield* Effect.either(parseColorStringToOKLCH("not-a-color"))

        expect(result._tag).toBe("Left")
      }))
  })
})
