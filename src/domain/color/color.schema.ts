/**
 * Color schemas using Effect Schema
 *
 * All color types are defined using Effect Schema and TypeScript types are derived from them.
 * This ensures runtime validation matches compile-time types.
 *
 * Uses culori for color parsing and validation to ensure consistency with conversion functions.
 */

import * as culori from "culori"
import { Effect, Schema } from "effect"
import { ColorConversionError, ColorParseError } from "./errors.js"

/**
 * OKLCH Color Schema
 *
 * OKLCH (Oklabch) is a perceptually uniform color space
 *
 * - l: Lightness [0, 1] where 0 is black and 1 is white
 * - c: Chroma (colorfulness) [0, ~0.4] where 0 is achromatic
 * - h: Hue angle in degrees [0, 360)
 * - alpha: Transparency [0, 1]
 */
export const OKLCHColorSchema = Schema.Struct({
  l: Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(1),
    Schema.annotations({
      title: "Lightness",
      description: "Lightness value from 0 (black) to 1 (white)"
    })
  ),
  c: Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(0.5), // Practical max for displayable colors
    Schema.annotations({
      title: "Chroma",
      description: "Chroma (colorfulness) where 0 is gray"
    })
  ),
  h: Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThan(360),
    Schema.annotations({
      title: "Hue",
      description: "Hue angle in degrees [0, 360)"
    })
  ),
  alpha: Schema.optionalWith(
    Schema.Number.pipe(
      Schema.greaterThanOrEqualTo(0),
      Schema.lessThanOrEqualTo(1),
      Schema.annotations({
        title: "Alpha",
        description: "Transparency from 0 (transparent) to 1 (opaque)"
      })
    ),
    { default: () => 1 }
  )
}).pipe(
  Schema.annotations({
    identifier: "OKLCHColor",
    description: "OKLCH color representation"
  })
)

export const OKLCHColor = Schema.decodeUnknown(OKLCHColorSchema)
export type OKLCHColor = typeof OKLCHColorSchema.Type

/**
 * RGB Color Schema
 *
 * - r: Red channel [0, 255]
 * - g: Green channel [0, 255]
 * - b: Blue channel [0, 255]
 * - alpha: Transparency [0, 1]
 */
export const RGBColorSchema = Schema.Struct({
  r: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(255),
    Schema.annotations({ title: "Red" })
  ),
  g: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(255),
    Schema.annotations({ title: "Green" })
  ),
  b: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(255),
    Schema.annotations({ title: "Blue" })
  ),
  alpha: Schema.optionalWith(
    Schema.Number.pipe(
      Schema.greaterThanOrEqualTo(0),
      Schema.lessThanOrEqualTo(1),
      Schema.annotations({ title: "Alpha" })
    ),
    { default: () => 1 }
  )
}).pipe(
  Schema.annotations({
    identifier: "RGBColor",
    description: "RGB color representation"
  })
)

export const RGBColor = Schema.decodeUnknown(RGBColorSchema)
export type RGBColor = typeof RGBColorSchema.Type

/**
 * Hex Color Schema (branded string)
 *
 * Format: #RRGGBB or #RRGGBBAA
 * Uses culori.parse for validation to ensure the color is actually parseable
 */
export const HexColorSchema = Schema.String.pipe(
  Schema.pattern(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/),
  Schema.filter((value) => {
    const parsed = culori.parse(value)
    return parsed !== undefined
  }, {
    message: () => "Invalid color: could not be parsed by culori"
  }),
  Schema.brand("HexColor"),
  Schema.annotations({
    identifier: "HexColor",
    description: "Hexadecimal color string (#RRGGBB or #RRGGBBAA)"
  })
)

export const HexColor = Schema.decodeUnknown(HexColorSchema)
export type HexColor = typeof HexColorSchema.Type

/**
 * General color string input schema (accepts various formats)
 *
 * Accepts hex, rgb(), hsl(), oklch(), etc. - anything culori can parse
 * Also accepts hex colors without # prefix (e.g., "2D72D2")
 */
export const ColorStringSchema = Schema.String.pipe(
  Schema.filter((value) => {
    // Auto-add # to hex colors without it for validation
    const normalizedValue = /^[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(value) ? `#${value}` : value
    const parsed = culori.parse(normalizedValue)
    return parsed !== undefined
  }, {
    message: () =>
      "Invalid color: could not be parsed by culori. Try formats like: #2D72D2, 2D72D2, rgb(45, 114, 210), oklch(57% 0.15 259)"
  }),
  Schema.annotations({
    identifier: "ColorString",
    description: "Color string in any format supported by culori (hex, rgb(), hsl(), oklch(), etc.)"
  })
)

export const ColorString = Schema.decodeUnknown(ColorStringSchema)
export type ColorString = typeof ColorStringSchema.Type

/**
 * Parse a color string to OKLCH using culori
 *
 * Returns an Effect that can fail with ColorParseError or ColorConversionError
 */
export const parseColorStringToOKLCH = (
  colorString: string
): Effect.Effect<OKLCHColor, ColorParseError | ColorConversionError> =>
  Effect.gen(function*() {
    // Normalize: add # to hex colors without it
    const normalizedColor = /^[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(colorString)
      ? `#${colorString}`
      : colorString

    const parsed = culori.parse(normalizedColor)
    if (!parsed) {
      return yield* Effect.fail(
        new ColorParseError({
          input: colorString,
          reason: "Could not parse color string with culori"
        })
      )
    }

    const oklch = culori.oklch(parsed)
    if (!oklch) {
      return yield* Effect.fail(
        new ColorConversionError({
          fromSpace: parsed.mode ?? "unknown",
          toSpace: "oklch",
          color: parsed,
          reason: "Culori could not convert parsed color to OKLCH"
        })
      )
    }

    return {
      l: oklch.l ?? 0,
      c: oklch.c ?? 0,
      h: oklch.h ?? 0,
      alpha: oklch.alpha ?? 1
    }
  })

/**
 * OKLAB Color Schema
 *
 * OKLAB is the rectangular form of OKLCH
 *
 * - l: Lightness [0, 1]
 * - a: Green-red axis
 * - b: Blue-yellow axis
 * - alpha: Transparency [0, 1]
 */
export const OKLABColorSchema = Schema.Struct({
  l: Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(1),
    Schema.annotations({ title: "Lightness" })
  ),
  a: Schema.Number.pipe(
    Schema.annotations({ title: "Green-Red axis" })
  ),
  b: Schema.Number.pipe(
    Schema.annotations({ title: "Blue-Yellow axis" })
  ),
  alpha: Schema.optionalWith(
    Schema.Number.pipe(
      Schema.greaterThanOrEqualTo(0),
      Schema.lessThanOrEqualTo(1),
      Schema.annotations({ title: "Alpha" })
    ),
    { default: () => 1 }
  )
}).pipe(
  Schema.annotations({
    identifier: "OKLABColor",
    description: "OKLAB color representation"
  })
)

export const OKLABColor = Schema.decodeUnknown(OKLABColorSchema)
export type OKLABColor = typeof OKLABColorSchema.Type

/**
 * Color Space Schema
 */
export const ColorSpaceSchema = Schema.Literal("hex", "rgb", "oklch", "oklab").pipe(
  Schema.annotations({
    identifier: "ColorSpace",
    description: "Supported color spaces"
  })
)

export const ColorSpace = Schema.decodeUnknown(ColorSpaceSchema)
export type ColorSpace = typeof ColorSpaceSchema.Type
