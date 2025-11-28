/**
 * Execution mode schemas for the generate command
 *
 * Each mode represents a different execution path with its own handler.
 */

import { Schema } from "effect"
import { ColorStringSchema } from "../../../../domain/color/color.schema.js"
import { StopPositionSchema } from "../../../../domain/palette/palette.schema.js"
import {
  PartialTransformationBatchSchema,
  TransformationBatchSchema,
  TransformationInputSchema
} from "../../../schemas/transformation.schema.js"

/**
 * Single palette generation mode
 */
export const SinglePaletteModeSchema = Schema.Struct({
  _tag: Schema.Literal("SinglePalette"),
  color: ColorStringSchema,
  stop: Schema.optional(StopPositionSchema)
}).pipe(
  Schema.annotations({
    identifier: "SinglePaletteMode",
    description: "Generate a single color palette"
  })
)

/**
 * Batch palette generation mode
 * Note: stops can be undefined - batch executor will prompt for them
 */
export const BatchPalettesModeSchema = Schema.Struct({
  _tag: Schema.Literal("BatchPalettes"),
  pairs: Schema.Array(
    Schema.Struct({
      color: ColorStringSchema,
      stop: Schema.optional(StopPositionSchema)
    })
  )
}).pipe(
  Schema.annotations({
    identifier: "BatchPalettesMode",
    description: "Generate multiple palettes from color/stop pairs"
  })
)

/**
 * Single transformation mode (ref>target[::stop])
 * Note: stop can be undefined - handler will prompt for it
 */
export const SingleTransformModeSchema = Schema.Struct({
  _tag: Schema.Literal("SingleTransform"),
  input: Schema.Union(TransformationInputSchema, TransformationInputSchema.pipe(Schema.partial))
}).pipe(
  Schema.annotations({
    identifier: "SingleTransformMode",
    description: "Apply transformation from reference to target color"
  })
)

/**
 * One-to-many transformation mode (ref>(t1,t2,t3)[::stop])
 * Note: stop can be undefined - executor will prompt for it
 */
export const ManyTransformModeSchema = Schema.Struct({
  _tag: Schema.Literal("ManyTransform"),
  reference: ColorStringSchema,
  targets: Schema.Array(ColorStringSchema).pipe(Schema.minItems(1)),
  stop: Schema.optional(StopPositionSchema)
}).pipe(
  Schema.annotations({
    identifier: "ManyTransformMode",
    description: "Apply transformation from reference to multiple target colors"
  })
)

/**
 * Batch transformation mode (multiple transformations)
 * Note: transformations can be partial (missing stop) - handler will prompt for them
 * Supports mixing single transformations and one-to-many transformations
 */
export const BatchTransformModeSchema = Schema.Struct({
  _tag: Schema.Literal("BatchTransform"),
  transformations: Schema.Array(
    Schema.Union(
      // Try more specific schemas first (with more required fields)
      TransformationBatchSchema,
      PartialTransformationBatchSchema,
      TransformationInputSchema,
      TransformationInputSchema.pipe(Schema.partial)
    )
  ).pipe(Schema.minItems(1))
}).pipe(
  Schema.annotations({
    identifier: "BatchTransformMode",
    description: "Apply multiple color transformations"
  })
)

/**
 * Discriminated union of all execution modes
 */
export const ExecutionModeSchema = Schema.Union(
  SinglePaletteModeSchema,
  BatchPalettesModeSchema,
  SingleTransformModeSchema,
  ManyTransformModeSchema,
  BatchTransformModeSchema
).pipe(
  Schema.annotations({
    identifier: "ExecutionMode",
    description: "Execution mode for generate command"
  })
)

/**
 * Mode detection result includes mode and interaction flag
 */
export const ModeDetectionResultSchema = Schema.Struct({
  mode: ExecutionModeSchema,
  isInteractive: Schema.Boolean
}).pipe(
  Schema.annotations({
    identifier: "ModeDetectionResult",
    description: "Result of mode detection including execution mode and interaction flag"
  })
)

// Export types
export type SinglePaletteMode = typeof SinglePaletteModeSchema.Type
export type BatchPalettesMode = typeof BatchPalettesModeSchema.Type
export type SingleTransformMode = typeof SingleTransformModeSchema.Type
export type ManyTransformMode = typeof ManyTransformModeSchema.Type
export type BatchTransformMode = typeof BatchTransformModeSchema.Type
export type ExecutionMode = typeof ExecutionModeSchema.Type
export type ModeDetectionResult = typeof ModeDetectionResultSchema.Type

// Export decoders
export const SinglePaletteMode = Schema.decodeUnknown(SinglePaletteModeSchema)
export const BatchPalettesMode = Schema.decodeUnknown(BatchPalettesModeSchema)
export const SingleTransformMode = Schema.decodeUnknown(SingleTransformModeSchema)
export const ManyTransformMode = Schema.decodeUnknown(ManyTransformModeSchema)
export const BatchTransformMode = Schema.decodeUnknown(BatchTransformModeSchema)
export const ExecutionMode = Schema.decodeUnknown(ExecutionModeSchema)
export const ModeDetectionResult = Schema.decodeUnknown(ModeDetectionResultSchema)
