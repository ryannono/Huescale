/**
 * Simultaneous Contrast Compensation via CIECAM02
 *
 * When the same color is placed on different backgrounds, simultaneous contrast
 * causes it to appear different. This module computes the precise color adjustment
 * needed so that a color appears identical on a target background as it did on
 * the source background.
 *
 * Approach: forward-transform the color under source viewing conditions to get
 * appearance correlates (J, C, h), then inverse-transform those same correlates
 * under target viewing conditions to recover the adjusted XYZ/sRGB color.
 */

import * as culori from "culori"
import { Data, Effect } from "effect"
import type { OKLCHColor } from "./color.schema.js"
import { clampToGamut } from "./color.js"
import {
  CIECAM02Error,
  D65_WHITE_POINT,
  forward,
  inverse,
  makeViewingConditions,
  type XYZ
} from "./ciecam02.js"

// ============================================================================
// Errors
// ============================================================================

/** Error when contrast compensation fails */
export class ContrastCompensationError extends Data.TaggedError("ContrastCompensationError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ============================================================================
// Constants
// ============================================================================

/**
 * Adapting field luminance for typical screen viewing (cd/m²).
 * Standard assumption: Lw/5 where Lw ≈ 320 cd/m² for modern displays.
 */
const SCREEN_ADAPTING_LUMINANCE = 64

// ============================================================================
// Public API
// ============================================================================

/**
 * Compensate a color for simultaneous contrast when moving between backgrounds.
 *
 * Given a color designed for `sourceBg`, computes the adjusted color that
 * will appear identical when placed on `targetBg`.
 *
 * @param color - The foreground color to compensate
 * @param sourceBg - The background the color was originally designed for
 * @param targetBg - The background the color will be displayed on
 * @returns The compensated OKLCH color, gamut-clamped to sRGB
 */
export const compensateForBackground = (
  color: OKLCHColor,
  sourceBg: OKLCHColor,
  targetBg: OKLCHColor
): Effect.Effect<OKLCHColor, ContrastCompensationError | CIECAM02Error> =>
  Effect.gen(function* () {
    // Convert all colors to XYZ65 via culori
    const colorXyz = oklchToXyz65(color)
    const sourceBgXyz = oklchToXyz65(sourceBg)
    const targetBgXyz = oklchToXyz65(targetBg)

    // Compute relative background luminance (Yb) for each background
    // Yb = Y_background / Y_white × 100 — the Y component of XYZ is already
    // relative luminance scaled to 0-100 when using D65 white (Y=100)
    const sourceYb = sourceBgXyz.Y
    const targetYb = targetBgXyz.Y

    // Build viewing conditions for source and target backgrounds
    const sourceConditions = yield* makeViewingConditions(
      SCREEN_ADAPTING_LUMINANCE,
      sourceYb,
      D65_WHITE_POINT
    )
    const targetConditions = yield* makeViewingConditions(
      SCREEN_ADAPTING_LUMINANCE,
      targetYb,
      D65_WHITE_POINT
    )

    // Forward: color under source conditions → appearance correlates
    const appearance = yield* forward(colorXyz, D65_WHITE_POINT, sourceConditions)

    // Inverse: same appearance under target conditions → new XYZ
    const compensatedXyz = yield* inverse(
      { J: appearance.J, C: appearance.C, h: appearance.h },
      D65_WHITE_POINT,
      targetConditions
    )

    // Convert compensated XYZ back to OKLCH via culori
    const compensatedOklch = xyz65ToOklch(compensatedXyz)

    // Gamut clamp to ensure displayability
    return yield* clampToGamut(compensatedOklch).pipe(
      Effect.mapError((cause) =>
        new ContrastCompensationError({
          message: "Failed to gamut-clamp compensated color",
          cause
        })
      )
    )
  })

/**
 * Compensate a batch of colors for simultaneous contrast.
 *
 * @param colors - Array of foreground colors to compensate
 * @param sourceBg - The background colors were designed for
 * @param targetBg - The background colors will be displayed on
 * @returns Array of compensated OKLCH colors
 */
export const compensateBatch = (
  colors: ReadonlyArray<OKLCHColor>,
  sourceBg: OKLCHColor,
  targetBg: OKLCHColor
): Effect.Effect<ReadonlyArray<OKLCHColor>, ContrastCompensationError | CIECAM02Error> =>
  Effect.forEach(colors, (color) => compensateForBackground(color, sourceBg, targetBg))

// ============================================================================
// Color Space Conversion Helpers
// ============================================================================

/**
 * Convert OKLCH color to CIE XYZ (D65, 0-100 scale).
 * Uses culori for the OKLCH → XYZ65 conversion.
 */
const oklchToXyz65 = (color: OKLCHColor): XYZ => {
  const culoriOklch: culori.Oklch = {
    mode: "oklch",
    l: color.l,
    c: color.c,
    h: color.h,
    alpha: color.alpha
  }
  const xyz = culori.xyz65(culoriOklch)
  // Culori xyz65 uses 0-1 scale, CIECAM02 expects 0-100
  return {
    X: (xyz?.x ?? 0) * 100,
    Y: (xyz?.y ?? 0) * 100,
    Z: (xyz?.z ?? 0) * 100
  }
}

/**
 * Convert CIE XYZ (D65, 0-100 scale) back to OKLCH.
 * Uses culori for the XYZ65 → OKLCH conversion.
 */
const xyz65ToOklch = (xyz: XYZ): OKLCHColor => {
  // Culori xyz65 uses 0-1 scale
  const culoriXyz: culori.Xyz65 = {
    mode: "xyz65",
    x: xyz.X / 100,
    y: xyz.Y / 100,
    z: xyz.Z / 100
  }
  const oklch = culori.oklch(culoriXyz)
  return {
    l: Math.max(0, Math.min(1, oklch?.l ?? 0)),
    c: Math.max(0, oklch?.c ?? 0),
    h: oklch?.h ?? 0,
    alpha: oklch?.alpha ?? 1
  }
}
