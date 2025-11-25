/**
 * Schemas for palette generation program
 *
 * Input and output schemas for the main generate-palette program
 */

import { Schema } from "effect"
import { ColorSpaceSchema, ColorStringSchema } from "./color.js"
import { PaletteStopSchema, StopPositionSchema } from "./palette.js"

/**
 * Input schema for palette generation
 */
export const GeneratePaletteInputSchema = Schema.Struct({
  inputColor: ColorStringSchema,
  anchorStop: StopPositionSchema,
  outputFormat: ColorSpaceSchema,
  paletteName: Schema.optionalWith(Schema.String, {
    default: () => "generated"
  }),
  patternSource: Schema.optionalWith(Schema.String, {
    default: () => "test/fixtures/palettes/example-blue.json"
  })
}).pipe(
  Schema.annotations({
    identifier: "GeneratePaletteInput",
    description: "Input parameters for palette generation"
  })
)

export const GeneratePaletteInput = Schema.decodeUnknown(GeneratePaletteInputSchema)
export type GeneratePaletteInput = typeof GeneratePaletteInputSchema.Type

/**
 * Generated palette stop schema - extends PaletteStop with formatted value
 */
export const GeneratedPaletteStopSchema = Schema.Struct({
  value: Schema.String.pipe(
    Schema.annotations({
      title: "Formatted Value",
      description: "Color value in the requested output format"
    })
  )
}).pipe(Schema.extend(PaletteStopSchema))

export const GeneratedPaletteStop = Schema.decodeUnknown(GeneratedPaletteStopSchema)
export type GeneratedPaletteStop = typeof GeneratedPaletteStopSchema.Type

/**
 * Output schema for generated palette
 */
export const GeneratedPaletteOutputSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.nonEmptyString()),
  inputColor: Schema.String,
  anchorStop: StopPositionSchema,
  outputFormat: ColorSpaceSchema,
  stops: Schema.Array(GeneratedPaletteStopSchema).pipe(Schema.itemsCount(10))
}).pipe(
  Schema.annotations({
    identifier: "GeneratedPaletteOutput",
    description: "Generated palette with formatted color values"
  })
)

export const GeneratedPaletteOutput = Schema.decodeUnknown(GeneratedPaletteOutputSchema)
export type GeneratedPaletteOutput = typeof GeneratedPaletteOutputSchema.Type
