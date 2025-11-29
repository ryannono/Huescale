/**
 * Palette schemas using Effect Schema
 */

import { Schema } from "effect"
import { HexColorSchema, OKLCHColorSchema } from "../color/color.schema.js"

// ============================================================================
// Constants
// ============================================================================

/**
 * Array of all valid stop positions (for iteration)
 */
export const STOP_POSITIONS: ReadonlyArray<100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000> = [
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
]

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
