/**
 * Color schemas using Effect Schema
 *
 * All color types are defined using Effect Schema and TypeScript types are derived from them.
 * This ensures runtime validation matches compile-time types.
 */

import * as culori from "culori"
import { Schema } from "effect"

// ============================================================================
// Schema Combinators
// ============================================================================

/** Create a bounded number schema with inclusive range */
const BoundedNumber = (
  min: number,
  max: number,
  identifier: string,
  description: string
) =>
  Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(min),
    Schema.lessThanOrEqualTo(max),
    Schema.annotations({ identifier, description })
  )

/** Create a bounded number schema with exclusive upper bound */
const BoundedNumberExclusive = (
  min: number,
  maxExclusive: number,
  identifier: string,
  description: string
) =>
  Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(min),
    Schema.lessThan(maxExclusive),
    Schema.annotations({ identifier, description })
  )

/** Create a bounded integer schema */
const BoundedInt = (
  min: number,
  max: number,
  identifier: string,
  description: string
) =>
  Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(min),
    Schema.lessThanOrEqualTo(max),
    Schema.annotations({ identifier, description })
  )

// ============================================================================
// Component Schemas
// ============================================================================

/** Lightness (0-1) - shared by OKLCH and OKLAB */
export const LightnessSchema = BoundedNumber(0, 1, "Lightness", "Lightness value (0 = black, 1 = white)")

/** Chroma for OKLCH (0-0.5) */
export const ChromaSchema = BoundedNumber(0, 0.5, "Chroma", "Chroma value (0 = gray, 0.5 = maximum saturation)")

/** Hue angle (0 <= h < 360) */
export const HueSchema = BoundedNumberExclusive(
  0,
  360,
  "Hue",
  "Hue angle in degrees (0 = red, 120 = green, 240 = blue)"
)

/** RGB channel (0-255 integer) */
const RGBChannelSchema = (channel: string) => BoundedInt(0, 255, channel, `${channel} channel value (0-255)`)

/** Alpha channel (0-1) */
export const AlphaSchema = BoundedNumber(0, 1, "Alpha", "Alpha/opacity value (0 = transparent, 1 = opaque)")

/** Optional alpha with default of 1 */
const OptionalAlpha = Schema.optionalWith(AlphaSchema, { default: () => 1 })

// ============================================================================
// Validation Helpers
// ============================================================================

/** Pattern for hex color without # prefix */
export const HEX_WITHOUT_HASH_PATTERN = /^[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/

/** Normalize color string by adding # prefix for bare hex values */
const normalizeColorString = (value: string): string => HEX_WITHOUT_HASH_PATTERN.test(value) ? `#${value}` : value

/** Validate that a (potentially normalized) color parses with culori */
const canParseCulori = (value: string): boolean => culori.parse(normalizeColorString(value)) !== undefined

/** Validate a strict hex color (must already have #) */
const canParseHexCulori = (value: string): boolean => culori.parse(value) !== undefined

// ============================================================================
// Color Schemas
// ============================================================================

/** OKLCH color schema (perceptually uniform color space) */
export const OKLCHColorSchema = Schema.Struct({
  l: LightnessSchema,
  c: ChromaSchema,
  h: HueSchema,
  alpha: OptionalAlpha
}).pipe(
  Schema.annotations({
    identifier: "OKLCHColor",
    description: "OKLCH color representation"
  })
)

export const OKLCHColor = Schema.decodeUnknown(OKLCHColorSchema)
export type OKLCHColor = typeof OKLCHColorSchema.Type

/** OKLAB color schema (rectangular form of OKLCH) */
export const OKLABColorSchema = Schema.Struct({
  l: LightnessSchema,
  a: Schema.Number.pipe(Schema.annotations({ title: "Green-Red axis" })),
  b: Schema.Number.pipe(Schema.annotations({ title: "Blue-Yellow axis" })),
  alpha: OptionalAlpha
}).pipe(
  Schema.annotations({
    identifier: "OKLABColor",
    description: "OKLAB color representation"
  })
)

export const OKLABColor = Schema.decodeUnknown(OKLABColorSchema)
export type OKLABColor = typeof OKLABColorSchema.Type

/** RGB color schema */
export const RGBColorSchema = Schema.Struct({
  r: RGBChannelSchema("Red"),
  g: RGBChannelSchema("Green"),
  b: RGBChannelSchema("Blue"),
  alpha: OptionalAlpha
}).pipe(
  Schema.annotations({
    identifier: "RGBColor",
    description: "RGB color representation"
  })
)

export const RGBColor = Schema.decodeUnknown(RGBColorSchema)
export type RGBColor = typeof RGBColorSchema.Type

/** Hex color schema (branded string: #RRGGBB or #RRGGBBAA) */
export const HexColorSchema = Schema.String.pipe(
  Schema.pattern(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/, {
    message: () => "Invalid hex color format: expected #RRGGBB or #RRGGBBAA (e.g., #2D72D2 or #2D72D2FF)"
  }),
  Schema.filter(canParseHexCulori, {
    message: () => "Invalid hex color: could not be parsed by culori"
  }),
  Schema.brand("HexColor"),
  Schema.annotations({
    identifier: "HexColor",
    description: "Hexadecimal color string (#RRGGBB or #RRGGBBAA)"
  })
)

export const HexColor = Schema.decodeUnknown(HexColorSchema)
export type HexColor = typeof HexColorSchema.Type

/** Color string schema (accepts any format supported by culori) */
export const ColorStringSchema = Schema.String.pipe(
  Schema.filter(canParseCulori, {
    message: () =>
      "Invalid color: could not be parsed by culori. Try formats like: #2D72D2, 2D72D2, rgb(45, 114, 210), oklch(57% 0.15 259)"
  }),
  Schema.annotations({
    identifier: "ColorString",
    description: "Color string in any format supported by culori"
  })
)

export const ColorString = Schema.decodeUnknown(ColorStringSchema)
export type ColorString = typeof ColorStringSchema.Type

/** Color space schema */
export const ColorSpaceSchema = Schema.Literal("hex", "rgb", "oklch", "oklab").pipe(
  Schema.annotations({
    identifier: "ColorSpace",
    description: "Supported color spaces"
  })
)

export const ColorSpace = Schema.decodeUnknown(ColorSpaceSchema)
export type ColorSpace = typeof ColorSpaceSchema.Type
