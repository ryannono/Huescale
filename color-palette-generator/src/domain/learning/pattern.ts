/**
 * Pattern types for color palette generation
 *
 * These types represent the transformation rules learned from example palettes.
 */

import type { OKLCHColor } from "../../schemas/color.js"
import type { StopPosition } from "../../schemas/palette.js"

/**
 * Transformation for a single stop relative to a reference stop
 */
export interface StopTransform {
  readonly lightnessMultiplier: number // Multiply reference L by this
  readonly chromaMultiplier: number // Multiply reference C by this
  readonly hueShiftDegrees: number // Add this to reference H
}

/**
 * Complete transformation pattern learned from example palettes
 */
export interface TransformationPattern {
  readonly name: string
  readonly referenceStop: StopPosition // Usually 500
  readonly transforms: Readonly<Record<StopPosition, StopTransform>>
  readonly metadata: {
    readonly sourceCount: number // How many palettes contributed
    readonly confidence: number // [0, 1] based on consistency
  }
}

/**
 * An analyzed palette with OKLCH colors
 */
export interface AnalyzedPalette {
  readonly name: string
  readonly stops: ReadonlyArray<{
    readonly position: StopPosition
    readonly color: OKLCHColor
  }>
}
