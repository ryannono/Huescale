/**
 * Interpolation and smoothing utilities for color palette generation
 */

import { Array as Arr, Data, Effect, Order } from "effect"
import type { StopPosition } from "../palette/palette.schema.js"
import { STOP_POSITIONS } from "../palette/palette.schema.js"
import type { StopTransform, TransformationPattern } from "../pattern/pattern.js"
import {
  buildStopNumberMap,
  CollectionError,
  getStopNumber,
  getStopTransform,
  type StopTransformMap
} from "../types/collections.js"

// ============================================================================
// Errors
// ============================================================================

/** Error when interpolation or smoothing operations fail */
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
 */
export const smoothPattern = (
  pattern: TransformationPattern
): Effect.Effect<TransformationPattern, InterpolationError> =>
  Effect.gen(function*() {
    const [lightnessMultipliers, chromaMultipliers, consistentHue] = yield* Effect.all([
      calculateLinearLightness(pattern),
      smoothChromaCurve(pattern),
      calculateConsistentHue(pattern)
    ]).pipe(
      Effect.mapError((cause) => new InterpolationError({ message: "Failed to smooth pattern", cause }))
    )

    const transforms = yield* buildTransformMap(
      lightnessMultipliers,
      chromaMultipliers,
      consistentHue
    ).pipe(
      Effect.mapError((cause) => new InterpolationError({ message: "Failed to build transform map", cause }))
    )

    return {
      ...pattern,
      name: `${pattern.name}-smoothed`,
      transforms
    }
  })

/** Linear interpolation between two values */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Clamp a value between min and max */
export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

// ============================================================================
// Pattern Smoothing Helpers
// ============================================================================

/** Build a StopTransformMap by combining lightness, chroma, and hue values */
const buildTransformMap = (
  lightnessMultipliers: ReadonlyMap<StopPosition, number>,
  chromaMultipliers: ReadonlyMap<StopPosition, number>,
  hueShiftDegrees: number
): Effect.Effect<StopTransformMap, InterpolationError | CollectionError> =>
  Effect.all(
    STOP_POSITIONS.map((position) =>
      Effect.all([
        getStopNumber(lightnessMultipliers, position),
        getStopNumber(chromaMultipliers, position)
      ]).pipe(
        Effect.map(([lightness, chroma]) => ({
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
    Effect.map((entries) => new Map(entries.map(({ position, transform }) => [position, transform])))
  )

/** Calculate lightness multipliers using quadratic interpolation */
const calculateLinearLightness = (
  pattern: TransformationPattern
): Effect.Effect<ReadonlyMap<StopPosition, number>, InterpolationError | CollectionError> =>
  createQuadraticInterpolation(pattern, (t) => t.lightnessMultiplier)

/** Smooth chroma curve using quadratic interpolation */
const smoothChromaCurve = (
  pattern: TransformationPattern
): Effect.Effect<ReadonlyMap<StopPosition, number>, InterpolationError | CollectionError> =>
  createQuadraticInterpolation(pattern, (t) => t.chromaMultiplier)

/** Calculate consistent hue shift using median of all values */
const calculateConsistentHue = (
  pattern: TransformationPattern
): Effect.Effect<number, InterpolationError | CollectionError> =>
  Effect.all(
    STOP_POSITIONS.map((pos) =>
      getStopTransform(pattern.transforms, pos).pipe(
        Effect.map((t) => t.hueShiftDegrees)
      )
    )
  ).pipe(
    Effect.flatMap(median)
  )

// ============================================================================
// Interpolation Utilities
// ============================================================================

/** Property extractor type for StopTransform */
type TransformPropertyExtractor = (transform: StopTransform) => number

/** Create a quadratic interpolation curve through three key points (100, 500, 1000) */
const createQuadraticInterpolation = (
  pattern: TransformationPattern,
  extractProperty: TransformPropertyExtractor
): Effect.Effect<ReadonlyMap<StopPosition, number>, CollectionError> =>
  Effect.all([
    getStopTransform(pattern.transforms, LIGHTEST_STOP),
    getStopTransform(pattern.transforms, DARKEST_STOP)
  ]).pipe(
    Effect.map(([transform100, transform1000]) => {
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

/** Normalize a stop position to [0, 1] range */
const normalizePosition = (position: StopPosition): number => (position - LIGHTEST_STOP) / STOP_RANGE

// ============================================================================
// Math Utilities
// ============================================================================

/** Calculate median of a non-empty array of numbers using functional composition */
const median = (values: ReadonlyArray<number>): Effect.Effect<number, InterpolationError> =>
  Arr.match(values, {
    onEmpty: () => Effect.fail(new InterpolationError({ message: "Failed to calculate median: array is empty" })),
    onNonEmpty: (nonEmpty) => {
      const sorted = Arr.sort(nonEmpty, Order.number)
      const mid = Math.floor(sorted.length / 2)

      return sorted.length % 2 === 0 ? computeEvenMedian(sorted, mid) : computeOddMedian(sorted, mid)
    }
  })

/** Compute median for even-length arrays using average of two middle elements */
const computeEvenMedian = (
  sorted: ReadonlyArray<number>,
  mid: number
): Effect.Effect<number, InterpolationError> =>
  Effect.all([
    Arr.get(sorted, mid - 1),
    Arr.get(sorted, mid)
  ]).pipe(
    Effect.mapError(() => new InterpolationError({ message: "Array indexing failed during median calculation" })),
    Effect.map(([a, b]) => (a + b) / 2)
  )

/** Compute median for odd-length arrays using middle element */
const computeOddMedian = (
  sorted: ReadonlyArray<number>,
  mid: number
): Effect.Effect<number, InterpolationError> =>
  Arr.get(sorted, mid).pipe(
    Effect.mapError(() => new InterpolationError({ message: "Array indexing failed during median calculation" }))
  )
