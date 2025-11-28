/**
 * Type-safe collection utilities for stop-position-based data
 *
 * Provides utilities for building and converting ReadonlyMap instances
 * without unsafe type casting.
 */

import { Data, Effect, Either } from "effect"
import type { StopPosition } from "../../schemas/palette.js"
import { STOP_POSITIONS } from "../../schemas/palette.js"
import type { StopTransform } from "../learning/pattern.js"

// ============================================================================
// Types
// ============================================================================

/**
 * Type alias for Map of stop positions to transforms
 */
export type StopTransformMap = ReadonlyMap<StopPosition, StopTransform>

/**
 * Type alias for Map of stop positions to numbers
 */
export type StopNumberMap = ReadonlyMap<StopPosition, number>

// ============================================================================
// Errors
// ============================================================================

/**
 * Error when collection operations fail
 */
export class CollectionError extends Data.TaggedError("CollectionError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ============================================================================
// Public API - Map Accessors
// ============================================================================

/**
 * Safely get transform from map, returns Either
 */
export const getStopTransform = (
  map: StopTransformMap,
  position: StopPosition
): Either.Either<StopTransform, CollectionError> =>
  Either.fromNullable(
    map.get(position),
    () => new CollectionError({ message: `Missing stop position ${position} in transform map` })
  )

/**
 * Safely get number from map, returns Either
 */
export const getStopNumber = (
  map: StopNumberMap,
  position: StopPosition
): Either.Either<number, CollectionError> =>
  Either.fromNullable(
    map.get(position),
    () => new CollectionError({ message: `Missing stop position ${position} in number map` })
  )

/**
 * Safely get transform from map, returns Effect
 */
export const getStopTransformEffect = (
  map: StopTransformMap,
  position: StopPosition
): Effect.Effect<StopTransform, CollectionError> =>
  getStopTransform(map, position).pipe(
    Either.match({
      onLeft: Effect.fail,
      onRight: Effect.succeed
    })
  )

/**
 * Safely get number from map, returns Effect
 */
export const getStopNumberEffect = (
  map: StopNumberMap,
  position: StopPosition
): Effect.Effect<number, CollectionError> =>
  getStopNumber(map, position).pipe(
    Either.match({
      onLeft: Effect.fail,
      onRight: Effect.succeed
    })
  )

// ============================================================================
// Public API - Map Builders
// ============================================================================

/**
 * Build map of stop positions to numbers
 */
export const buildStopNumberMap = (
  fn: (position: StopPosition) => number
): StopNumberMap => buildStopMap(fn)

/**
 * Build map of stop positions to transforms
 */
export const buildStopTransformMap = (
  fn: (position: StopPosition) => StopTransform
): StopTransformMap => buildStopMap(fn)

// ============================================================================
// Public API - Map Operations
// ============================================================================

/**
 * Transform map values while preserving keys (functor map)
 */
export const mapStopMap = <A, B>(
  stopMap: ReadonlyMap<StopPosition, A>,
  fn: (value: A, position: StopPosition) => B
): ReadonlyMap<StopPosition, B> =>
  new Map(
    Array.from(stopMap.entries()).map(([position, value]) => [position, fn(value, position)])
  )

// ============================================================================
// Public API - Serialization
// ============================================================================

/**
 * Convert ReadonlyMap to Record for JSON serialization
 */
export const mapToRecord = <K extends PropertyKey, V>(map: ReadonlyMap<K, V>): Record<K, V> => {
  const entries = Array.from(map.entries())
  return entries.reduce<Record<K, V>>(
    (acc, [key, value]) => ({ ...acc, [key]: value }),
    {} as Record<K, V>
  )
}

/**
 * Convert Record to ReadonlyMap
 *
 * Caller must ensure all keys exist with non-undefined values.
 */
export const recordToMap = <K extends PropertyKey, V>(
  record: Record<K, V>,
  keys: ReadonlyArray<K>
): ReadonlyMap<K, V> => new Map(keys.map((key) => [key, record[key]]))

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Build ReadonlyMap from all stop positions using builder function
 */
export const buildStopMap = <V>(
  fn: (position: StopPosition) => V
): ReadonlyMap<StopPosition, V> => new Map(STOP_POSITIONS.map((position) => [position, fn(position)]))
