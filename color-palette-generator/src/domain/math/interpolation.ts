/**
 * Interpolation and smoothing utilities for color palette generation
 */

import type { StopPosition } from "../../schemas/palette.js"
import { STOP_POSITIONS } from "../../schemas/palette.js"
import type { StopTransform, TransformationPattern } from "../learning/pattern.js"

/**
 * Smooth the transformation pattern to ensure:
 * - Lightness is perfectly linear
 * - Chroma follows a smooth curve
 * - Hue is consistent (median value)
 */
export const smoothPattern = (pattern: TransformationPattern): TransformationPattern => {
  // Calculate lightness multipliers - linear interpolation preserving endpoints
  const lightnessMultipliers = calculateLinearLightness(pattern)

  // Smooth chroma curve - linear interpolation preserving endpoints
  const chromaMultipliers = smoothChromaCurve(pattern)

  // Hue - use median to eliminate outliers
  const consistentHue = calculateConsistentHue(pattern)

  // Build smoothed transforms
  const smoothedTransforms = {} as Record<StopPosition, StopTransform>

  for (const position of STOP_POSITIONS) {
    smoothedTransforms[position] = {
      lightnessMultiplier: lightnessMultipliers[position],
      chromaMultiplier: chromaMultipliers[position],
      hueShiftDegrees: consistentHue
    }
  }

  return {
    ...pattern,
    name: `${pattern.name}-smoothed`,
    transforms: smoothedTransforms
  }
}

/**
 * Calculate lightness multipliers using quadratic interpolation
 *
 * Fits a parabola through the three key points (100, 500, 1000)
 * to create a smooth curve that preserves the learned endpoint values.
 */
const calculateLinearLightness = (
  pattern: TransformationPattern
): Record<StopPosition, number> => {
  const result = {} as Record<StopPosition, number>

  // Get the three key points from learned pattern
  const lightness100 = pattern.transforms[100].lightnessMultiplier
  const lightness500 = 1.0 // Reference stop is always 1.0
  const lightness1000 = pattern.transforms[1000].lightnessMultiplier

  // Fit a quadratic curve y = ax^2 + bx + c through these three points
  // Using the same approach as chroma smoothing
  const c = lightness100
  const x_mid = (500 - 100) / (1000 - 100) // = 0.444...

  const a = (lightness500 - c - lightness1000 * x_mid + c * x_mid) / (x_mid * x_mid - x_mid)
  const b = lightness1000 - c - a

  // Generate smoothed values using the quadratic formula
  for (const position of STOP_POSITIONS) {
    const x = (position - 100) / (1000 - 100) // Normalize to [0, 1]
    result[position] = Math.max(0, a * x * x + b * x + c)
  }

  return result
}

/**
 * Smooth chroma curve using quadratic interpolation
 *
 * Fits a parabola through the three key points (100, 500, 1000)
 * to create a smooth curve that preserves the learned endpoint values.
 */
const smoothChromaCurve = (
  pattern: TransformationPattern
): Record<StopPosition, number> => {
  const result = {} as Record<StopPosition, number>

  // Get the three key points from learned pattern
  const chroma100 = pattern.transforms[100].chromaMultiplier
  const chroma500 = 1.0 // Reference stop is always 1.0
  const chroma1000 = pattern.transforms[1000].chromaMultiplier

  // Fit a quadratic curve y = ax^2 + bx + c through these three points
  // Normalize x to [0, 1] range: x = (position - 100) / 900

  // Three equations:
  // chroma100 = a(0)^2 + b(0) + c  =>  c = chroma100
  // chroma500 = a(400/900)^2 + b(400/900) + c
  // chroma1000 = a(900/900)^2 + b(900/900) + c  =>  a + b + c = chroma1000

  const c = chroma100
  const x_mid = (500 - 100) / (1000 - 100) // = 400/900 = 0.444...

  // From equation 2: a*x_mid^2 + b*x_mid + c = chroma500
  // From equation 3: a + b + c = chroma1000
  // Solve for a and b:
  // b = chroma1000 - c - a
  // a*x_mid^2 + (chroma1000 - c - a)*x_mid + c = chroma500
  // a*x_mid^2 + chroma1000*x_mid - c*x_mid - a*x_mid + c = chroma500
  // a(x_mid^2 - x_mid) = chroma500 - c - chroma1000*x_mid + c*x_mid
  // a = (chroma500 - c - chroma1000*x_mid + c*x_mid) / (x_mid^2 - x_mid)

  const a = (chroma500 - c - chroma1000 * x_mid + c * x_mid) / (x_mid * x_mid - x_mid)
  const b = chroma1000 - c - a

  // Generate smoothed values using the quadratic formula
  for (const position of STOP_POSITIONS) {
    const x = (position - 100) / (1000 - 100) // Normalize to [0, 1]
    result[position] = Math.max(0, a * x * x + b * x + c)
  }

  return result
}

/**
 * Calculate consistent hue shift (median of all values)
 */
const calculateConsistentHue = (pattern: TransformationPattern): number => {
  const hueShifts = STOP_POSITIONS.map((pos) => pattern.transforms[pos].hueShiftDegrees)

  // Use median to eliminate outliers
  const sorted = [...hueShifts].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  } else {
    return sorted[mid]
  }
}

/**
 * Linear interpolation between two values
 */
export const lerp = (a: number, b: number, t: number): number => {
  return a + (b - a) * t
}

/**
 * Clamp a value between min and max
 */
export const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value))
}
