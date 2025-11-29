/**
 * Type-safe collection utilities for stop-position-based data
 *
 * Provides utilities for building and accessing ReadonlyMap instances with
 * StopPosition keys, ensuring type safety without unsafe casting.
 */

import { Data, Effect } from "effect"
import type { StopPosition } from "../palette/palette.schema.js"
import { STOP_POSITIONS } from "../palette/palette.schema.js"
import type { StopTransform } from "../pattern/pattern.js"

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
 * Safely get transform from map
 */
export const getStopTransform = (
  map: StopTransformMap,
  position: StopPosition
): Effect.Effect<StopTransform, CollectionError> =>
  Effect.fromNullable(map.get(position)).pipe(
    Effect.mapError(() => new CollectionError({ message: `Missing stop position ${position} in transform map` }))
  )

/**
 * Safely get number from map
 */
export const getStopNumber = (
  map: StopNumberMap,
  position: StopPosition
): Effect.Effect<number, CollectionError> =>
  Effect.fromNullable(map.get(position)).pipe(
    Effect.mapError(() => new CollectionError({ message: `Missing stop position ${position} in number map` }))
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

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Build ReadonlyMap from all stop positions using builder function
 */
export const buildStopMap = <V>(
  fn: (position: StopPosition) => V
): ReadonlyMap<StopPosition, V> => new Map(STOP_POSITIONS.map((position) => [position, fn(position)]))
