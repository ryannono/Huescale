/**
 * Core palette generation logic
 *
 * Applies transformation patterns to generate complete color palettes
 */

import { Effect } from "effect"
import type { ParseError } from "effect/ParseResult"
import { OKLCHColor } from "../../schemas/color.js"
import { Palette, type StopPosition } from "../../schemas/palette.js"
import { STOP_POSITIONS } from "../../schemas/palette.js"
import { clamp, clampToGamut, isDisplayable, normalizeHue } from "../color/conversions.js"
import { ColorConversionError } from "../color/errors.js"
import type { TransformationPattern } from "../learning/pattern.js"

/**
 * Generate a complete palette from a single color at a specific stop position
 *
 * Strategy:
 * 1. Take the input color as the anchor at the specified stop
 * 2. Apply the transformation pattern to generate all other stops
 * 3. Clamp to displayable gamut as needed
 */
export const generatePaletteFromStop = (
  anchorColor: OKLCHColor,
  anchorStop: StopPosition,
  pattern: TransformationPattern,
  paletteName: string = "generated"
): Effect.Effect<Palette, ColorConversionError | ParseError> =>
  Effect.gen(function*() {
    // Get the transform for the anchor stop
    const anchorTransform = pattern.transforms[anchorStop]

    // Generate all stops by applying relative transforms
    const stops = yield* Effect.forEach(
      STOP_POSITIONS,
      (targetStop) =>
        Effect.gen(function*() {
          const targetTransform = pattern.transforms[targetStop]

          // Calculate relative multipliers
          // If anchor is at 400 (L×1.182) and we want 100 (L×1.727):
          // relative = 1.727 / 1.182 = 1.461
          const relativeLightness = targetTransform.lightnessMultiplier / anchorTransform.lightnessMultiplier
          const relativeChroma = targetTransform.chromaMultiplier / anchorTransform.chromaMultiplier
          const relativeHue = targetTransform.hueShiftDegrees - anchorTransform.hueShiftDegrees

          // Apply transforms
          const transformedL = clamp(anchorColor.l * relativeLightness, 0, 1)
          const transformedC = Math.max(0, anchorColor.c * relativeChroma)

          const transformedColor: OKLCHColor = {
            l: transformedL,
            c: transformedC,
            h: normalizeHue(anchorColor.h + relativeHue),
            alpha: anchorColor.alpha
          }

          // Check if displayable, clamp if needed
          const displayable = yield* isDisplayable(transformedColor)

          const finalColor = displayable ? transformedColor : yield* clampToGamut(transformedColor)

          return {
            position: targetStop,
            color: finalColor
          }
        }),
      { concurrency: "unbounded" }
    )

    // Sort by position and validate we have exactly 10 stops
    const sortedStops = stops.sort((a, b) => a.position - b.position)

    if (sortedStops.length !== 10) {
      return yield* Effect.fail(
        new ColorConversionError({
          fromSpace: "oklch",
          toSpace: "palette",
          color: anchorColor,
          reason: `Expected 10 stops, got ${sortedStops.length}`
        })
      )
    }

    return yield* Palette({
      name: paletteName,
      stops: sortedStops
    })
  })
