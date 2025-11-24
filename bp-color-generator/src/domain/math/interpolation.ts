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
  // Calculate lightness multipliers - perfectly linear from 100 to 1000
  const lightnessMultipliers = calculateLinearLightness(pattern.referenceStop)

  // Smooth chroma curve - fit a smooth curve through the data points
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
 * Calculate perfectly linear lightness multipliers
 *
 * Strategy: Linear interpolation from darkest (100) to lightest (1000)
 * The reference stop determines the anchoring point
 */
const calculateLinearLightness = (
  referenceStop: StopPosition
): Record<StopPosition, number> => {
  const result = {} as Record<StopPosition, number>

  // Reference stop has multiplier of 1.0
  result[referenceStop] = 1.0

  // Calculate linear progression
  // From example: stop 100 should be ~1.6x lighter, stop 1000 should be ~0.17x darker
  // This gives us a range of about 9.4x from darkest to lightest

  // Total range: let's aim for a nice ratio
  // If ref is at 500 (middle), we want symmetric-ish behavior
  const minMultiplier = 0.1 // Darkest stop (1000)
  const maxMultiplier = 1.9 // Lightest stop (100)

  // Calculate step size for linear progression
  const totalSteps = STOP_POSITIONS.length - 1 // 9 steps from 100 to 1000
  const range = maxMultiplier - minMultiplier
  const stepSize = range / totalSteps

  for (let i = 0; i < STOP_POSITIONS.length; i++) {
    const position = STOP_POSITIONS[i]
    // Linear from max (100) to min (1000)
    result[position] = maxMultiplier - (stepSize * i)
  }

  // Normalize so reference stop is exactly 1.0
  const refValue = result[referenceStop]
  for (const position of STOP_POSITIONS) {
    result[position] = result[position] / refValue
  }

  return result
}

/**
 * Smooth chroma curve using a parabolic fit
 *
 * Chroma should peak at the reference stop and reduce toward extremes
 */
const smoothChromaCurve = (
  pattern: TransformationPattern
): Record<StopPosition, number> => {
  const result = {} as Record<StopPosition, number>

  // Fit a quadratic curve: y = a*x^2 + b*x + c
  // Peak should be at reference stop (500), so use vertex form
  const refStop = pattern.referenceStop

  // Use vertex form: y = a(x - h)^2 + k
  // where (h, k) is the vertex (peak)
  // h = refStop, k = 1.0 (peak chroma)

  // Calculate 'a' using endpoints to determine curvature
  const chroma100 = pattern.transforms[100].chromaMultiplier
  const chroma1000 = pattern.transforms[1000].chromaMultiplier
  const avgEndChroma = (chroma100 + chroma1000) / 2

  // Solve for 'a': avgEndChroma = a * (450)^2 + 1.0
  // (using distance from 500 to endpoints: 400)
  const distance = 450 // Average distance from ref to endpoints
  const a = (avgEndChroma - 1.0) / (distance * distance)

  // Generate smoothed values
  for (const position of STOP_POSITIONS) {
    const x = position - refStop
    result[position] = Math.max(0, a * x * x + 1.0)
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
