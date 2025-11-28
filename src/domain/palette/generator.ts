/**
 * Core palette generation logic
 *
 * Applies transformation patterns to generate complete color palettes
 */

import { Data, Effect } from "effect"
import type { ParseError } from "effect/ParseResult"
import { OKLCHColor } from "../color/color.schema.js"
import { clamp, clampToGamut, isDisplayable, normalizeHue } from "../color/conversions.js"
import { ColorConversionError } from "../color/errors.js"
import type { StopTransform, TransformationPattern } from "../learning/pattern.js"
import { getStopTransformEffect } from "../types/collections.js"
import { Palette, type StopPosition } from "./palette.schema.js"
import { STOP_POSITIONS } from "./palette.schema.js"

// ============================================================================
// Constants
// ============================================================================

/** Default name for generated palettes */
const DEFAULT_PALETTE_NAME = "generated"

// ============================================================================
// Errors
// ============================================================================

/**
 * Error when palette generation fails
 */
export class PaletteGenerationError extends Data.TaggedError("PaletteGenerationError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate complete palette from a single anchor color
 *
 * Strategy:
 * 1. Take input color as anchor at specified stop
 * 2. Apply transformation pattern to generate all other stops
 * 3. Clamp to displayable gamut as needed
 */
export const generatePaletteFromStop = (
  anchorColor: OKLCHColor,
  anchorStop: StopPosition,
  pattern: TransformationPattern,
  paletteName: string = DEFAULT_PALETTE_NAME
): Effect.Effect<Palette, PaletteGenerationError | ColorConversionError | ParseError> =>
  Effect.gen(function*() {
    // Get anchor transform
    const anchorTransform = yield* getStopTransformEffect(pattern.transforms, anchorStop).pipe(
      Effect.mapError(
        (cause) =>
          new PaletteGenerationError({
            message: `Failed to get transform for anchor stop ${anchorStop}`,
            cause
          })
      )
    )

    // Generate all stops
    const stops = yield* Effect.forEach(
      STOP_POSITIONS,
      (targetStop) =>
        Effect.gen(function*() {
          const targetTransform = yield* getStopTransformEffect(pattern.transforms, targetStop).pipe(
            Effect.mapError(
              (cause) =>
                new PaletteGenerationError({
                  message: `Failed to get transform for target stop ${targetStop}`,
                  cause
                })
            )
          )

          // Calculate and apply transforms
          const relative = computeRelativeTransform(targetTransform, anchorTransform)
          const transformedColor = applyRelativeTransform(anchorColor, relative)

          // Ensure displayable
          const finalColor = yield* ensureDisplayable(transformedColor)

          return {
            position: targetStop,
            color: finalColor
          }
        }),
      { concurrency: "unbounded" }
    )

    // Sort by position (immutable)
    const sortedStops = [...stops].sort((a, b) => a.position - b.position)

    return yield* Palette({
      name: paletteName,
      stops: sortedStops
    })
  })

// ============================================================================
// Transform Helpers
// ============================================================================

/**
 * Relative transform ratios
 */
interface RelativeTransform {
  readonly lightnessRatio: number
  readonly chromaRatio: number
  readonly hueDelta: number
}

/**
 * Compute relative transform ratios between target and anchor
 */
const computeRelativeTransform = (
  target: StopTransform,
  anchor: StopTransform
): RelativeTransform => ({
  lightnessRatio: target.lightnessMultiplier / anchor.lightnessMultiplier,
  chromaRatio: target.chromaMultiplier / anchor.chromaMultiplier,
  hueDelta: target.hueShiftDegrees - anchor.hueShiftDegrees
})

/**
 * Apply relative transform to color
 */
const applyRelativeTransform = (color: OKLCHColor, transform: RelativeTransform): OKLCHColor => ({
  l: clamp(color.l * transform.lightnessRatio, 0, 1),
  c: Math.max(0, color.c * transform.chromaRatio),
  h: normalizeHue(color.h + transform.hueDelta),
  alpha: color.alpha
})

/**
 * Ensure color is displayable, clamping to gamut if needed
 */
const ensureDisplayable = (
  color: OKLCHColor
): Effect.Effect<OKLCHColor, ColorConversionError> =>
  isDisplayable(color).pipe(
    Effect.flatMap((displayable) => (displayable ? Effect.succeed(color) : clampToGamut(color)))
  )
