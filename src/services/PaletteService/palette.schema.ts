/**
 * Palette generation schemas
 *
 * Request and result schemas for single and batch palette generation.
 */

import { Schema } from "effect"
import { DEFAULT_BATCH_NAME, DEFAULT_PALETTE_NAME } from "../../config/constants.js"
import { ColorSpaceSchema, ColorStringSchema } from "../../domain/color/color.schema.js"
import { PaletteStopSchema, StopPositionSchema } from "../../domain/palette/palette.schema.js"

// ============================================================================
// Schema Combinators
// ============================================================================

/** Non-empty string combinator for required text fields */
const NonEmptyString = Schema.String.pipe(
  Schema.nonEmptyString({ message: () => "Value cannot be empty" }),
  Schema.annotations({
    identifier: "NonEmptyString",
    description: "A string that cannot be empty"
  })
)

/** Schema for pattern source string */
const PatternSourceSchema = Schema.String.pipe(
  Schema.annotations({
    identifier: "PatternSource",
    description: "File path or identifier for the pattern source"
  })
)

/** Optional pattern source for palette generation */
const OptionalPatternSource = Schema.optional(PatternSourceSchema)

// ============================================================================
// Component Schemas
// ============================================================================

/** Validated ISO 8601 timestamp */
export const ISOTimestampSchema = Schema.String.pipe(
  Schema.filter(
    (s) => !isNaN(Date.parse(s)),
    { message: () => "Invalid ISO 8601 timestamp" }
  ),
  Schema.brand("ISOTimestamp"),
  Schema.annotations({
    identifier: "ISOTimestamp",
    description: "ISO 8601 formatted timestamp string"
  })
)

export const ISOTimestamp = Schema.decodeUnknown(ISOTimestampSchema)
export type ISOTimestamp = typeof ISOTimestampSchema.Type

/** Color paired with its anchor stop position for batch operations */
export const ColorAnchorSchema = Schema.Struct({
  color: ColorStringSchema,
  stop: StopPositionSchema
}).pipe(
  Schema.annotations({
    identifier: "ColorAnchor",
    description: "Color paired with its anchor stop position for palette generation"
  })
)

export const ColorAnchor = Schema.decodeUnknown(ColorAnchorSchema)
export type ColorAnchor = typeof ColorAnchorSchema.Type

/** A palette stop with its formatted output value */
export const FormattedStopSchema = PaletteStopSchema.pipe(
  Schema.extend(Schema.Struct({ value: Schema.String })),
  Schema.annotations({
    identifier: "FormattedStop",
    description: "Palette stop with computed color value in the requested output format"
  })
)

export const FormattedStop = Schema.decodeUnknown(FormattedStopSchema)
export type FormattedStop = typeof FormattedStopSchema.Type

// ============================================================================
// Single Palette Schemas
// ============================================================================

/** Request to generate a palette from a color and anchor stop */
export const PaletteRequestSchema = Schema.Struct({
  inputColor: ColorStringSchema,
  anchorStop: StopPositionSchema,
  outputFormat: ColorSpaceSchema,
  paletteName: Schema.optionalWith(Schema.String, {
    default: () => DEFAULT_PALETTE_NAME
  }),
  patternSource: OptionalPatternSource
}).pipe(
  Schema.annotations({
    identifier: "PaletteRequest",
    description: "Request parameters for generating a single color palette"
  })
)

export const PaletteRequest = Schema.decodeUnknown(PaletteRequestSchema)
export type PaletteRequest = typeof PaletteRequestSchema.Type

/** Generated palette with formatted color values */
export const PaletteResultSchema = Schema.Struct({
  name: NonEmptyString,
  inputColor: ColorStringSchema,
  anchorStop: StopPositionSchema,
  outputFormat: ColorSpaceSchema,
  stops: Schema.Array(FormattedStopSchema).pipe(
    Schema.itemsCount(10, { message: () => "Palette result must have exactly 10 stops" })
  )
}).pipe(
  Schema.annotations({
    identifier: "PaletteResult",
    description: "Generated palette containing formatted color stops"
  })
)

export const PaletteResult = Schema.decodeUnknown(PaletteResultSchema)
export type PaletteResult = typeof PaletteResultSchema.Type

// ============================================================================
// Batch Palette Schemas
// ============================================================================

/** Request to generate multiple palettes in a single operation */
export const BatchRequestSchema = Schema.Struct({
  pairs: Schema.NonEmptyArray(ColorAnchorSchema),
  outputFormat: ColorSpaceSchema,
  paletteGroupName: Schema.optionalWith(Schema.String, {
    default: () => DEFAULT_BATCH_NAME
  }),
  patternSource: OptionalPatternSource
}).pipe(
  Schema.annotations({
    identifier: "BatchRequest",
    description: "Request parameters for generating multiple palettes in batch"
  })
)

export const BatchRequest = Schema.decodeUnknown(BatchRequestSchema)
export type BatchRequest = typeof BatchRequestSchema.Type

/** Collection of generated palettes with metadata */
export const BatchResultSchema = Schema.Struct({
  groupName: NonEmptyString,
  outputFormat: ColorSpaceSchema,
  generatedAt: ISOTimestampSchema,
  palettes: Schema.NonEmptyArray(PaletteResultSchema),
  partial: Schema.optionalWith(Schema.Boolean, { default: () => false })
}).pipe(
  Schema.annotations({
    identifier: "BatchResult",
    description: "Result of batch palette generation containing multiple palettes with metadata"
  })
)

export const BatchResult = Schema.decodeUnknown(BatchResultSchema)
export type BatchResult = typeof BatchResultSchema.Type
