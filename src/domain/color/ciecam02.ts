/**
 * CIECAM02 Color Appearance Model
 *
 * Full forward and inverse transforms for the CIE 2002 color appearance model.
 * Models how colors appear under different viewing conditions (adapting luminance,
 * background luminance, surround). Culori provides XYZ65 ↔ sRGB; this module
 * implements the appearance model on top of XYZ tristimulus values.
 *
 * Reference: CIE 159:2004, "A colour appearance model for colour management systems"
 */

import { Array as Arr, Data, Effect, pipe } from "effect"

// ============================================================================
// Errors
// ============================================================================

/** Error when CIECAM02 model computation fails */
export class CIECAM02Error extends Data.TaggedError("CIECAM02Error")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ============================================================================
// Constants
// ============================================================================

/**
 * CAT02 sharpened cone response matrix (Hunt-Pointer-Estévez derived).
 * Transforms CIE XYZ to sharpened RGB cone responses for chromatic adaptation.
 */
const M_CAT02: Matrix3x3 = [
  [0.7328, 0.4296, -0.1624],
  [-0.7036, 1.6975, 0.0061],
  [0.0030, 0.0136, 0.9834]
]

/** Inverse of M_CAT02 — transforms sharpened cone responses back to XYZ */
const M_CAT02_INV: Matrix3x3 = [
  [1.096124, -0.278869, 0.182745],
  [0.454369, 0.473533, 0.072098],
  [-0.009628, -0.005698, 1.015326]
]

/**
 * Hunt-Pointer-Estévez matrix — transforms sharpened cone responses
 * to physiological cone responses for nonlinear compression.
 */
const M_HPE: Matrix3x3 = [
  [0.38971, 0.68898, -0.07868],
  [-0.22981, 1.18340, 0.04641],
  [0.00000, 0.00000, 1.00000]
]

/** Inverse of Hunt-Pointer-Estévez matrix */
const M_HPE_INV: Matrix3x3 = [
  [1.910197, -1.112124, 0.201908],
  [0.370950, 0.629054, -0.000008],
  [0.000000, 0.000000, 1.000000]
]

/** Surround conditions for average surround (normal screen viewing) */
export const SURROUND_AVERAGE: SurroundParameters = { F: 1.0, c: 0.69, Nc: 1.0 }

/** Surround conditions for dim surround (cinema-like) */
export const SURROUND_DIM: SurroundParameters = { F: 0.9, c: 0.59, Nc: 0.95 }

/** Surround conditions for dark surround (projector in dark room) */
export const SURROUND_DARK: SurroundParameters = { F: 0.8, c: 0.525, Nc: 0.8 }

/** D65 standard illuminant white point in XYZ */
export const D65_WHITE_POINT: XYZ = { X: 95.047, Y: 100.0, Z: 108.883 }

/** Degrees-to-radians conversion factor */
const DEG_TO_RAD = Math.PI / 180

/** Radians-to-degrees conversion factor */
const RAD_TO_DEG = 180 / Math.PI

/** Exponent for the nonlinear cone response compression */
const CONE_RESPONSE_EXPONENT = 0.42

/** Scaling factor in the nonlinear cone response function */
const CONE_RESPONSE_SCALE = 400

/** Offset in the nonlinear cone response denominator */
const CONE_RESPONSE_OFFSET = 27.13

/** Additive constant in the post-adaptation response */
const POST_ADAPTATION_OFFSET = 0.1

/** Eccentricity factor table hue angles (degrees) */
const ECCENTRICITY_HUE_ANGLES = [20.14, 90.00, 164.25, 237.53, 380.14] as const

/** Eccentricity factor table values */
const ECCENTRICITY_VALUES = [0.8, 0.7, 1.0, 1.2, 0.8] as const

/** Eccentricity factor table H values */
const ECCENTRICITY_H_VALUES = [0.0, 100.0, 200.0, 300.0, 400.0] as const

// ============================================================================
// Types
// ============================================================================

/** 3x3 matrix represented as array of 3 rows, each row an array of 3 numbers */
type Matrix3x3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number]
]

/** 3-component vector */
type Vec3 = readonly [number, number, number]

/** CIE XYZ tristimulus values */
export interface XYZ {
  readonly X: number
  readonly Y: number
  readonly Z: number
}

/** Surround condition parameters */
export interface SurroundParameters {
  readonly F: number
  readonly c: number
  readonly Nc: number
}

