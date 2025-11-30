/**
 * DTCG (Design Tokens Community Group) Schema Definitions
 *
 * Implements the DTCG 2025.10 specification for color design tokens.
 * Uses strict structured color values per spec compliance.
 *
 * @see https://www.designtokens.org/tr/drafts/format/
 * @see https://github.com/design-tokens/community-group/blob/main/technical-reports/color/color-type.md
 */

import { Schema } from "effect"
import {
  AlphaSchema,
  ChromaSchema,
  ColorSpaceSchema,
  ColorStringSchema,
  HexColorSchema,
  HueSchema,
  LightnessSchema
} from "../color/color.schema.js"
import { GenerationFailureSchema, ISOTimestampSchema, StopPositionSchema } from "../palette/palette.schema.js"

// ============================================================================
// Constants
// ============================================================================

/** DTCG color type identifier */
const DTCG_COLOR_TYPE = "color" as const

/** Extension namespace for oklch-palette-generator metadata */
export const EXTENSION_NAMESPACE = "oklch-palette-generator" as const

// ============================================================================
// DTCG Color Value Schema (Spec-Compliant)
// ============================================================================

/** OKLCH color space literal extracted from ColorSpaceSchema */
const OKLCHColorSpaceSchema = ColorSpaceSchema.pipe(
  Schema.pickLiteral("oklch")
)

/**
 * DTCG Color Value Schema (2025.10 Spec)
 *
 * Per spec:
 * - colorSpace (required): string identifying the color space
 * - components (required): array of numbers (OKLCH = [L, C, H])
 * - alpha (optional): number 0-1, defaults to 1 if omitted
 * - hex (optional): 6-digit CSS hex fallback (#RRGGBB)
 *
 * @example
 * {
 *   "colorSpace": "oklch",
 *   "components": [0.628, 0.148, 259.1],
 *   "alpha": 1,
 *   "hex": "#2D72D2"
 * }
 */
export const DTCGColorValueSchema = Schema.Struct({
  colorSpace: OKLCHColorSpaceSchema,
  components: Schema.Tuple(LightnessSchema, ChromaSchema, HueSchema),
  alpha: Schema.optional(AlphaSchema),
  hex: Schema.optional(HexColorSchema)
}).pipe(
  Schema.annotations({
    identifier: "DTCGColorValue",
    description: "DTCG 2025.10 structured color value with oklch components"
  })
)

export type DTCGColorValue = typeof DTCGColorValueSchema.Type

// ============================================================================
// Extension Metadata Schemas
// ============================================================================

/** Stop-level extension metadata */
export const StopExtensionMetadataSchema = Schema.Struct({
  position: StopPositionSchema,
  formattedValue: ColorStringSchema
}).pipe(
  Schema.annotations({
    identifier: "StopExtensionMetadata",
    description: "Stop-level extension metadata including formatted output value"
  })
)

export type StopExtensionMetadata = typeof StopExtensionMetadataSchema.Type

/** Palette-level extension metadata */
export const PaletteExtensionMetadataSchema = Schema.Struct({
  inputColor: ColorStringSchema,
  anchorStop: StopPositionSchema,
  outputFormat: ColorSpaceSchema
}).pipe(
  Schema.annotations({
    identifier: "PaletteExtensionMetadata",
    description: "Palette-level generation metadata"
  })
)

export type PaletteExtensionMetadata = typeof PaletteExtensionMetadataSchema.Type

/** Batch-level extension metadata */
export const BatchExtensionMetadataSchema = Schema.Struct({
  outputFormat: ColorSpaceSchema,
  generatedAt: ISOTimestampSchema,
  failures: Schema.optional(Schema.Array(GenerationFailureSchema))
}).pipe(
  Schema.annotations({
    identifier: "BatchExtensionMetadata",
    description: "Batch-level generation metadata"
  })
)

export type BatchExtensionMetadata = typeof BatchExtensionMetadataSchema.Type

// ============================================================================
// DTCG Token Schemas
// ============================================================================

/** Record schema for extensions object */
const ExtensionsRecordSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Unknown
})

/**
 * DTCG Color Token Schema
 *
 * A complete DTCG color token with type, value, and optional extensions.
 */
export const DTCGColorTokenSchema = Schema.Struct({
  $type: Schema.Literal(DTCG_COLOR_TYPE),
  $value: DTCGColorValueSchema,
  $description: Schema.optional(Schema.String),
  $extensions: Schema.optional(ExtensionsRecordSchema)
}).pipe(
  Schema.annotations({
    identifier: "DTCGColorToken",
    description: "DTCG 2025.10 color token with structured value"
  })
)

export type DTCGColorToken = typeof DTCGColorTokenSchema.Type

/**
 * DTCG Token Group Schema
 *
 * A group of tokens with optional group-level metadata.
 */
export const DTCGTokenGroupSchema = Schema.Struct({
  $type: Schema.optional(Schema.Literal(DTCG_COLOR_TYPE)),
  $description: Schema.optional(Schema.String),
  $extensions: Schema.optional(ExtensionsRecordSchema)
}).pipe(
  Schema.annotations({
    identifier: "DTCGTokenGroup",
    description: "DTCG token group with optional metadata"
  })
)

export type DTCGTokenGroup = typeof DTCGTokenGroupSchema.Type

// ============================================================================
// Decoders
// ============================================================================

/** Decode unknown value to DTCGColorValue */
export const decodeDTCGColorValue = Schema.decodeUnknown(DTCGColorValueSchema)

/** Decode unknown value to DTCGColorToken */
export const decodeDTCGColorToken = Schema.decodeUnknown(DTCGColorTokenSchema)

/** Decode unknown value to StopExtensionMetadata */
export const decodeStopExtensionMetadata = Schema.decodeUnknown(
  StopExtensionMetadataSchema
)

/** Decode unknown value to PaletteExtensionMetadata */
export const decodePaletteExtensionMetadata = Schema.decodeUnknown(
  PaletteExtensionMetadataSchema
)

/** Decode unknown value to BatchExtensionMetadata */
export const decodeBatchExtensionMetadata = Schema.decodeUnknown(
  BatchExtensionMetadataSchema
)

// ============================================================================
// Type Helpers for Building DTCG Structures
// ============================================================================

/** Maps stop position names to color tokens */
export interface DTCGPaletteStops {
  readonly [stopName: string]: DTCGColorToken
}

/** Complete palette with group metadata and stop tokens */
export interface DTCGPalette extends DTCGTokenGroup {
  readonly [stopName: string]:
    | DTCGColorToken
    | DTCGTokenGroup[keyof DTCGTokenGroup]
}

/** Root DTCG export document */
export interface DTCGExportDocument {
  readonly $description?: string
  readonly $extensions?: {
    readonly [namespace: string]: unknown
  }
  readonly [paletteName: string]:
    | DTCGPalette
    | string
    | { readonly [namespace: string]: unknown }
    | undefined
}
