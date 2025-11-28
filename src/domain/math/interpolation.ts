/**
 * Interpolation and smoothing utilities for color palette generation
 */

import { Array as Arr, Data, Either, Order } from "effect"
import type { StopTransform, TransformationPattern } from "../learning/pattern.js"
import type { StopPosition } from "../palette/palette.schema.js"
import { STOP_POSITIONS } from "../palette/palette.schema.js"
import { buildStopNumberMap, getStopNumber, getStopTransform, type StopTransformMap } from "../types/collections.js"

/**
 * Error when interpolation or smoothing operations fail
 */
export class InterpolationError extends Data.TaggedError("InterpolationError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ============================================================================
// Constants
// ============================================================================

/** Stop position constants */
const LIGHTEST_STOP = 100 satisfies StopPosition
const REFERENCE_STOP = 500 satisfies StopPosition
const DARKEST_STOP = 1000 satisfies StopPosition

/** Reference multiplier is always 1.0 (no change from reference) */
const REFERENCE_MULTIPLIER = 1.0

/** Range of stop positions for normalization */
const STOP_RANGE = DARKEST_STOP - LIGHTEST_STOP // 900

// ============================================================================
// Public API
// ============================================================================

/**
 * Smooth the transformation pattern to ensure:
 * - Lightness is perfectly linear
 * - Chroma follows a smooth curve
 * - Hue is consistent (median value)
 *
 * Returns Either.left if pattern data is malformed, Either.right with smoothed pattern otherwise.
 */
export const smoothPattern = (
  pattern: TransformationPattern
): Either.Either<TransformationPattern, InterpolationError> =>
  Either.all([
    calculateLinearLightness(pattern),
    smoothChromaCurve(pattern),
    calculateConsistentHue(pattern)
  ]).pipe(
    Either.mapLeft((cause) => new InterpolationError({ message: "Failed to smooth pattern", cause })),
    Either.flatMap(([lightnessMultipliers, chromaMultipliers, consistentHue]) =>
      buildTransformMapFromEithers(
        lightnessMultipliers,
        chromaMultipliers,
        consistentHue
      ).pipe(
        Either.mapLeft((cause) => new InterpolationError({ message: "Failed to build transform map", cause })),
        Either.map((transforms) => ({
          ...pattern,
          name: `${pattern.name}-smoothed`,
          transforms
        }))
      )
    )
  )

/**
 * Linear interpolation between two values
 */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/**
 * Clamp a value between min and max
 */
export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

// ============================================================================
// Pattern Smoothing Helpers
// ============================================================================

/**
 * Build a StopTransformMap by combining lightness, chroma, and hue values.
 *
 * Collects all Either results for each position and builds the map if all succeed.
 */
const buildTransformMapFromEithers = (
  lightnessMultipliers: ReadonlyMap<StopPosition, number>,
  chromaMultipliers: ReadonlyMap<StopPosition, number>,
  hueShiftDegrees: number
): Either.Either<StopTransformMap, InterpolationError> =>
  Either.all(
    STOP_POSITIONS.map((position) =>
      Either.all([
        getStopNumber(lightnessMultipliers, position),
        getStopNumber(chromaMultipliers, position)
      ]).pipe(
        Either.mapLeft((cause) =>
          new InterpolationError({ message: `Failed to get value at position ${position}`, cause })
        ),
        Either.map(([lightness, chroma]) => ({
          position,
          transform: {
            lightnessMultiplier: lightness,
            chromaMultiplier: chroma,
            hueShiftDegrees
          }
        }))
      )
    )
  ).pipe(
    Either.map((entries) => new Map(entries.map(({ position, transform }) => [position, transform])))
  )

/**
 * Calculate lightness multipliers using quadratic interpolation
 */
const calculateLinearLightness = (
  pattern: TransformationPattern
): Either.Either<ReadonlyMap<StopPosition, number>, InterpolationError> =>
  createQuadraticInterpolation(pattern, (t) => t.lightnessMultiplier).pipe(
    Either.mapLeft((cause) => new InterpolationError({ message: "Failed to calculate lightness multipliers", cause }))
  )

/**
 * Smooth chroma curve using quadratic interpolation
 */
const smoothChromaCurve = (
  pattern: TransformationPattern
): Either.Either<ReadonlyMap<StopPosition, number>, InterpolationError> =>
  createQuadraticInterpolation(pattern, (t) => t.chromaMultiplier).pipe(
    Either.mapLeft((cause) => new InterpolationError({ message: "Failed to smooth chroma curve", cause }))
  )

/**
 * Calculate consistent hue shift (median of all values)
 */
const calculateConsistentHue = (
  pattern: TransformationPattern
): Either.Either<number, InterpolationError> =>
  Either.all(
    STOP_POSITIONS.map((pos) =>
      Either.map(getStopTransform(pattern.transforms, pos), (t) => t.hueShiftDegrees).pipe(
        Either.mapLeft((cause) =>
          new InterpolationError({ message: `Failed to get hue shift at position ${pos}`, cause })
        )
      )
    )
  ).pipe(
    Either.flatMap((values) =>
      median(values).pipe(
        Either.mapLeft((cause) => new InterpolationError({ message: "Failed to calculate median hue", cause }))
      )
    )
  )

// ============================================================================
// Interpolation Utilities
// ============================================================================

/**
 * Property extractor type for StopTransform
 */
type TransformPropertyExtractor = (transform: StopTransform) => number

/**
 * Create a quadratic interpolation curve through three key points.
 *
 * Fits a parabola y = ax^2 + bx + c through:
 * - (LIGHTEST_STOP, value100)
 * - (REFERENCE_STOP, REFERENCE_MULTIPLIER) - reference point
 * - (DARKEST_STOP, value1000)
 *
 * Returns Either.left if any values are missing, Either.right with the interpolated map otherwise.
 *
 * @param extractProperty - Function to extract the relevant property from a transform
 */
const createQuadraticInterpolation = (
  pattern: TransformationPattern,
  extractProperty: TransformPropertyExtractor
): Either.Either<ReadonlyMap<StopPosition, number>, InterpolationError> =>
  Either.all([
    getStopTransform(pattern.transforms, LIGHTEST_STOP),
    getStopTransform(pattern.transforms, DARKEST_STOP)
  ]).pipe(
    Either.mapLeft((cause) => new InterpolationError({ message: "Failed to get endpoint transforms", cause })),
    Either.map(([transform100, transform1000]) => {
      const value100 = extractProperty(transform100)
      const value500 = REFERENCE_MULTIPLIER
      const value1000 = extractProperty(transform1000)

      // Fit quadratic curve y = ax^2 + bx + c through three points
      const c = value100
      const x_mid = normalizePosition(REFERENCE_STOP)

      const a = (value500 - c - value1000 * x_mid + c * x_mid) / (x_mid * x_mid - x_mid)
      const b = value1000 - c - a

      return buildStopNumberMap((position) => {
        const x = normalizePosition(position)
        return Math.max(0, a * x * x + b * x + c)
      })
    })
  )

/**
 * Normalize a stop position to [0, 1] range
 */
const normalizePosition = (position: StopPosition): number => (position - LIGHTEST_STOP) / STOP_RANGE

// ============================================================================
// Math Utilities
// ============================================================================

/**
 * Calculate median of a non-empty array of numbers using functional composition.
 */
const median = (values: ReadonlyArray<number>): Either.Either<number, InterpolationError> =>
  Arr.match(values, {
    onEmpty: () => Either.left(new InterpolationError({ message: "Failed to calculate median: array is empty" })),
    onNonEmpty: (nonEmpty) => {
      const sorted = Arr.sort(nonEmpty, Order.number)
      const mid = Math.floor(sorted.length / 2)

      return sorted.length % 2 === 0 ? computeEvenMedian(sorted, mid) : computeOddMedian(sorted, mid)
    }
  })

/**
 * Compute median for even-length arrays (average of two middle elements)
 */
const computeEvenMedian = (
  sorted: ReadonlyArray<number>,
  mid: number
): Either.Either<number, InterpolationError> =>
  Either.all([
    Either.fromOption(Arr.get(sorted, mid - 1), () =>
      new InterpolationError({ message: "Array indexing failed during median calculation" })),
    Either.fromOption(Arr.get(sorted, mid), () =>
      new InterpolationError({ message: "Array indexing failed during median calculation" }))
  ]).pipe(Either.map(([a, b]) =>
    (a + b) / 2
  ))

/**
 * Compute median for odd-length arrays (middle element)
 */
const computeOddMedian = (
  sorted: ReadonlyArray<number>,
  mid: number
): Either.Either<number, InterpolationError> =>
  Either.fromOption(
    Arr.get(sorted, mid),
    () => new InterpolationError({ message: "Array indexing failed during median calculation" })
  )
