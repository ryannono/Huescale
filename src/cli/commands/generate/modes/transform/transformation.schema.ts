/**
 * Schemas for color transformation syntax
 *
 * Defines schemas for parsing and validating transformation syntax like:
 * - ref>target::stop
 * - ref>(t1,t2)::stop
 */

import { Schema } from "effect"
import { ColorStringSchema } from "../../../../../domain/color/color.schema.js"
import { StopPositionSchema } from "../../../../../domain/palette/palette.schema.js"

// ============================================================================
// Component Schemas
// ============================================================================

/** Base one-to-many transformation structure (without stop requirement) */
const TransformationBatchBaseSchema = Schema.Struct({
  reference: ColorStringSchema,
  targets: Schema.NonEmptyArray(ColorStringSchema).pipe(
    Schema.annotations({
      description: "List of target colors to apply the reference's appearance to"
    })
  )
}).pipe(
  Schema.annotations({
    identifier: "TransformationBatchBase",
    description: "Base structure for one-to-many color transformations"
  })
)

// ============================================================================
// Schemas
// ============================================================================

/**
 * Single transformation request with stop: reference>target::stop
 *
 * Example: "2D72D2>238551::500"
 */
export const TransformationRequestSchema = Schema.Struct({
  reference: ColorStringSchema,
  target: ColorStringSchema,
  stop: StopPositionSchema
}).pipe(
  Schema.annotations({
    identifier: "TransformationRequest",
    description: "Complete transformation request with stop position (reference>target::stop)"
  })
)

export const TransformationRequest = Schema.decodeUnknown(TransformationRequestSchema)
export type TransformationRequest = typeof TransformationRequestSchema.Type

/**
 * Partial transformation request with optional stop: reference>target[::stop]
 */
export const PartialTransformationRequestSchema = TransformationRequestSchema.pipe(
  Schema.partial,
  Schema.annotations({
    identifier: "PartialTransformationRequest",
    description: "Transformation request with optional stop position"
  })
)

export const PartialTransformationRequest = Schema.decodeUnknown(PartialTransformationRequestSchema)
export type PartialTransformationRequest = typeof PartialTransformationRequestSchema.Type

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