/** Precomputed viewing condition parameters */
export interface ViewingConditions {
  readonly La: number
  readonly Yb: number
  readonly surround: SurroundParameters
  readonly k: number
  readonly Fl: number
  readonly n: number
  readonly Nbb: number
  readonly Ncb: number
  readonly z: number
  readonly D: number
  readonly Aw: number
  readonly adaptedWhiteRgc: Vec3
}

/** CIECAM02 appearance correlates */
export interface AppearanceCorrelates {
  readonly J: number
  readonly C: number
  readonly h: number
  readonly M: number
  readonly s: number
  readonly Q: number
}

/** Surround condition label */
export type SurroundCondition = "average" | "dim" | "dark"

// ============================================================================
// Public API
// ============================================================================

/**
 * Precompute viewing condition parameters from adapting luminance,
 * background luminance, and surround type.
 *
 * @param La - Adapting field luminance in cd/m² (typically Lw/5 for screens)
 * @param Yb - Relative background luminance (0-100, where 100 = white)
 * @param surround - Surround condition (default: "average" for screens)
 */
export const makeViewingConditions = (
  La: number,
  Yb: number,
  whitePoint: XYZ,
  surround: SurroundCondition = "average"
): Effect.Effect<ViewingConditions, CIECAM02Error> =>
  Effect.try({
    try: () => {
      const surroundParams = resolveSurround(surround)
      const k = 1 / (5 * La + 1)
      const k4 = k * k * k * k
      const Fl = 0.2 * k4 * (5 * La) + 0.1 * Math.pow(1 - k4, 2) * Math.pow(5 * La, 1 / 3)
      const n = Yb / whitePoint.Y
      const Nbb = 0.725 * Math.pow(1 / n, 0.2)
      const Ncb = Nbb
      const z = 1.48 + Math.sqrt(n)
      const D = surroundParams.F * (1 - (1 / 3.6) * Math.exp((-La - 42) / 92))
      const Dclamp = Math.max(0, Math.min(1, D))

      // Adapted white cone responses
      const whiteRgb = multiplyMatrixVec(M_CAT02, [whitePoint.X, whitePoint.Y, whitePoint.Z])
      const adaptedWhiteRgc: Vec3 = [
        (Dclamp * whitePoint.Y / whiteRgb[0] + 1 - Dclamp) * whiteRgb[0],
        (Dclamp * whitePoint.Y / whiteRgb[1] + 1 - Dclamp) * whiteRgb[1],
        (Dclamp * whitePoint.Y / whiteRgb[2] + 1 - Dclamp) * whiteRgb[2]
      ]

      // Compute Aw from white point
      const whiteRgbHpe = multiplyMatrixVec(M_HPE, multiplyMatrixVec(M_CAT02_INV, adaptedWhiteRgc))
      const whiteRa = nonlinearAdaptation(whiteRgbHpe[0], Fl)
      const whiteGa = nonlinearAdaptation(whiteRgbHpe[1], Fl)
      const whiteBa = nonlinearAdaptation(whiteRgbHpe[2], Fl)
      const Aw = (2 * whiteRa + whiteGa + (1 / 20) * whiteBa - 0.305) * Nbb

      return {
        La,
        Yb,
        surround: surroundParams,
        k,
        Fl,
        n,
        Nbb,
        Ncb,
        z,
        D: Dclamp,
        Aw,
        adaptedWhiteRgc
      }
    },
    catch: (cause) => new CIECAM02Error({ message: "Failed to compute viewing conditions", cause })
  })

/**
 * Forward CIECAM02 transform: XYZ → appearance correlates (J, C, h, M, s, Q)
 * under the given viewing conditions.
 */
