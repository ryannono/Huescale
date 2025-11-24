/**
 * Palette schemas using Effect Schema
 */

import { Schema } from "effect"
import { OKLCHColorSchema } from "./color.js"

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

export type StopPosition = typeof StopPositionSchema.Type

/**
 * Array of all valid stop positions (for iteration)
 */
export const STOP_POSITIONS: ReadonlyArray<StopPosition> = [
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
    description: "A single stop in a color palette"
  })
)

export type PaletteStop = typeof PaletteStopSchema.Type

/**
 * Palette Schema
 *
 * A complete color palette with exactly 10 stops (100-1000)
 */
export const PaletteSchema = Schema.Struct({
  name: Schema.String.pipe(
    Schema.nonEmptyString(),
    Schema.annotations({
      title: "Palette Name",
      description: "Human-readable name for the palette"
    })
  ),
  stops: Schema.Array(PaletteStopSchema).pipe(
    Schema.itemsCount(10),
    Schema.annotations({
      title: "Palette Stops",
      description: "Exactly 10 color stops from 100 to 1000"
    })
  )
}).pipe(
  Schema.annotations({
    identifier: "Palette",
    description: "A complete color palette with 10 stops"
  })
)

export type Palette = typeof PaletteSchema.Type

/**
 * Example Palette Input Schema (for loading from JSON)
 *
 * Allows hex colors instead of OKLCH for easier input
 */
export const ExamplePaletteInputSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.nonEmptyString()),
  description: Schema.optional(Schema.String),
  stops: Schema.Array(
    Schema.Struct({
      position: StopPositionSchema,
      hex: Schema.String.pipe(
        Schema.pattern(/^#[0-9A-Fa-f]{6}$/),
        Schema.annotations({
          title: "Hex Color",
          description: "Color in hexadecimal format"
        })
      )
    })
  ).pipe(Schema.itemsCount(10))
}).pipe(
  Schema.annotations({
    identifier: "ExamplePaletteInput",
    description: "Input format for example palettes (uses hex colors)"
  })
)

export type ExamplePaletteInput = typeof ExamplePaletteInputSchema.Type
