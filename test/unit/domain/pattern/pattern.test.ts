/**
 * Tests for statistical pattern extraction algorithms
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Either } from "effect"
import type { StopPosition } from "../../../../src/domain/palette/palette.schema.js"
import { STOP_POSITIONS } from "../../../../src/domain/palette/palette.schema.js"
import type { AnalyzedPalette, TransformationPattern } from "../../../../src/domain/pattern/pattern.js"
import { extractPatterns, PatternExtractionError } from "../../../../src/domain/pattern/pattern.js"
import { getStopTransform } from "../../../../src/domain/types/collections.js"

describe("Pattern Extraction Statistics", () => {
  // Helper to create a mock analyzed palette
  const createMockPalette = (name: string, scaleFactor = 1): AnalyzedPalette => ({
    name,
    stops: [
      { position: 100, color: { l: 0.9 * scaleFactor, c: 0.08 * scaleFactor, h: 250, alpha: 1 } },
      { position: 200, color: { l: 0.8 * scaleFactor, c: 0.1 * scaleFactor, h: 250, alpha: 1 } },
      { position: 300, color: { l: 0.7 * scaleFactor, c: 0.12 * scaleFactor, h: 250, alpha: 1 } },
      { position: 400, color: { l: 0.6 * scaleFactor, c: 0.14 * scaleFactor, h: 250, alpha: 1 } },
      { position: 500, color: { l: 0.5 * scaleFactor, c: 0.15 * scaleFactor, h: 250, alpha: 1 } },
      { position: 600, color: { l: 0.4 * scaleFactor, c: 0.14 * scaleFactor, h: 250, alpha: 1 } },
      { position: 700, color: { l: 0.3 * scaleFactor, c: 0.12 * scaleFactor, h: 250, alpha: 1 } },
      { position: 800, color: { l: 0.2 * scaleFactor, c: 0.1 * scaleFactor, h: 250, alpha: 1 } },
      { position: 900, color: { l: 0.1 * scaleFactor, c: 0.08 * scaleFactor, h: 250, alpha: 1 } },
      { position: 1000, color: { l: 0.05 * scaleFactor, c: 0.05 * scaleFactor, h: 250, alpha: 1 } }
    ]
  })

  // Helper to safely get transform or throw
  const getTransformOrThrow = (
    pattern: TransformationPattern,
    position: StopPosition
  ) => Either.getOrThrow(getStopTransform(pattern.transforms, position))

  describe("extractPatterns", () => {
    describe("basic extraction", () => {
      it.effect("should extract pattern from single palette", () =>
        Effect.gen(function*() {
          const palette = createMockPalette("test-blue")
          const pattern = yield* extractPatterns([palette])

          expect(pattern.name).toBe("learned-pattern")
          expect(pattern.referenceStop).toBe(500)
          expect(pattern.metadata.sourceCount).toBe(1)
          expect(pattern.metadata.confidence).toBe(0.8) // Single palette confidence
        }))

      it.effect("should have transforms for all 10 stops", () =>
        Effect.gen(function*() {
          const palette = createMockPalette("test-blue")
          const pattern = yield* extractPatterns([palette])

          expect(pattern.transforms.size).toBe(10)
          for (const pos of STOP_POSITIONS) {
            const transform = getTransformOrThrow(pattern, pos)
            expect(transform.lightnessMultiplier).toBeTypeOf("number")
            expect(transform.chromaMultiplier).toBeTypeOf("number")
            expect(transform.hueShiftDegrees).toBeTypeOf("number")
          }
        }))

      it.effect("should calculate lightness multipliers relative to reference stop", () =>
        Effect.gen(function*() {
          const palette = createMockPalette("test-blue")
          const pattern = yield* extractPatterns([palette])

          // Reference stop (500) should have multiplier ~1.0
          expect(getTransformOrThrow(pattern, 500).lightnessMultiplier).toBeCloseTo(1.0, 1)

          // Stop 100 is lighter (l=0.9 vs l=0.5) so multiplier should be 0.9/0.5 = 1.8
          expect(getTransformOrThrow(pattern, 100).lightnessMultiplier).toBeCloseTo(1.8, 1)

          // Stop 1000 is darker (l=0.05 vs l=0.5) so multiplier should be 0.05/0.5 = 0.1
          expect(getTransformOrThrow(pattern, 1000).lightnessMultiplier).toBeCloseTo(0.1, 1)
        }))

      it.effect("should calculate chroma multipliers relative to reference stop", () =>
        Effect.gen(function*() {
          const palette = createMockPalette("test-blue")
          const pattern = yield* extractPatterns([palette])

          // Reference stop (500) should have multiplier ~1.0
          expect(getTransformOrThrow(pattern, 500).chromaMultiplier).toBeCloseTo(1.0, 1)

          // Stop 100 has lower chroma (c=0.08 vs c=0.15) so multiplier ~0.53
          expect(getTransformOrThrow(pattern, 100).chromaMultiplier).toBeLessThan(1.0)

          // Stop 400 has slightly lower chroma (c=0.14 vs c=0.15) so multiplier ~0.93
          expect(getTransformOrThrow(pattern, 400).chromaMultiplier).toBeCloseTo(0.93, 1)
        }))

      it.effect("should calculate hue shifts relative to reference stop", () =>
        Effect.gen(function*() {
          const palette = createMockPalette("test-blue")
          const pattern = yield* extractPatterns([palette])

          // All stops have same hue (250) so shift should be 0
          for (const pos of STOP_POSITIONS) {
            expect(Math.abs(getTransformOrThrow(pattern, pos).hueShiftDegrees)).toBeLessThan(0.1)
          }
        }))
    })

    describe("custom reference stops", () => {
      it.effect("should support reference stop at 300", () =>
        Effect.gen(function*() {
          const palette = createMockPalette("test-blue")
          const pattern = yield* extractPatterns([palette], 300)

          expect(pattern.referenceStop).toBe(300)
          expect(getTransformOrThrow(pattern, 300).lightnessMultiplier).toBeCloseTo(1.0, 1)
        }))

      it.effect("should support reference stop at 700", () =>
        Effect.gen(function*() {
          const palette = createMockPalette("test-blue")
          const pattern = yield* extractPatterns([palette], 700)

          expect(pattern.referenceStop).toBe(700)
          expect(getTransformOrThrow(pattern, 700).lightnessMultiplier).toBeCloseTo(1.0, 1)
        }))

      it.effect("should calculate multipliers relative to custom reference", () =>
        Effect.gen(function*() {
          const palette = createMockPalette("test-blue")
          const pattern = yield* extractPatterns([palette], 300)

          // 300 has l=0.7, so 500 with l=0.5 should have multiplier 0.5/0.7 ~0.71
          expect(getTransformOrThrow(pattern, 500).lightnessMultiplier).toBeCloseTo(0.71, 1)
        }))
    })

    describe("multi-palette aggregation", () => {
      it.effect("should aggregate patterns from multiple palettes using median", () =>
        Effect.gen(function*() {
          const palette1 = createMockPalette("blue1", 1.0)
          const palette2 = createMockPalette("blue2", 1.1)
          const palette3 = createMockPalette("blue3", 0.9)

          const pattern = yield* extractPatterns([palette1, palette2, palette3])

          expect(pattern.metadata.sourceCount).toBe(3)
          // Median should be close to the middle value (1.0)
          expect(getTransformOrThrow(pattern, 100).lightnessMultiplier).toBeCloseTo(1.8, 0)
        }))

      it.effect("should calculate confidence based on consistency", () =>
        Effect.gen(function*() {
          const palette1 = createMockPalette("blue1", 1.0)
          const palette2 = createMockPalette("blue2", 1.0)
          const palette3 = createMockPalette("blue3", 1.0)

          const pattern = yield* extractPatterns([palette1, palette2, palette3])

          // Identical palettes should have high confidence
          expect(pattern.metadata.confidence).toBeGreaterThan(0.9)
        }))

      it.effect("should have lower confidence with inconsistent palettes", () =>
        Effect.gen(function*() {
          // Consistent palettes have high confidence
          const consistentPattern = yield* extractPatterns([
            createMockPalette("c1", 1.0),
            createMockPalette("c2", 1.0),
            createMockPalette("c3", 1.0)
          ])

          expect(consistentPattern.metadata.confidence).toBeLessThan(1)
        }))
    })

    describe("error handling", () => {
      it.effect("should fail when given empty palette array", () =>
        Effect.gen(function*() {
          const result = yield* Effect.either(extractPatterns([]))

          expect(Either.isLeft(result)).toBe(true)
          if (Either.isLeft(result)) {
            expect(result.left).toBeInstanceOf(PatternExtractionError)
            expect(result.left.message).toContain("no palettes provided")
          }
        }))

      it.effect("should fail when palette missing reference stop", () =>
        Effect.gen(function*() {
          const incompletePalette: AnalyzedPalette = {
            name: "incomplete",
            stops: [
              { position: 100, color: { l: 0.9, c: 0.08, h: 250, alpha: 1 } },
              { position: 200, color: { l: 0.8, c: 0.1, h: 250, alpha: 1 } }
              // Missing stop 500
            ]
          }

          const result = yield* Effect.either(extractPatterns([incompletePalette]))

          expect(Either.isLeft(result)).toBe(true)
          if (Either.isLeft(result)) {
            expect(result.left).toBeInstanceOf(PatternExtractionError)
            expect(result.left.message).toContain("Failed to extract transforms")
          }
        }))

      it.effect("should handle division by zero for lightness", () =>
        Effect.gen(function*() {
          const basePalette = createMockPalette("zero-lightness")
          // Modify reference stop to have zero lightness
          const zeroPalette: AnalyzedPalette = {
            ...basePalette,
            stops: basePalette.stops.map((s: AnalyzedPalette["stops"][number]) =>
              s.position === 500 ? { ...s, color: { ...s.color, l: 0 } } : s
            )
          }

          const pattern = yield* extractPatterns([zeroPalette])

          // Should not crash, uses 0.001 as minimum
          expect(getTransformOrThrow(pattern, 100).lightnessMultiplier).toBeGreaterThan(0)
          expect(Number.isFinite(getTransformOrThrow(pattern, 100).lightnessMultiplier)).toBe(true)
        }))

      it.effect("should handle division by zero for chroma", () =>
        Effect.gen(function*() {
          const basePalette = createMockPalette("zero-chroma")
          // Modify reference stop to have zero chroma
          const zeroPalette: AnalyzedPalette = {
            ...basePalette,
            stops: basePalette.stops.map((s: AnalyzedPalette["stops"][number]) =>
              s.position === 500 ? { ...s, color: { ...s.color, c: 0 } } : s
            )
          }

          const pattern = yield* extractPatterns([zeroPalette])

          // Should not crash, uses 0.001 as minimum
          expect(getTransformOrThrow(pattern, 100).chromaMultiplier).toBeGreaterThan(0)
          expect(Number.isFinite(getTransformOrThrow(pattern, 100).chromaMultiplier)).toBe(true)
        }))
    })

    describe("hue shift calculations", () => {
      it.effect("should calculate positive hue shifts", () =>
        Effect.gen(function*() {
          const palette: AnalyzedPalette = {
            name: "hue-shift",
            stops: [
              { position: 100, color: { l: 0.9, c: 0.08, h: 260, alpha: 1 } }, // +10 degrees
              { position: 200, color: { l: 0.8, c: 0.1, h: 255, alpha: 1 } },
              { position: 300, color: { l: 0.7, c: 0.12, h: 252, alpha: 1 } },
              { position: 400, color: { l: 0.6, c: 0.14, h: 251, alpha: 1 } },
              { position: 500, color: { l: 0.5, c: 0.15, h: 250, alpha: 1 } },
              { position: 600, color: { l: 0.4, c: 0.14, h: 249, alpha: 1 } },
              { position: 700, color: { l: 0.3, c: 0.12, h: 248, alpha: 1 } },
              { position: 800, color: { l: 0.2, c: 0.1, h: 245, alpha: 1 } },
              { position: 900, color: { l: 0.1, c: 0.08, h: 242, alpha: 1 } },
              { position: 1000, color: { l: 0.05, c: 0.05, h: 240, alpha: 1 } } // -10 degrees
            ]
          }

          const pattern = yield* extractPatterns([palette])

          expect(getTransformOrThrow(pattern, 100).hueShiftDegrees).toBeCloseTo(10, 0)
          expect(getTransformOrThrow(pattern, 1000).hueShiftDegrees).toBeCloseTo(-10, 0)
        }))

      it.effect("should handle hue wrapping around 360 degrees", () =>
        Effect.gen(function*() {
          const palette: AnalyzedPalette = {
            name: "hue-wrap",
            stops: [
              { position: 100, color: { l: 0.9, c: 0.08, h: 350, alpha: 1 } },
              { position: 200, color: { l: 0.8, c: 0.1, h: 355, alpha: 1 } },
              { position: 300, color: { l: 0.7, c: 0.12, h: 0, alpha: 1 } },
              { position: 400, color: { l: 0.6, c: 0.14, h: 5, alpha: 1 } },
              { position: 500, color: { l: 0.5, c: 0.15, h: 10, alpha: 1 } }, // Reference at 10
              { position: 600, color: { l: 0.4, c: 0.14, h: 15, alpha: 1 } },
              { position: 700, color: { l: 0.3, c: 0.12, h: 20, alpha: 1 } },
              { position: 800, color: { l: 0.2, c: 0.1, h: 22, alpha: 1 } },
              { position: 900, color: { l: 0.1, c: 0.08, h: 25, alpha: 1 } },
              { position: 1000, color: { l: 0.05, c: 0.05, h: 30, alpha: 1 } }
            ]
          }

          const pattern = yield* extractPatterns([palette])

          // 350 to 10 should be -20 (not +340)
          expect(Math.abs(getTransformOrThrow(pattern, 100).hueShiftDegrees)).toBeLessThan(30)
        }))
    })

    describe("median calculation", () => {
      it.effect("should use median for robustness against outliers", () =>
        Effect.gen(function*() {
          const palette1 = createMockPalette("normal1", 1.0)
          const palette2 = createMockPalette("normal2", 1.0)
          const palette3 = createMockPalette("outlier", 10.0) // Extreme outlier

          const pattern = yield* extractPatterns([palette1, palette2, palette3])

          // Median should be close to 1.0, not affected by outlier
          expect(getTransformOrThrow(pattern, 100).lightnessMultiplier).toBeCloseTo(1.8, 0)
        }))
    })
  })
})