export const forward = (
  xyz: XYZ,
  whitePoint: XYZ,
  conditions: ViewingConditions
): Effect.Effect<AppearanceCorrelates, CIECAM02Error> =>
  Effect.try({
    try: () => {
      const { Fl, Nbb, Ncb, z, Aw, D, surround } = conditions

      // Step 1: Chromatic adaptation (CAT02)
      const rgb = multiplyMatrixVec(M_CAT02, [xyz.X, xyz.Y, xyz.Z])
      const whiteRgb = multiplyMatrixVec(M_CAT02, [whitePoint.X, whitePoint.Y, whitePoint.Z])

      const rgc: Vec3 = [
        (D * whitePoint.Y / whiteRgb[0] + 1 - D) * rgb[0],
        (D * whitePoint.Y / whiteRgb[1] + 1 - D) * rgb[1],
        (D * whitePoint.Y / whiteRgb[2] + 1 - D) * rgb[2]
      ]

      // Step 2: Convert to Hunt-Pointer-Estévez cone responses
      const rgbHpe = multiplyMatrixVec(M_HPE, multiplyMatrixVec(M_CAT02_INV, rgc))

      // Step 3: Nonlinear compression (post-adaptation)
      const Ra = nonlinearAdaptation(rgbHpe[0], Fl)
      const Ga = nonlinearAdaptation(rgbHpe[1], Fl)
      const Ba = nonlinearAdaptation(rgbHpe[2], Fl)

      // Step 4: Opponent color dimensions
      const a = Ra - 12 * Ga / 11 + Ba / 11
      const b = (Ra + Ga - 2 * Ba) / 9

      // Step 5: Hue angle
      let h = Math.atan2(b, a) * RAD_TO_DEG
      if (h < 0) h += 360

      // Step 6: Eccentricity and hue composition
      const et = eccentricityFactor(h)

      // Step 7: Achromatic response
      const A = (2 * Ra + Ga + (1 / 20) * Ba - 0.305) * Nbb

      // Step 8: Lightness J
      const J = 100 * Math.pow(A / Aw, surround.c * z)

      // Step 9: Brightness Q
      const Q = (4 / surround.c) * Math.pow(J / 100, 0.5) * (Aw + 4) * Math.pow(Fl, 0.25)

      // Step 10: Chroma
      const t =
        (50000 / 13) *
        surround.Nc *
        Ncb *
        et *
        Math.sqrt(a * a + b * b) /
        (Ra + Ga + 21 * Ba / 20)
      const C = Math.pow(t, 0.9) * Math.pow(J / 100, 0.5) * (1.64 - Math.pow(0.29, conditions.n))

      // Step 11: Colorfulness M
      const M = C * Math.pow(Fl, 0.25)

      // Step 12: Saturation s
      const s = 100 * Math.pow(M / Q, 0.5)

      return { J, C, h, M, s, Q }
    },
    catch: (cause) => new CIECAM02Error({ message: "Forward CIECAM02 transform failed", cause })
  })

/**
 * Inverse CIECAM02 transform: appearance correlates (J, C, h) → XYZ
 * under the given viewing conditions.
 */
export const inverse = (
  correlates: Pick<AppearanceCorrelates, "J" | "C" | "h">,
  whitePoint: XYZ,
  conditions: ViewingConditions
): Effect.Effect<XYZ, CIECAM02Error> =>
  Effect.try({
    try: () => {
      const { J, C, h } = correlates
      const { Fl, Nbb, Ncb, z, Aw, D, surround, n } = conditions

      // Step 1: Recover A from J
      const A = Aw * Math.pow(J / 100, 1 / (surround.c * z))

      // Step 2: Recover t from C and J
      const t = Math.pow(
        C / (Math.pow(J / 100, 0.5) * (1.64 - Math.pow(0.29, n))),
        1 / 0.9
      )

      // Step 3: Eccentricity factor
      const et = eccentricityFactor(h)

      // Step 4: Recover a and b from t, h, A
      const hRad = h * DEG_TO_RAD
      const cosH = Math.cos(hRad)
      const sinH = Math.sin(hRad)

      const p1 = (50000 / 13) * surround.Nc * Ncb * et
      const p2 = A / Nbb + 0.305

      // Solve for a and b
      // From the forward model:
      //   Ra + Ga + 21*Ba/20 = 20*p2/21 (derived from A equation and the definitions)
      //   t = p1 * sqrt(a² + b²) / (Ra + Ga + 21*Ba/20)
      // So sqrt(a² + b²) = t * (Ra + Ga + 21*Ba/20) / p1
      //
      // We use the approach from CIE 159:2004 Appendix A (inverse model):
      // Solve the linear system for Ra, Ga, Ba from A, a, b, then invert.

      const gamma = 23 * (p2 + 0.305) * t / (23 * p1 + 11 * t * cosH + 108 * t * sinH)
      const a = gamma * cosH
      const b = gamma * sinH

      // Step 5: Recover post-adaptation cone responses
      const Ra = (460 * p2 + 451 * a + 288 * b) / 1403
      const Ga = (460 * p2 - 891 * a - 261 * b) / 1403
      const Ba = (460 * p2 - 220 * a - 6300 * b) / 1403

      // Step 6: Invert nonlinear adaptation
      const rgbHpe: Vec3 = [
        inverseNonlinearAdaptation(Ra, Fl),
        inverseNonlinearAdaptation(Ga, Fl),
        inverseNonlinearAdaptation(Ba, Fl)
      ]

      // Step 7: Convert back through HPE and CAT02
      const rgc = multiplyMatrixVec(M_CAT02, multiplyMatrixVec(M_HPE_INV, rgbHpe))

      // Step 8: Undo chromatic adaptation
      const whiteRgb = multiplyMatrixVec(M_CAT02, [whitePoint.X, whitePoint.Y, whitePoint.Z])
      const rgb: Vec3 = [
        rgc[0] / (D * whitePoint.Y / whiteRgb[0] + 1 - D),
        rgc[1] / (D * whitePoint.Y / whiteRgb[1] + 1 - D),
        rgc[2] / (D * whitePoint.Y / whiteRgb[2] + 1 - D)
      ]

      // Step 9: Convert back to XYZ
      const xyzVec = multiplyMatrixVec(M_CAT02_INV, rgb)

      return { X: xyzVec[0], Y: xyzVec[1], Z: xyzVec[2] }
    },
    catch: (cause) => new CIECAM02Error({ message: "Inverse CIECAM02 transform failed", cause })
  })

