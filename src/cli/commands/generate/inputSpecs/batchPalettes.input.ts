/**
 * Input specification for BatchPalettes mode.
 *
 * Single source of truth for BatchPalettes inputs.
 * Complete schema defines required fields; Partial derives all-optional for progressive completion.
 */

import { Schema } from "effect"
import { ColorSpaceSchema } from "../../../../domain/color/color.schema.js"
import {
  ColorStopPairSchema,
  PaletteNameSchema,
  type PartialColorStopPair,
  PartialColorStopPairSchema
} from "../../../../domain/palette/palette.schema.js"

// ============================================================================
// Complete Input Schema
// ============================================================================

/**
 * Complete BatchPalettes input - all fields required.
 * This is the single source of truth for what BatchPalettes needs.
 */
export const BatchPalettesCompleteSchema = Schema.Struct({
  /** Array of color/stop pairs for batch generation */
  pairs: Schema.NonEmptyArray(ColorStopPairSchema),

  /** Output color format */
  format: ColorSpaceSchema,

  /** Group name for the batch */
  name: PaletteNameSchema,

  /** Pattern file path for generation */
  pattern: Schema.String
}).pipe(
  Schema.annotations({
    identifier: "BatchPalettesComplete",
    description: "Complete input for batch palette generation - all fields required"
  })
)

export type BatchPalettesComplete = typeof BatchPalettesCompleteSchema.Type

// ============================================================================
// Partial Input Schema (Derived)
// ============================================================================

// Re-export PartialColorStopPair type for consumers
export type { PartialColorStopPair }

/**
 * Partial BatchPalettes input - for progressive completion.
 * Pairs are required but stops within pairs can be optional.
 */
export const BatchPalettesPartialSchema = Schema.Struct({
  /** Array of color/stop pairs (stops may be missing) */
  pairs: Schema.NonEmptyArray(PartialColorStopPairSchema),

  /** Output color format (optional) */
  format: Schema.optional(ColorSpaceSchema),

  /** Group name for the batch (optional) */
  name: Schema.optional(PaletteNameSchema),

  /** Pattern file path for generation (optional) */
  pattern: Schema.optional(Schema.String)
}).pipe(
  Schema.annotations({
    identifier: "BatchPalettesPartial",
    description: "Partial input for batch palette generation - for progressive completion"
  })
)

export type BatchPalettesPartial = typeof BatchPalettesPartialSchema.Type

// ============================================================================
// Decoders
// ============================================================================

/** Decode unknown value to Complete type */
export const decodeBatchPalettesComplete = Schema.decodeUnknown(BatchPalettesCompleteSchema)

/** Decode unknown value to Partial type */
export const decodeBatchPalettesPartial = Schema.decodeUnknown(BatchPalettesPartialSchema)
