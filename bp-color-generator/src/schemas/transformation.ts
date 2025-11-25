/**
 * Schemas for color transformation syntax
 *
 * Defines schemas for parsing and validating transformation syntax like:
 * - ref>target::stop
 * - ref>(t1,t2)::stop
 */

import { Schema } from "effect"
import { ColorStringSchema } from "./color.js"
import { StopPositionSchema } from "./palette.js"

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
 * One-to-many transformation: reference>(t1,t2,t3)::stop
 *
 * Example: "2D72D2>(238551,DC143C,FF6B6B)::500"
 */
export const TransformationBatchSchema = Schema.Struct({
  reference: ColorStringSchema,
  targets: Schema.Array(ColorStringSchema).pipe(
    Schema.minItems(1),
    Schema.annotations({
      description: "List of target colors to apply the reference's appearance to"
    })
  ),
  stop: StopPositionSchema
}).pipe(
  Schema.annotations({
    identifier: "TransformationBatch",
    description: "One-to-many transformation (reference>(t1,t2,...)::stop)"
  })
)

export const TransformationBatch = Schema.decodeUnknown(TransformationBatchSchema)
export type TransformationBatch = typeof TransformationBatchSchema.Type

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
