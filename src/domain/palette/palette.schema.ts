/**
 * Palette schemas using Effect Schema
 */

import { Schema } from "effect"
import { ColorSpaceSchema, ColorStringSchema, HexColorSchema, OKLCHColorSchema } from "../color/color.schema.js"

// ============================================================================
// Constants
// ============================================================================

/**
 * Array of all valid stop positions (for iteration)
 */
export const STOP_POSITIONS = [
  100,
  200,
  300,
  400,
  500,
  600,
  700,
  800,
  900,
  1000
] as const

// ============================================================================
// Component Schemas
// ============================================================================

/**
 * Stop Position Schema
 *
 * Valid stop positions are 100, 200, 300, ..., 1000
 */
export const StopPositionSchema = Schema.Literal(
  100,
  200,
  300,
  400,
  500,
  600,
  700,
  800,
  900,
  1000
).pipe(
  Schema.annotations({
    identifier: "StopPosition",
    description: "Valid palette stop position (100-1000 in increments of 100)"
  })
)

export const StopPosition = Schema.decodeUnknown(StopPositionSchema)
export type StopPosition = typeof StopPositionSchema.Type

/**
 * Palette Name Schema
 *
 * Non-empty string for palette names
 */
export const PaletteNameSchema = Schema.String.pipe(
  Schema.nonEmptyString({ message: () => "Palette name cannot be empty" }),
  Schema.annotations({
    identifier: "PaletteName",
    description: "Human-readable name for the palette"
  })
)

export type PaletteName = typeof PaletteNameSchema.Type

// ============================================================================
// Schemas
// ============================================================================

/**
 * Palette Stop Schema
 *
 * Represents a single stop in a color palette
 */
export const PaletteStopSchema = Schema.Struct({
  position: StopPositionSchema,
  color: OKLCHColorSchema
}).pipe(
  Schema.annotations({
    identifier: "PaletteStop",
    description: "A single stop in a color palette with position and OKLCH color"
  })
)

export const PaletteStop = Schema.decodeUnknown(PaletteStopSchema)
export type PaletteStop = typeof PaletteStopSchema.Type

/**
 * Palette Stops Schema
 *
 * Exactly 10 palette stops from position 100 to 1000
 */
export const PaletteStopsSchema = Schema.Array(PaletteStopSchema).pipe(
  Schema.itemsCount(10, {
    message: () => "Palette must have exactly 10 stops (positions 100-1000)"
  }),
  Schema.annotations({
    identifier: "PaletteStops",
    description: "Exactly 10 color stops from position 100 to 1000"
  })
)

export type PaletteStops = typeof PaletteStopsSchema.Type

/**
 * Palette Schema
 *
 * A complete color palette with exactly 10 stops (100-1000)
 */
export const PaletteSchema = Schema.Struct({
  name: PaletteNameSchema,
  stops: PaletteStopsSchema
}).pipe(
  Schema.annotations({
    identifier: "Palette",
    description: "A complete color palette with name and 10 color stops"
  })
)

export const Palette = Schema.decodeUnknown(PaletteSchema)
export type Palette = typeof PaletteSchema.Type

/**
 * Example Palette Stop Input Schema
 *
 * A single stop using hex color instead of OKLCH
 */
export const ExamplePaletteStopRequestSchema = Schema.Struct({
  position: StopPositionSchema,
  hex: HexColorSchema
}).pipe(
  Schema.annotations({
    identifier: "ExamplePaletteStopRequest",
    description: "Input format for a palette stop using hex color"
  })
)

export type ExamplePaletteStopRequest = typeof ExamplePaletteStopRequestSchema.Type

/**
 * Example Palette Input Schema (for loading from JSON)
 *
 * Allows hex colors instead of OKLCH for easier input
 */
