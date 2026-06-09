/**
 * Helmholtz-Kohlrausch Lightness Compensation (Nayatani Model)
 *
 * Saturated colors appear perceptually brighter than their lightness alone predicts.
 * This is the Helmholtz-Kohlrausch (H-K) effect. When generating a low-chroma palette
 * matched to a high-chroma palette at the same OKLCH lightness, the perceived brightness
 * will differ because each color's chromatic contribution is different.
 *
 * This module implements the Nayatani model to compute lightness corrections:
 *   L_corrected = L_ref × (1 + q(θ_ref) × S_ref) / (1 + q(θ_target) × S_target)
 *
 * Where:
 * - q(θ) is a Fourier-series hue-dependent weight (peaks at blue/red)
 * - S_uv = 13 × √((u' - u'n)² + (v' - v'n)²) is CIE 1976 UCS saturation
 * - θ = atan2(v' - v'n, u' - u'n) is hue angle in u'v' space
 * - u'n, v'n are D65 white point chromaticity coordinates
 *
 * Reference: Nayatani, Y. (1997). "Simple estimation methods for the
 * Helmholtz-Kohlrausch effect"
 */

import * as culori from "culori"
import { Data, Effect } from "effect"
import { clamp } from "./color.js"
import type { OKLCHColor } from "./color.schema.js"

// ============================================================================
// Errors
// ============================================================================

/** Error when H-K compensation fails */
export class HelmholtzKohlrauschError extends Data.TaggedError(
  "HelmholtzKohlrauschError"
)<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ============================================================================
// Types
// ============================================================================

/** CIE 1976 u'v' chromaticity coordinates */
interface UVPrime {
  readonly u: number
  readonly v: number
}

/** H-K correction factor with diagnostic values */
export interface HKCorrectionFactor {
  readonly factor: number
  readonly saturationUV: number
  readonly hueAngleUV: number
}

// ============================================================================
// Constants
// ============================================================================

/** Degrees-to-radians conversion factor */
const DEG_TO_RAD = Math.PI / 180

/** Radians-to-degrees conversion factor */
const RAD_TO_DEG = 180 / Math.PI

/**
 * D65 white point chromaticity in CIE 1976 u'v' space.
 * Derived from D65 XYZ (0.95047, 1.0, 1.08883) via the u'v' formulas.
 */
const D65_U_PRIME = 0.1978
const D65_V_PRIME = 0.4683

/**
 * Nayatani Fourier coefficients for q(θ).
 * q(θ) = -0.01585 - 0.03017 cos(θ) - 0.04556 cos(2θ)
 *         - 0.02677 cos(3θ) - 0.00295 cos(4θ)
 *         + 0.14592 sin(θ) + 0.05084 sin(2θ)
 *         - 0.01900 sin(3θ) - 0.00764 sin(4θ)
 */
const Q_A0 = -0.01585
const Q_COS_COEFFS = [-0.03017, -0.04556, -0.02677, -0.00295] as const
const Q_SIN_COEFFS = [0.14592, 0.05084, -0.019, -0.00764] as const

/**
 * Multiplier in CIE 1976 UCS saturation formula.
 * S_uv = 13 × √((u' - u'n)² + (v' - v'n)²)
 */
const SATURATION_MULTIPLIER = 13

// ============================================================================
// Public API
// ============================================================================

/**
 * Calculate the Helmholtz-Kohlrausch correction factor for a color.
 *
 * The factor represents how much additional perceived brightness the color
 * has due to its chromaticity. Higher saturation and hue angles near blue/red
 * produce larger factors.
 */
export const calculateHKFactor = (
  color: OKLCHColor
): Effect.Effect<HKCorrectionFactor, HelmholtzKohlrauschError> =>
  Effect.gen(function*() {
    const uv = yield* oklchToUVPrime(color)
    const saturationUV = calculateSaturationUV(uv)
    const hueAngleUV = calculateHueAngleUV(uv)
    const qTheta = calculateQTheta(hueAngleUV)
    const factor = 1 + qTheta * saturationUV
    return { factor, saturationUV, hueAngleUV }
  })

/**
 * Compensate a target color's lightness so its perceived brightness
 * matches the reference color.
 *
 * Perceived brightness includes both lightness and chromatic contribution:
 *   B_perceived ≈ L × (1 + q(θ) × S)
 *
 * To match perceived brightness, solve for L_target:
 *   L_ref × (1 + q(θ_ref) × S_ref) = L_target × (1 + q(θ_target) × S_target)
 *   L_target = L_ref × (1 + q(θ_ref) × S_ref) / (1 + q(θ_target) × S_target)
 *
 * When the reference is highly chromatic (large S_ref) and the target is
 * near-achromatic (small S_target), the numerator > denominator, so L_target
 * increases — the target must be lightened because it lacks the chromatic
 * brightness contribution of the reference.
 *
 * Conversely, when compensating a gray palette to appear as dark as a
 * chromatic reference, the target should be darkened. This function always
 * solves for equal perceived brightness — the direction depends on which
 * color has more chromatic contribution.
 */
