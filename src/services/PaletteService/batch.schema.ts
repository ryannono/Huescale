/**
 * Schemas for batch palette generation
 */

import { Schema } from "effect"
import { ColorSpaceSchema, ColorStringSchema } from "../../domain/color/color.schema.js"
import { StopPositionSchema } from "../../domain/palette/palette.schema.js"
import { GeneratedPaletteOutputSchema } from "./generation.schema.js"

/**
 * Color and stop position pair
 */
export const ColorStopPairSchema = Schema.Struct({
  color: ColorStringSchema,
  stop: StopPositionSchema
}).pipe(
  Schema.annotations({
    identifier: "ColorStopPair",
    description: "A color and its corresponding stop position"
  })
)

export const ColorStopPair = Schema.decodeUnknown(ColorStopPairSchema)
export type ColorStopPair = typeof ColorStopPairSchema.Type

/**
 * Input schema for batch palette generation
 */
export const BatchGeneratePaletteInputSchema = Schema.Struct({
  pairs: Schema.Array(ColorStopPairSchema).pipe(
    Schema.minItems(1),
    Schema.annotations({
      title: "Color/Stop Pairs",
      description: "Array of color and stop position pairs to generate palettes for"
    })
  ),
  outputFormat: ColorSpaceSchema,
  paletteGroupName: Schema.optionalWith(Schema.String, {
    default: () => "batch"
  }),
  patternSource: Schema.optionalWith(Schema.String, {
    default: () => "test/fixtures/valid-palettes/example-orange.json"
  })
}).pipe(
  Schema.annotations({
    identifier: "BatchGeneratePaletteInput",
    description: "Input parameters for batch palette generation"
  })
)

export const BatchGeneratePaletteInput = Schema.decodeUnknown(BatchGeneratePaletteInputSchema)
export type BatchGeneratePaletteInput = typeof BatchGeneratePaletteInputSchema.Type

/**
 * Output schema for batch palette generation
 */
export const BatchGeneratedPaletteOutputSchema = Schema.Struct({
  groupName: Schema.String.pipe(Schema.nonEmptyString()),
  outputFormat: ColorSpaceSchema,
  generatedAt: Schema.String.pipe(
    Schema.annotations({
      description: "ISO 8601 timestamp"
    })
  ),
  palettes: Schema.Array(GeneratedPaletteOutputSchema).pipe(
    Schema.minItems(1),
    Schema.annotations({
      title: "Generated Palettes",
      description: "Collection of generated palettes"
    })
  ),
  partial: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
    annotations: {
      description: "True if this is a partial result due to errors"
    }
  })
}).pipe(
  Schema.annotations({
    identifier: "BatchGeneratedPaletteOutput",
    description: "Batch palette generation output with metadata"
  })
)

export const BatchGeneratedPaletteOutput = Schema.decodeUnknown(BatchGeneratedPaletteOutputSchema)
export type BatchGeneratedPaletteOutput = typeof BatchGeneratedPaletteOutputSchema.Type