export const ExamplePaletteRequestSchema = Schema.Struct({
  name: PaletteNameSchema,
  description: Schema.optional(Schema.String.pipe(
    Schema.annotations({
      identifier: "PaletteDescription",
      description: "Optional description for the palette"
    })
  )),
  stops: Schema.Array(ExamplePaletteStopRequestSchema).pipe(
    Schema.itemsCount(10, {
      message: () => "Example palette must have exactly 10 stops"
    }),
    Schema.annotations({
      identifier: "ExamplePaletteStops",
      description: "Exactly 10 palette stops with hex colors"
    })
  )
}).pipe(
  Schema.annotations({
    identifier: "ExamplePaletteRequest",
    description: "Input format for example palettes using hex colors instead of OKLCH"
  })
)

export const ExamplePaletteRequest = Schema.decodeUnknown(ExamplePaletteRequestSchema)
export type ExamplePaletteRequest = typeof ExamplePaletteRequestSchema.Type

// ============================================================================
// Result Schemas
// ============================================================================

// ============================================================================
// Validation Helpers
// ============================================================================

/** Check if string is a valid ISO 8601 timestamp */
const isValidISOTimestamp = (s: string): boolean => !isNaN(Date.parse(s))

// ============================================================================
// Result Schemas (continued)
// ============================================================================

/** Validated ISO 8601 timestamp */
export const ISOTimestampSchema = Schema.String.pipe(
  Schema.filter(isValidISOTimestamp, { message: () => "Invalid ISO 8601 timestamp" }),
  Schema.brand("ISOTimestamp"),
  Schema.annotations({
    identifier: "ISOTimestamp",
    description: "ISO 8601 formatted timestamp string"
  })
)

export const ISOTimestamp = Schema.decodeUnknown(ISOTimestampSchema)
export type ISOTimestamp = typeof ISOTimestampSchema.Type

/** Color paired with its anchor stop position */
export const ColorStopPairSchema = Schema.Struct({
  color: ColorStringSchema,
  stop: StopPositionSchema
}).pipe(
  Schema.annotations({
    identifier: "ColorStopPair",
    description: "Color paired with its anchor stop position for palette generation"
  })
)

export const ColorStopPair = Schema.decodeUnknown(ColorStopPairSchema)
export type ColorStopPair = typeof ColorStopPairSchema.Type

/** Color/stop pair with optional stop for interactive prompting */
export const PartialColorStopPairSchema = ColorStopPairSchema.pipe(
  Schema.omit("stop"),
  Schema.extend(Schema.Struct({ stop: Schema.optional(StopPositionSchema) })),
  Schema.annotations({
    identifier: "PartialColorStopPair",
    description: "Color/stop pair with optional stop position for interactive prompting"
  })
)

export const PartialColorStopPair = Schema.decodeUnknown(PartialColorStopPairSchema)
export type PartialColorStopPair = typeof PartialColorStopPairSchema.Type

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

/** Generated palette with formatted color values */
export const PaletteResultSchema = Schema.Struct({
  name: PaletteNameSchema,
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

/** A failed palette generation with error details */
export const GenerationFailureSchema = ColorStopPairSchema.pipe(
  Schema.extend(Schema.Struct({ error: Schema.String })),
  Schema.annotations({
    identifier: "GenerationFailure",
    description: "Details of a failed palette generation attempt"
  })
)

export type GenerationFailure = typeof GenerationFailureSchema.Type

/** Collection of generated palettes with metadata */
export const BatchResultSchema = Schema.Struct({
  groupName: PaletteNameSchema,
  outputFormat: ColorSpaceSchema,
  generatedAt: ISOTimestampSchema,
  palettes: Schema.NonEmptyArray(PaletteResultSchema),
  failures: Schema.optionalWith(Schema.Array(GenerationFailureSchema), { default: () => [] })
}).pipe(
  Schema.annotations({
    identifier: "BatchResult",
    description: "Result of batch palette generation containing multiple palettes with metadata"
  })
)

export const BatchResult = Schema.decodeUnknown(BatchResultSchema)
export type BatchResult = typeof BatchResultSchema.Type