// ============================================================================
// Chromatic Adaptation Helpers
// ============================================================================

/** Multiply a 3x3 matrix by a 3-component vector */
const multiplyMatrixVec = (m: Matrix3x3, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
]

// ============================================================================
// Nonlinear Cone Response
// ============================================================================

/**
 * Forward nonlinear adaptation (cone response compression).
 * Maps cone excitation to post-adaptation response.
 */
const nonlinearAdaptation = (component: number, Fl: number): number => {
  const sign = component >= 0 ? 1 : -1
  const abs = Math.abs(component)
  const p = Math.pow(Fl * abs / 100, CONE_RESPONSE_EXPONENT)
  return sign * (CONE_RESPONSE_SCALE * p) / (p + CONE_RESPONSE_OFFSET) + POST_ADAPTATION_OFFSET
}

/**
 * Inverse nonlinear adaptation.
 * Recovers cone excitation from post-adaptation response.
 */
const inverseNonlinearAdaptation = (adapted: number, Fl: number): number => {
  const val = adapted - POST_ADAPTATION_OFFSET
  const sign = val >= 0 ? 1 : -1
  const abs = Math.abs(val)
  const p = (CONE_RESPONSE_OFFSET * abs) / (CONE_RESPONSE_SCALE - abs)
  return sign * (100 / Fl) * Math.pow(p, 1 / CONE_RESPONSE_EXPONENT)
}

// ============================================================================
// Eccentricity Factor
// ============================================================================

/** Compute the eccentricity factor et for a given hue angle */
const eccentricityFactor = (h: number): number => {
  const hp = h < ECCENTRICITY_HUE_ANGLES[0] ? h + 360 : h

  // Find which segment we're in
  const segmentIndex = pipe(
    Arr.range(0, 3),
    Arr.findLastIndex((i) => hp >= ECCENTRICITY_HUE_ANGLES[i])
  )

  // Default to segment 0 if not found
  const i = segmentIndex._tag === "Some" ? segmentIndex.value : 0

  const hi = ECCENTRICITY_HUE_ANGLES[i]
  const ei = ECCENTRICITY_VALUES[i]
  const Hi = ECCENTRICITY_H_VALUES[i]
  const hiNext = ECCENTRICITY_HUE_ANGLES[i + 1]
  const eiNext = ECCENTRICITY_VALUES[i + 1]
  const HiNext = ECCENTRICITY_H_VALUES[i + 1]

  const t = (hp - hi) / ei
  const denominator = t + (hiNext - hp) / eiNext

  return denominator === 0
    ? ei
    : (Hi + (100 * t) / denominator) / 100 * ((eiNext * ei) / (eiNext * (hp - hi) / (HiNext - Hi) + ei * (hiNext - hp) / (HiNext - Hi)))
}

// ============================================================================
// Surround Resolution
// ============================================================================

/** Resolve surround condition label to parameters */
const resolveSurround = (condition: SurroundCondition): SurroundParameters => {
  switch (condition) {
    case "average":
      return SURROUND_AVERAGE
    case "dim":
      return SURROUND_DIM
    case "dark":
      return SURROUND_DARK
  }
}
