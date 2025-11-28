/**
 * Schemas for color transformation syntax
 *
 * Defines schemas for parsing and validating transformation syntax like:
 * - ref>target::stop
 * - ref>(t1,t2)::stop
 */

import { Schema } from "effect"
import { ColorStringSchema } from "../../domain/color/color.schema.js"
import { StopPositionSchema } from "../../domain/palette/palette.schema.js"

/**
 * Single transformation spec: reference>target
 *
 * Example: "2D72D2>238551"
 */
export const TransformationSpecSchema = Schema.Struct({
  reference: ColorStringSchema,
  target: ColorStringSchema
}).pipe(
  Schema.annotations({
    identifier: "TransformationSpec",
    description: "Specification for a color transformation (reference>target)"
  })
)

export const TransformationSpec = Schema.decodeUnknown(TransformationSpecSchema)
export type TransformationSpec = typeof TransformationSpecSchema.Type

/**
 * Single transformation input with stop: reference>target::stop
 *
 * Example: "2D72D2>238551::500"
 */
export const TransformationInputSchema = Schema.Struct({
  reference: ColorStringSchema,
  target: ColorStringSchema,
  stop: StopPositionSchema
}).pipe(
  Schema.annotations({
    identifier: "TransformationInput",
    description: "Complete transformation input with stop position (reference>target::stop)"
  })
)

export const TransformationInput = Schema.decodeUnknown(TransformationInputSchema)
export type TransformationInput = typeof TransformationInputSchema.Type

/**
 * Partial transformation input with optional stop: reference>target[::stop]
 */
export const PartialTransformationInputSchema = TransformationInputSchema.pipe(
  Schema.partial,
  Schema.annotations({
    identifier: "PartialTransformationInput",
    description: "Transformation input with optional stop position"
  })
)

export const PartialTransformationInput = Schema.decodeUnknown(PartialTransformationInputSchema)
export type PartialTransformationInput = typeof PartialTransformationInputSchema.Type

/**
 * Base one-to-many transformation structure (without stop requirement)
 */
const TransformationBatchBaseSchema = Schema.Struct({
  reference: ColorStringSchema,
  targets: Schema.Array(ColorStringSchema).pipe(
    Schema.minItems(1),
    Schema.annotations({
      description: "List of target colors to apply the reference's appearance to"
    })
  )
})

/**
 * One-to-many transformation: reference>(t1,t2,t3)::stop
 *
 * Example: "2D72D2>(238551,DC143C,FF6B6B)::500"
 */
export const TransformationBatchSchema = TransformationBatchBaseSchema.pipe(
  Schema.extend(Schema.Struct({ stop: StopPositionSchema })),
  Schema.annotations({
    identifier: "TransformationBatch",
    description: "One-to-many transformation (reference>(t1,t2,...)::stop)"
  })
)

export const TransformationBatch = Schema.decodeUnknown(TransformationBatchSchema)
export type TransformationBatch = typeof TransformationBatchSchema.Type

/**
 * Partial one-to-many transformation with optional stop: reference>(t1,t2,t3)[::stop]
 * Reference and targets are required, only stop is optional
 */
export const PartialTransformationBatchSchema = TransformationBatchBaseSchema.pipe(
  Schema.extend(Schema.Struct({ stop: Schema.optional(StopPositionSchema) })),
  Schema.annotations({
    identifier: "PartialTransformationBatch",
    description: "One-to-many transformation with optional stop position"
  })
)

export const PartialTransformationBatch = Schema.decodeUnknown(PartialTransformationBatchSchema)
export type PartialTransformationBatch = typeof PartialTransformationBatchSchema.Type

/**
 * Transformation mode selection
 */
export const TransformationModeSchema = Schema.Literal("single", "one-to-many", "batch").pipe(
  Schema.annotations({
    identifier: "TransformationMode",
    description: "Type of transformation to perform"
  })
)

export const TransformationMode = Schema.decodeUnknown(TransformationModeSchema)
export type TransformationMode = typeof TransformationModeSchema.Type

/**
 * Parsed transformation string (raw input before validation)
 *
 * This is used for the initial parsing phase before schema validation
 */
export const RawTransformationStringSchema = Schema.String.pipe(
  Schema.nonEmptyString(),
  Schema.filter((input) => {
    // Must contain the > operator
    return input.includes(">")
  }, {
    message: () => "Transformation syntax must contain '>' operator (e.g., 'ref>target::stop')"
  }),
  Schema.annotations({
    identifier: "RawTransformationString",
    description: "Raw transformation string input (must contain '>' operator)"
  })
)

export const RawTransformationString = Schema.decodeUnknown(RawTransformationStringSchema)
export type RawTransformationString = typeof RawTransformationStringSchema.Type
