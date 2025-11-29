/**
 * Mode detection schemas for the resolver.
 */

import { Schema } from "effect"
import { ColorStringSchema } from "../../../../domain/color/color.schema.js"
import { StopPositionSchema } from "../../../../domain/palette/palette.schema.js"
import { ColorAnchorSchema } from "../../../../services/PaletteService/palette.schema.js"
import {
  PartialTransformationBatchSchema,
  PartialTransformationRequestSchema,
  TransformationBatchSchema,
  TransformationRequestSchema
} from "../../../schemas/transformation.schema.js"

// ============================================================================
// Component Schemas
// ============================================================================

/** Color anchor with optional stop for interactive prompting. */
const PartialColorAnchorSchema = ColorAnchorSchema.pipe(
  Schema.omit("stop"),
  Schema.extend(Schema.Struct({ stop: Schema.optional(StopPositionSchema) })),
  Schema.annotations({
    identifier: "PartialColorAnchor",
    description: "Color anchor with optional stop position for interactive prompting"
  })
)

/** Single transformation request (complete or requiring stop prompt). */
const SingleTransformRequestSchema = Schema.Union(
  TransformationRequestSchema,
  PartialTransformationRequestSchema
).annotations({
  identifier: "SingleTransformRequest",
  description: "Request for a single color transformation"
})

/** Any transformation request type (single or batch, complete or partial). */
const AnyTransformationRequestSchema = Schema.Union(
  TransformationBatchSchema,
  PartialTransformationBatchSchema,
  TransformationRequestSchema,
  PartialTransformationRequestSchema
).annotations({
  identifier: "AnyTransformationRequest",
  description: "Union of all transformation request types"
})

// ============================================================================
// Mode Schemas
// ============================================================================

/** Single palette generation mode. */
const SinglePaletteModeSchema = Schema.TaggedStruct("SinglePalette", {
  color: Schema.optional(ColorStringSchema),
  stop: Schema.optional(StopPositionSchema)
}).annotations({
  identifier: "SinglePaletteMode",
  description: "Generate a single color palette"
})

/** Batch palette generation mode. */
const BatchPalettesModeSchema = Schema.TaggedStruct("BatchPalettes", {
  pairs: Schema.NonEmptyArray(PartialColorAnchorSchema)
}).annotations({
  identifier: "BatchPalettesMode",
  description: "Generate multiple palettes from color/stop pairs"
})

/** Single transformation mode. */
const SingleTransformModeSchema = Schema.TaggedStruct("SingleTransform", {
  input: SingleTransformRequestSchema
}).annotations({
  identifier: "SingleTransformMode",
  description: "Apply transformation from reference to target color"
})

/** One-to-many transformation mode. */
const ManyTransformModeSchema = Schema.TaggedStruct("ManyTransform", {
  reference: ColorStringSchema,
  targets: Schema.NonEmptyArray(ColorStringSchema),
  stop: Schema.optional(StopPositionSchema)
}).annotations({
  identifier: "ManyTransformMode",
  description: "Apply transformation from reference to multiple target colors"
})

/** Batch transformation mode. */
const BatchTransformModeSchema = Schema.TaggedStruct("BatchTransform", {
  transformations: Schema.NonEmptyArray(AnyTransformationRequestSchema)
}).annotations({
  identifier: "BatchTransformMode",
  description: "Apply multiple color transformations"
})

// ============================================================================
// Composite Schemas
// ============================================================================

/** Discriminated union of all execution modes. */
const ExecutionModeSchema = Schema.Union(
  SinglePaletteModeSchema,
  BatchPalettesModeSchema,
  SingleTransformModeSchema,
  ManyTransformModeSchema,
  BatchTransformModeSchema
).annotations({
  identifier: "ExecutionMode",
  description: "Execution mode for generate command"
})

export type ExecutionMode = typeof ExecutionModeSchema.Type

/** Mode detection result with mode and interaction flag. */
const ModeDetectionResultSchema = Schema.Struct({
  mode: ExecutionModeSchema,
  isInteractive: Schema.Boolean
}).annotations({
  identifier: "ModeDetectionResult",
  description: "Result of mode detection including execution mode and interaction flag"
})

export type ModeDetectionResult = typeof ModeDetectionResultSchema.Type

// ============================================================================
// Public API
// ============================================================================

export const SinglePaletteMode = Schema.decodeUnknown(SinglePaletteModeSchema)
export const BatchPalettesMode = Schema.decodeUnknown(BatchPalettesModeSchema)
export const SingleTransformMode = Schema.decodeUnknown(SingleTransformModeSchema)
export const ManyTransformMode = Schema.decodeUnknown(ManyTransformModeSchema)
export const BatchTransformMode = Schema.decodeUnknown(BatchTransformModeSchema)
export const ModeDetectionResult = Schema.decodeUnknown(ModeDetectionResultSchema)
