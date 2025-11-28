/**
 * Statistical analysis of color palettes to extract transformation patterns
 */

import { Array as Arr, Data, Effect, Option, Order } from "effect"
import { hueDifference } from "../color/conversions.js"
import type { StopPosition } from "../palette/palette.schema.js"
import { STOP_POSITIONS } from "../palette/palette.schema.js"
import type { AnalyzedPalette, StopTransform, TransformationPattern } from "./pattern.js"

// ============================================================================
// Constants
// ============================================================================

/** Minimum value to prevent division by zero */
const MIN_DIVISOR = 0.001

/** Default confidence for single-palette patterns */
const DEFAULT_SINGLE_PALETTE_CONFIDENCE = 0.8

/** Reference stop position for calculating transformations */
const DEFAULT_REFERENCE_STOP = 500 satisfies StopPosition

// ============================================================================
// Errors
// ============================================================================

/**
 * Error when pattern extraction fails
 */
export class PatternExtractionError extends Data.TaggedError("PatternExtractionError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ============================================================================
// Public API
// ============================================================================

/**
 * Extract transformation patterns from analyzed palettes
 *
 * Calculates ratios for each stop relative to the reference stop (500).
 * Returns Either.left if pattern extraction fails, Either.right with pattern otherwise.
 */
export const extractPatterns = (
  palettes: ReadonlyArray<AnalyzedPalette>,
  referenceStop: StopPosition = DEFAULT_REFERENCE_STOP
): Effect.Effect<TransformationPattern, PatternExtractionError> =>
  Effect.gen(function*() {
    // Validate input
    if (palettes.length === 0) {
      return yield* Effect.fail(
        new PatternExtractionError({
          message: "Failed to extract patterns: no palettes provided"
        })
      )
    }

    // Extract transforms from all palettes
    const allTransforms = yield* Effect.forEach(
      palettes,
      (palette) => extractPaletteTransforms(palette, referenceStop),
      { concurrency: "unbounded" }
    ).pipe(
      Effect.mapError(
        (cause) =>
          new PatternExtractionError({
            message: "Failed to extract transforms from palettes",
            cause
          })
      )
    )

    // Group transforms by stop position
    const transformsByStop = groupTransformsByStop(allTransforms.flat())

    // Calculate aggregate transform for each stop
    const transforms = yield* Effect.all(
      STOP_POSITIONS.map((position) =>
        calculateStopTransform(transformsByStop, position).pipe(
          Effect.mapError(
            (cause) =>
              new PatternExtractionError({
                message: `Failed to calculate transform for stop ${position}`,
                cause
              })
          )
        )
      )
    ).pipe(Effect.map((entries) => new Map(Arr.zip(STOP_POSITIONS, entries))))

    // Calculate confidence
    const confidence = palettes.length === 1
      ? DEFAULT_SINGLE_PALETTE_CONFIDENCE
      : calculateConfidence(transformsByStop)

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

// ============================================================================
// Transform Extraction Helpers
// ============================================================================

/**
 * Extract transforms for all stops in a single palette
 */
const extractPaletteTransforms = (
  palette: AnalyzedPalette,
  referenceStop: StopPosition
): Effect.Effect<
  ReadonlyArray<{ position: StopPosition; transform: StopTransform }>,
  PatternExtractionError
> =>
  Effect.gen(function*() {
    // Find reference color
    const referenceColor = palette.stops.find((s) => s.position === referenceStop)

    if (!referenceColor) {
      return yield* Effect.fail(
        new PatternExtractionError({
          message: `Failed to extract transforms: palette "${palette.name}" missing reference stop ${referenceStop}`
        })
      )
    }

    // Prevent division by zero
    const refL = Math.max(MIN_DIVISOR, referenceColor.color.l)
    const refC = Math.max(MIN_DIVISOR, referenceColor.color.c)

    // Calculate transforms for each stop
    return palette.stops.map((stop) => ({
      position: stop.position,
      transform: {
        lightnessMultiplier: stop.color.l / refL,
        chromaMultiplier: stop.color.c / refC,
        hueShiftDegrees: hueDifference(referenceColor.color.h, stop.color.h)
      }
    }))
  })

/**
 * Group transforms by stop position using immutable operations
 */
const groupTransformsByStop = (
  transforms: ReadonlyArray<{ position: StopPosition; transform: StopTransform }>
): ReadonlyMap<StopPosition, ReadonlyArray<StopTransform>> => {
  const groups = Arr.groupBy(transforms, (item) => String(item.position))

  return new Map(
    Object.entries(groups).map(([key, items]) => [
      Number(key) as StopPosition,
      items.map((item) => item.transform)
    ])
  )
}

/**
 * Calculate aggregate transform for a stop position from multiple samples
 */
const calculateStopTransform = (
  transformsByStop: ReadonlyMap<StopPosition, ReadonlyArray<StopTransform>>,
  position: StopPosition
): Effect.Effect<StopTransform, PatternExtractionError> =>
  Effect.gen(function*() {
    const transforms = transformsByStop.get(position)

    if (!transforms || transforms.length === 0) {
      return yield* Effect.fail(
        new PatternExtractionError({
          message: `Failed to calculate transform: no transforms found for stop ${position}`
        })
      )
    }

    // Extract values for each property
    const lightnessValues = transforms.map((t) => t.lightnessMultiplier)
    const chromaValues = transforms.map((t) => t.chromaMultiplier)
    const hueValues = transforms.map((t) => t.hueShiftDegrees)

    // Calculate medians
    const lightnessMedian = yield* median(lightnessValues).pipe(
      Effect.mapError(
        (cause) =>
          new PatternExtractionError({
            message: `Failed to calculate lightness median for stop ${position}`,
            cause
          })
      )
    )

    const chromaMedian = yield* median(chromaValues).pipe(
      Effect.mapError(
        (cause) =>
          new PatternExtractionError({
            message: `Failed to calculate chroma median for stop ${position}`,
            cause
          })
      )
    )

    const hueMedian = yield* median(hueValues).pipe(
      Effect.mapError(
        (cause) =>
          new PatternExtractionError({
            message: `Failed to calculate hue median for stop ${position}`,
            cause
          })
      )
    )

    return {
      lightnessMultiplier: lightnessMedian,
      chromaMultiplier: chromaMedian,
      hueShiftDegrees: hueMedian
    }
  })

// ============================================================================
// Statistical Utilities
// ============================================================================

/**
 * Calculate median of a non-empty array of numbers using functional composition
 */
const median = (
  values: ReadonlyArray<number>
): Effect.Effect<number, PatternExtractionError> =>
  Arr.match(values, {
    onEmpty: () =>
      Effect.fail(
        new PatternExtractionError({
          message: "Failed to calculate median: array is empty"
        })
      ),
    onNonEmpty: (nonEmpty) => {
      const sorted = Arr.sort(nonEmpty, Order.number)
      const mid = Math.floor(sorted.length / 2)

      return sorted.length % 2 === 0
        ? computeEvenMedian(sorted, mid)
        : computeOddMedian(sorted, mid)
    }
  })

/**
 * Compute median for even-length arrays (average of two middle elements)
 */
const computeEvenMedian = (
  sorted: ReadonlyArray<number>,
  mid: number
): Effect.Effect<number, PatternExtractionError> =>
  Option.zipWith(Arr.get(sorted, mid - 1), Arr.get(sorted, mid), (a, b) => (a + b) / 2).pipe(
    Option.match({
      onNone: () =>
        Effect.fail(
          new PatternExtractionError({
            message: "Failed to calculate median: array indexing failed"
          })
        ),
      onSome: Effect.succeed
    })
  )

/**
 * Compute median for odd-length arrays (middle element)
 */
const computeOddMedian = (
  sorted: ReadonlyArray<number>,
  mid: number
): Effect.Effect<number, PatternExtractionError> =>
  Option.match(Arr.get(sorted, mid), {
    onNone: () =>
      Effect.fail(
        new PatternExtractionError({
          message: "Failed to calculate median: array indexing failed"
        })
      ),
    onSome: (value) => Effect.succeed(value)
  })

/**
 * Calculate mean of an array of numbers
 */
const mean = (values: ReadonlyArray<number>): number =>
  Arr.match(values, {
    onEmpty: () => 0,
    onNonEmpty: (nonEmpty) => Arr.reduce(nonEmpty, 0, (sum, val) => sum + val) / nonEmpty.length
  })

/**
 * Calculate standard deviation
 */
const stdDev = (values: ReadonlyArray<number>): number =>
  Arr.match(values, {
    onEmpty: () => 0,
    onNonEmpty: (nonEmpty) => {
      const avg = mean(nonEmpty)
      const squareDiffs = Arr.map(nonEmpty, (value) => Math.pow(value - avg, 2))
      return Math.sqrt(mean(squareDiffs))
    }
  })

// ============================================================================
// Confidence Calculation
// ============================================================================

/**
 * Calculate confidence based on consistency across palettes
 *
 * Lower variance = higher confidence
 */
const calculateConfidence = (
  transformsByStop: ReadonlyMap<StopPosition, ReadonlyArray<StopTransform>>
): number => {
  const variances = STOP_POSITIONS.flatMap((position) => {
    const transforms = transformsByStop.get(position)
    if (!transforms || transforms.length < 2) return []

    const lightnessValues = transforms.map((t) => t.lightnessMultiplier)
    const chromaValues = transforms.map((t) => t.chromaMultiplier)

    return [stdDev(lightnessValues), stdDev(chromaValues)]
  })

  if (variances.length === 0) return DEFAULT_SINGLE_PALETTE_CONFIDENCE

  const avgVariance = mean(variances)

  // Map variance to confidence [0, 1]
  // Lower variance = higher confidence
  return Math.max(0, Math.min(1, 1 - avgVariance))
}