export const compensateLightness = (
  reference: OKLCHColor,
  target: OKLCHColor
): Effect.Effect<OKLCHColor, HelmholtzKohlrauschError> =>
  Effect.gen(function*() {
    const refFactor = yield* calculateHKFactor(reference)
    const targetFactor = yield* calculateHKFactor(target)

    // Guard against division by zero (shouldn't happen with valid colors)
    if (targetFactor.factor === 0) {
      return yield* Effect.fail(
        new HelmholtzKohlrauschError({
          message: "Target H-K factor is zero — cannot compensate"
        })
      )
    }

    const correctedL = clamp(
      (reference.l * refFactor.factor) / targetFactor.factor,
      0,
      1
    )

    return {
      l: correctedL,
      c: target.c,
      h: target.h,
      alpha: target.alpha
    }
  })

// ============================================================================
// Color Space Conversion Helpers
// ============================================================================

/**
 * Convert OKLCH color to CIE 1976 u'v' chromaticity coordinates.
 *
 * Pipeline: OKLCH → (culori) → XYZ65 → u'v'
 *
 * CIE 1976 u'v' from XYZ:
 *   u' = 4X / (X + 15Y + 3Z)
 *   v' = 9Y / (X + 15Y + 3Z)
 */
const oklchToUVPrime = (
  color: OKLCHColor
): Effect.Effect<UVPrime, HelmholtzKohlrauschError> =>
  Effect.gen(function*() {
    const culoriOklch: culori.Oklch = {
      mode: "oklch",
      l: color.l,
      c: color.c,
      h: color.h,
      alpha: color.alpha
    }

    const xyz = culori.xyz65(culoriOklch)
    if (xyz === undefined) {
      return yield* Effect.fail(
        new HelmholtzKohlrauschError({
          message: `Could not convert OKLCH to XYZ65: l=${color.l}, c=${color.c}, h=${color.h}`
        })
      )
    }

    // culori xyz65 uses 0-1 scale
    const X = xyz.x ?? 0
    const Y = xyz.y ?? 0
    const Z = xyz.z ?? 0

    const denominator = X + 15 * Y + 3 * Z
    if (denominator === 0) {
      // Pure black — return white point chromaticity (no chromatic contribution)
      return { u: D65_U_PRIME, v: D65_V_PRIME }
    }

    return {
      u: (4 * X) / denominator,
      v: (9 * Y) / denominator
    }
  })

// ============================================================================
// Pure Math Helpers
// ============================================================================

/**
 * CIE 1976 UCS saturation.
 * S_uv = 13 × √((u' - u'n)² + (v' - v'n)²)
 */
const calculateSaturationUV = (uv: UVPrime): number => {
  const du = uv.u - D65_U_PRIME
  const dv = uv.v - D65_V_PRIME
  return SATURATION_MULTIPLIER * Math.sqrt(du * du + dv * dv)
}

/**
 * Hue angle in CIE 1976 u'v' space (degrees).
 * θ = atan2(v' - v'n, u' - u'n), mapped to [0, 360).
 */
const calculateHueAngleUV = (uv: UVPrime): number => {
  const du = uv.u - D65_U_PRIME
  const dv = uv.v - D65_V_PRIME
  const angleDeg = Math.atan2(dv, du) * RAD_TO_DEG
  return angleDeg < 0 ? angleDeg + 360 : angleDeg
}

/**
 * Nayatani q(θ) function — Fourier series hue-dependent weight.
 *
 * q(θ) = -0.01585 - 0.03017 cos(θ) - 0.04556 cos(2θ)
 *         - 0.02677 cos(3θ) - 0.00295 cos(4θ)
 *         + 0.14592 sin(θ) + 0.05084 sin(2θ)
 *         - 0.01900 sin(3θ) - 0.00764 sin(4θ)
 *
 * Peaks near blue (~270°) and red (~0°/360°), lowest near yellow (~90°).
 */
const calculateQTheta = (hueAngleDeg: number): number => {
  const thetaRad = hueAngleDeg * DEG_TO_RAD
  let q = Q_A0
  for (let i = 0; i < Q_COS_COEFFS.length; i++) {
    const harmonic = (i + 1) * thetaRad
    q += Q_COS_COEFFS[i] * Math.cos(harmonic)
    q += Q_SIN_COEFFS[i] * Math.sin(harmonic)
  }
  return q
}
