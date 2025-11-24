/**
 * Statistical analysis of color palettes to extract transformation patterns
 */

import { Data, Effect } from "effect"
import type { StopPosition } from "../../schemas/palette.js"
import { STOP_POSITIONS } from "../../schemas/palette.js"
import { hueDifference } from "../color/conversions.js"
import type { AnalyzedPalette, StopTransform, TransformationPattern } from "./pattern.js"

/**
 * Error when pattern extraction fails
 */
export class PatternExtractionError extends Data.TaggedError("PatternExtractionError")<{
  readonly reason: string
  readonly paletteCount: number
}> {}

/**
 * Extract transformation patterns from analyzed palettes
 *
 * Calculates ratios for each stop relative to the reference stop (500)
 */
export const extractPatterns = (
  palettes: ReadonlyArray<AnalyzedPalette>,
  referenceStop: StopPosition = 500
): Effect.Effect<TransformationPattern, PatternExtractionError> =>
  Effect.gen(function*() {
    if (palettes.length === 0) {
      return yield* Effect.fail(
        new PatternExtractionError({
          reason: "No palettes provided",
          paletteCount: 0
        })
      )
    }

    // Collect ratios for each stop position
    const ratiosByStop: Record<StopPosition, Array<StopTransform>> = {} as Record<
      StopPosition,
      Array<StopTransform>
    >

    for (const position of STOP_POSITIONS) {
      ratiosByStop[position] = []
    }

    // Analyze each palette
    for (const palette of palettes) {
      const referenceColor = palette.stops.find((s) => s.position === referenceStop)

      if (!referenceColor) {
        return yield* Effect.fail(
          new PatternExtractionError({
            reason: `Palette "${palette.name}" missing reference stop ${referenceStop}`,
            paletteCount: palettes.length
          })
        )
      }

      // Avoid division by zero
      const refL = referenceColor.color.l === 0 ? 0.001 : referenceColor.color.l
      const refC = referenceColor.color.c === 0 ? 0.001 : referenceColor.color.c

      for (const stop of palette.stops) {
        const lightnessMultiplier = stop.color.l / refL
        const chromaMultiplier = stop.color.c / refC
        const hueShiftDegrees = hueDifference(referenceColor.color.h, stop.color.h)

        ratiosByStop[stop.position].push({
          lightnessMultiplier,
          chromaMultiplier,
          hueShiftDegrees
        })
      }
    }

    // Calculate median (or mean) for each stop
    const transforms = {} as Record<StopPosition, StopTransform>

    for (const position of STOP_POSITIONS) {
      const ratios = ratiosByStop[position]

      if (ratios.length === 0) {
        return yield* Effect.fail(
          new PatternExtractionError({
            reason: `No ratios calculated for stop ${position}`,
            paletteCount: palettes.length
          })
        )
      }

      // Use median for robustness (or mean for simplicity with single palette)
      const lightnessValues = ratios.map((r) => r.lightnessMultiplier)
      const chromaValues = ratios.map((r) => r.chromaMultiplier)
      const hueValues = ratios.map((r) => r.hueShiftDegrees)

      transforms[position] = {
        lightnessMultiplier: median(lightnessValues),
        chromaMultiplier: median(chromaValues),
        hueShiftDegrees: median(hueValues)
      }
    }

    // Calculate confidence based on consistency (for future multi-palette support)
    const confidence = palettes.length === 1 ? 0.8 : calculateConfidence(ratiosByStop)

    return {
      name: "learned-pattern",
      referenceStop,
      transforms,
      metadata: {
        sourceCount: palettes.length,
        confidence
      }
    }
  })

/**
 * Calculate median of an array of numbers
 */
const median = (values: ReadonlyArray<number>): number => {
  if (values.length === 0) return 0

  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  } else {
    return sorted[mid]
  }
}

/**
 * Calculate mean of an array of numbers
 */
const mean = (values: ReadonlyArray<number>): number => {
  if (values.length === 0) return 0
  return values.reduce((sum, val) => sum + val, 0) / values.length
}

/**
 * Calculate standard deviation
 */
const stdDev = (values: ReadonlyArray<number>): number => {
  if (values.length === 0) return 0
  const avg = mean(values)
  const squareDiffs = values.map((value) => Math.pow(value - avg, 2))
  return Math.sqrt(mean(squareDiffs))
}

/**
 * Calculate confidence based on consistency across palettes
 *
 * Lower variance = higher confidence
 */
const calculateConfidence = (
  ratiosByStop: Record<StopPosition, Array<StopTransform>>
): number => {
  let totalVariance = 0
  let count = 0

  for (const position of STOP_POSITIONS) {
    const ratios = ratiosByStop[position]
    if (ratios.length < 2) continue

    const lightnessValues = ratios.map((r) => r.lightnessMultiplier)
    const chromaValues = ratios.map((r) => r.chromaMultiplier)

    totalVariance += stdDev(lightnessValues) + stdDev(chromaValues)
    count += 2
  }

  const avgVariance = count > 0 ? totalVariance / count : 0

  // Map variance to confidence [0, 1]
  // Lower variance = higher confidence
  // This is a heuristic that can be tuned
  return Math.max(0, Math.min(1, 1 - avgVariance))
}
