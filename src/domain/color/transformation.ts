/**
 * Color transformation functions for applying optical appearance
 *
 * Transforms target colors by applying the lightness and chroma from a reference color
 * while preserving the target's hue. This creates colors with the same "optical appearance"
 * but in different hue ranges.
 */

import { Effect } from "effect"
import type { OKLCHColor } from "./color.schema.js"
import { clampToGamut, isDisplayable, normalizeHue } from "./conversions.js"
import { ColorConversionError, ColorTransformationError } from "./errors.js"

/**
 * Apply optical appearance from reference color to target color
 *
 * Takes the lightness and chroma from the reference color and applies them
 * to the target color's hue. This preserves the "look and feel" (brightness
 * and saturation) of the reference while changing the hue to match the target.
 *
 * @param reference - The color to take L and C from
 * @param target - The color to take H from
 * @returns Effect containing the transformed color or an error
 *
 * @example
 * ```typescript
 * // Apply blue's appearance to green's hue
 * const blue: OKLCHColor = { l: 0.57, c: 0.15, h: 259, alpha: 1 }
 * const green: OKLCHColor = { l: 0.62, c: 0.18, h: 140, alpha: 1 }
 * const transformed = yield* applyOpticalAppearance(blue, green)
 * // Result: { l: 0.57, c: 0.15, h: 140, alpha: 1 } - blue's L+C with green's H
 * ```
 */
export const applyOpticalAppearance = (
  reference: OKLCHColor,
  target: OKLCHColor
): Effect.Effect<OKLCHColor, ColorTransformationError | ColorConversionError> =>
  Effect.gen(function*() {
    // Create transformed color: reference L+C, target H
    const transformed: OKLCHColor = {
      l: reference.l,
      c: reference.c,
      h: normalizeHue(target.h),
      alpha: reference.alpha
    }

    // Handle achromatic reference (gray reference)
    // When reference has no chroma, we keep the target's hue but make it achromatic
    if (reference.c === 0) {
      return {
        l: reference.l,
        c: 0,
        h: normalizeHue(target.h), // Preserve hue even though chroma is 0
        alpha: reference.alpha
      }
    }

    // Handle achromatic target (gray target)
    // When target has no hue, we need to pick a reasonable default
    // In this case, preserve the reference's hue since target has no opinion
    if (target.c === 0 || isNaN(target.h)) {
      return {
        l: reference.l,
        c: reference.c,
        h: normalizeHue(reference.h),
        alpha: reference.alpha
      }
    }

    // Check if color is displayable in sRGB
    const displayable = yield* isDisplayable(transformed)

    if (displayable) {
      return transformed
    }

    // If not displayable, clamp to gamut by reducing chroma
    // This preserves hue but reduces saturation until the color fits in sRGB
    const clamped = yield* clampToGamut(transformed)

    // If clamping resulted in zero chroma, warn about potential hue loss
    if (clamped.c === 0 && transformed.c > 0) {
      return yield* Effect.fail(
        new ColorTransformationError({
          reference,
          target,
          reason: "Transformed color is out of gamut and clamping reduced chroma to 0, losing hue information"
        })
      )
    }

    return clamped
  })

/**
 * Check if a transformation is possible without significant quality loss
 *
 * Returns true if the transformation can be applied while maintaining
 * reasonable color fidelity. This checks for edge cases that would
 * result in poor transformations.
 *
 * @param reference - The reference color
 * @param target - The target color
 * @returns Effect containing true if transformation is viable
 */
export const isTransformationViable = (
  reference: OKLCHColor,
  target: OKLCHColor
): Effect.Effect<boolean, ColorTransformationError> =>
  Effect.gen(function*() {
    // Very dark reference colors (near black) may not transform well
    // because they have limited chroma range
    if (reference.l < 0.05) {
      return false
    }

    // Very light reference colors (near white) may not transform well
    // because they also have limited chroma range
    if (reference.l > 0.95) {
      return false
    }

    // If reference is achromatic and target is achromatic,
    // transformation is just a lightness copy (always viable)
    if (reference.c === 0 && target.c === 0) {
      return true
    }

    // Create a test transformation to check gamut
    const testTransform: OKLCHColor = {
      l: reference.l,
      c: reference.c,
      h: normalizeHue(target.h),
      alpha: reference.alpha
    }

    const displayable = yield* isDisplayable(testTransform)

    // If directly displayable, definitely viable
    if (displayable) {
      return true
    }

    // If not displayable, clamp and check how much chroma was lost
    const clampResult = yield* Effect.either(clampToGamut(testTransform))

    // If clamping failed, transformation is not viable
    if (clampResult._tag === "Left") {
      return false
    }

    const clamped = clampResult.right

    // If we lost more than 50% of chroma, transformation quality is questionable
    const chromaLoss = reference.c > 0 ? (reference.c - clamped.c) / reference.c : 0

    return chromaLoss < 0.5
  })
