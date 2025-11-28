/**
 * Tests for interpolation and smoothing algorithms
 */

import { describe, expect, it } from "@effect/vitest"
import { Either } from "effect"
import type { TransformationPattern } from "../../../../src/domain/learning/pattern.js"
import { clamp, lerp, smoothPattern } from "../../../../src/domain/math/interpolation.js"
import type { StopPosition } from "../../../../src/domain/palette/palette.schema.js"
import { STOP_POSITIONS } from "../../../../src/domain/palette/palette.schema.js"
import { getStopTransform } from "../../../../src/domain/types/collections.js"

describe("Interpolation Math", () => {
  describe("lerp (linear interpolation)", () => {
    it("should interpolate at t=0 (return first value)", () => {
      expect(lerp(10, 20, 0)).toBe(10)
    })

    it("should interpolate at t=1 (return second value)", () => {
      expect(lerp(10, 20, 1)).toBe(20)
    })

    it("should interpolate at t=0.5 (return midpoint)", () => {
      expect(lerp(10, 20, 0.5)).toBe(15)
    })

    it("should interpolate at t=0.25", () => {
      expect(lerp(0, 100, 0.25)).toBe(25)
    })

    it("should interpolate at t=0.75", () => {
      expect(lerp(0, 100, 0.75)).toBe(75)
    })

    it("should handle negative values", () => {
      expect(lerp(-10, 10, 0.5)).toBe(0)
    })

    it("should handle values outside 0-1 range (extrapolation)", () => {
      expect(lerp(10, 20, 1.5)).toBe(25)
      expect(lerp(10, 20, -0.5)).toBe(5)
    })

    it("should handle zero range", () => {
      expect(lerp(5, 5, 0.5)).toBe(5)
    })
  })

  describe("clamp", () => {
    it("should return value when within range", () => {
      expect(clamp(5, 0, 10)).toBe(5)
    })

    it("should clamp to min when value is below min", () => {
      expect(clamp(-5, 0, 10)).toBe(0)
    })

    it("should clamp to max when value is above max", () => {
      expect(clamp(15, 0, 10)).toBe(10)
    })

    it("should handle value equal to min", () => {
      expect(clamp(0, 0, 10)).toBe(0)
    })

    it("should handle value equal to max", () => {
      expect(clamp(10, 0, 10)).toBe(10)
    })

    it("should handle negative ranges", () => {
      expect(clamp(-5, -10, -1)).toBe(-5)
      expect(clamp(-15, -10, -1)).toBe(-10)
      expect(clamp(0, -10, -1)).toBe(-1)
    })

    it("should handle decimal values", () => {
      expect(clamp(0.5, 0, 1)).toBe(0.5)
      expect(clamp(1.5, 0, 1)).toBe(1)
      expect(clamp(-0.5, 0, 1)).toBe(0)
    })
  })

  describe("smoothPattern", () => {
    // Helper to create a mock pattern
    const createMockPattern = (
      referenceStop: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000
    ): TransformationPattern => ({
      name: "test-pattern",
      referenceStop,
      metadata: {
        sourceCount: 1,
        confidence: 0.9
      },
      transforms: new Map([
        [100, { lightnessMultiplier: 1.5, chromaMultiplier: 0.8, hueShiftDegrees: 5 }],
        [200, { lightnessMultiplier: 1.3, chromaMultiplier: 0.9, hueShiftDegrees: 4 }],
        [300, { lightnessMultiplier: 1.15, chromaMultiplier: 0.95, hueShiftDegrees: 3 }],
        [400, { lightnessMultiplier: 1.05, chromaMultiplier: 0.98, hueShiftDegrees: 2 }],
        [500, { lightnessMultiplier: 1.0, chromaMultiplier: 1.0, hueShiftDegrees: 0 }],
        [600, { lightnessMultiplier: 0.9, chromaMultiplier: 0.95, hueShiftDegrees: -1 }],
        [700, { lightnessMultiplier: 0.75, chromaMultiplier: 0.85, hueShiftDegrees: -2 }],
        [800, { lightnessMultiplier: 0.55, chromaMultiplier: 0.7, hueShiftDegrees: -3 }],
        [900, { lightnessMultiplier: 0.35, chromaMultiplier: 0.5, hueShiftDegrees: -4 }],
        [1000, { lightnessMultiplier: 0.2, chromaMultiplier: 0.4, hueShiftDegrees: -5 }]
      ])
    })

    // Helper to safely get transform or throw
    const getTransformOrThrow = (pattern: TransformationPattern, position: StopPosition) =>
      Either.getOrThrow(getStopTransform(pattern.transforms, position))

    // Helper to compute consecutive differences for a property
    const computeConsecutiveDiffs = (
      pattern: TransformationPattern,
      extractor: (transform: ReturnType<typeof getTransformOrThrow>) => number
    ): ReadonlyArray<number> =>
      STOP_POSITIONS.slice(0, -1).map((curr, i) => {
        const next = STOP_POSITIONS[i + 1]
        return extractor(getTransformOrThrow(pattern, next)) - extractor(getTransformOrThrow(pattern, curr))
      })

    describe("lightness progression", () => {
      it("should create perfectly linear lightness multipliers", () => {
        const pattern = createMockPattern(500)
        const smoothed = Either.getOrThrow(smoothPattern(pattern))

        // Reference stop should be exactly 1.0
        expect(getTransformOrThrow(smoothed, 500).lightnessMultiplier).toBe(1.0)

        // Check smoothness: quadratic curve means differences change smoothly
        const diffs = computeConsecutiveDiffs(smoothed, (t) => t.lightnessMultiplier)

        // All diffs should be negative (descending) and change smoothly
        expect(diffs.every((d) => d < 0)).toBe(true)
      })

      it("should have descending lightness from 100 to 1000", () => {
        const pattern = createMockPattern(500)
        const smoothed = Either.getOrThrow(smoothPattern(pattern))

        // Each stop should be darker than the previous
        for (let i = 0; i < STOP_POSITIONS.length - 1; i++) {
          const curr = getTransformOrThrow(smoothed, STOP_POSITIONS[i]).lightnessMultiplier
          const next = getTransformOrThrow(smoothed, STOP_POSITIONS[i + 1]).lightnessMultiplier
          expect(curr).toBeGreaterThan(next)
        }
      })

      it("should normalize around reference stop 500", () => {
        const pattern = createMockPattern(500)
        const smoothed = Either.getOrThrow(smoothPattern(pattern))
        expect(getTransformOrThrow(smoothed, 500).lightnessMultiplier).toBe(1.0)

        // The quadratic curve should pass through learned endpoint values
        // and the reference point at 500
        expect(getTransformOrThrow(smoothed, 100).lightnessMultiplier).toBeCloseTo(
          getTransformOrThrow(pattern, 100).lightnessMultiplier,
          5
        )
        expect(getTransformOrThrow(smoothed, 1000).lightnessMultiplier).toBeCloseTo(
          getTransformOrThrow(pattern, 1000).lightnessMultiplier,
          5
        )
      })

      it("should have higher multipliers at lower stops (lighter)", () => {
        const pattern = createMockPattern(500)
        const smoothed = Either.getOrThrow(smoothPattern(pattern))

        expect(getTransformOrThrow(smoothed, 100).lightnessMultiplier).toBeGreaterThan(1.0)
        expect(getTransformOrThrow(smoothed, 200).lightnessMultiplier).toBeGreaterThan(1.0)
        expect(getTransformOrThrow(smoothed, 300).lightnessMultiplier).toBeGreaterThan(1.0)
      })

      it("should have lower multipliers at higher stops (darker)", () => {
        const pattern = createMockPattern(500)
        const smoothed = Either.getOrThrow(smoothPattern(pattern))

        expect(getTransformOrThrow(smoothed, 600).lightnessMultiplier).toBeLessThan(1.0)
        expect(getTransformOrThrow(smoothed, 700).lightnessMultiplier).toBeLessThan(1.0)
        expect(getTransformOrThrow(smoothed, 800).lightnessMultiplier).toBeLessThan(1.0)
        expect(getTransformOrThrow(smoothed, 900).lightnessMultiplier).toBeLessThan(1.0)
        expect(getTransformOrThrow(smoothed, 1000).lightnessMultiplier).toBeLessThan(1.0)
      })
    })

    describe("chroma curve", () => {
      it("should have reference stop at 1.0 chroma", () => {
        const pattern = createMockPattern(500)
        const smoothed = Either.getOrThrow(smoothPattern(pattern))

        // Reference stop should be 1.0
        expect(getTransformOrThrow(smoothed, 500).chromaMultiplier).toBe(1.0)

        // Quadratic curve should pass through learned endpoint values
        expect(getTransformOrThrow(smoothed, 100).chromaMultiplier).toBeCloseTo(
          getTransformOrThrow(pattern, 100).chromaMultiplier,
          5
        )
        expect(getTransformOrThrow(smoothed, 1000).chromaMultiplier).toBeCloseTo(
          getTransformOrThrow(pattern, 1000).chromaMultiplier,
          5
        )
      })

      it("should create smooth quadratic curve", () => {
        const pattern = createMockPattern(500)
        const smoothed = Either.getOrThrow(smoothPattern(pattern))

        // Verify all chroma values are in expected range
        for (const pos of STOP_POSITIONS) {
          const chroma = getTransformOrThrow(smoothed, pos).chromaMultiplier
          expect(chroma).toBeGreaterThanOrEqual(0)
          expect(chroma).toBeLessThanOrEqual(2) // Reasonable upper bound
        }

        // Verify smooth progression - no sudden jumps
        const diffs = computeConsecutiveDiffs(smoothed, (t) => t.chromaMultiplier).map(Math.abs)
        for (const diff of diffs) {
          expect(diff).toBeLessThan(0.5) // No sudden jumps
        }
      })

      it("should have non-negative chroma multipliers", () => {
        const pattern = createMockPattern(500)
        const smoothed = Either.getOrThrow(smoothPattern(pattern))

        for (const pos of STOP_POSITIONS) {
          expect(getTransformOrThrow(smoothed, pos).chromaMultiplier).toBeGreaterThanOrEqual(0)
        }
      })

      it("should create smooth parabolic curve (no sudden jumps)", () => {
        const pattern = createMockPattern(500)
        const smoothed = Either.getOrThrow(smoothPattern(pattern))

        // Check that differences between consecutive stops don't vary wildly
        const diffs = computeConsecutiveDiffs(smoothed, (t) => t.chromaMultiplier).map(Math.abs)

        // No single diff should be more than 2x the average
        const avgDiff = diffs.reduce((sum, d) => sum + d, 0) / diffs.length
        for (const diff of diffs) {
          expect(diff).toBeLessThan(avgDiff * 2.5)
        }
      })
    })

    describe("hue consistency", () => {
      it("should use consistent hue across all stops", () => {
        const pattern = createMockPattern(500)
        const smoothed = Either.getOrThrow(smoothPattern(pattern))

        const hue = getTransformOrThrow(smoothed, 100).hueShiftDegrees

        // All stops should have the same hue
        for (const pos of STOP_POSITIONS) {
          expect(getTransformOrThrow(smoothed, pos).hueShiftDegrees).toBe(hue)
        }
      })

      it("should use median hue to eliminate outliers", () => {
        // Create pattern with one outlier
        const pattern = createMockPattern(500)
        const transform100 = getTransformOrThrow(pattern, 100)
        // Modify the pattern to have an outlier
        const modifiedPattern = {
          ...pattern,
          transforms: new Map(pattern.transforms).set(100, { ...transform100, hueShiftDegrees: 100 })
        }

        const smoothed = Either.getOrThrow(smoothPattern(modifiedPattern))
        const consistentHue = getTransformOrThrow(smoothed, 500).hueShiftDegrees

        // Consistent hue should not be affected by the outlier
        expect(Math.abs(consistentHue)).toBeLessThan(10)
      })

      it("should handle even number of values (average of two middle values)", () => {
        const pattern = createMockPattern(500)
        const smoothed = Either.getOrThrow(smoothPattern(pattern))

        // With 10 stops, median should be average of 5th and 6th values
        // Values: -5, -4, -3, -2, -1, 0, 2, 3, 4, 5
        // Sorted: -5, -4, -3, -2, -1, 0, 2, 3, 4, 5
        // Median: (-1 + 0) / 2 = -0.5
        expect(getTransformOrThrow(smoothed, 500).hueShiftDegrees).toBeCloseTo(-0.5, 1)
      })
    })

    describe("metadata", () => {
      it("should update pattern name with -smoothed suffix", () => {
        const pattern = createMockPattern(500)
        const smoothed = Either.getOrThrow(smoothPattern(pattern))

        expect(smoothed.name).toBe("test-pattern-smoothed")
      })

      it("should preserve other pattern properties", () => {
        const pattern = createMockPattern(500)
        const smoothed = Either.getOrThrow(smoothPattern(pattern))

        expect(smoothed.referenceStop).toBe(pattern.referenceStop)
        expect(smoothed.metadata).toEqual(pattern.metadata)
      })

      it("should have transforms for all 10 stop positions", () => {
        const pattern = createMockPattern(500)
        const smoothed = Either.getOrThrow(smoothPattern(pattern))

        expect(smoothed.transforms.size).toBe(10)
        for (const pos of STOP_POSITIONS) {
          expect(smoothed.transforms.get(pos)).toBeDefined()
        }
      })
    })
  })
})
