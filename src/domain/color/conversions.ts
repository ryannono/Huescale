/**
 * Pure color conversion functions using culori
 *
 * All functions return Effects and use schema decoders for proper validation.
 * OKLCH is used as the internal representation for all color manipulations.
 *
 * Note: For input parsing from strings, use `parseColorStringToOKLCH` from schemas/color.ts
 */

import * as culori from "culori"
import { Effect } from "effect"
import type { ParseError } from "effect/ParseResult"
import {
  HexColor,
  type HexColor as HexColorType,
  type OKLABColor,
  OKLABColor as OKLABColorDecoder,
  type OKLCHColor,
  type RGBColor
} from "./color.schema.js"
import { ColorConversionError } from "./errors.js"

/**
 * Convert OKLCH to hex string
 * Returns an Effect that validates the result with HexColor schema
 */
export const oklchToHex = (
  color: OKLCHColor
): Effect.Effect<HexColorType, ColorConversionError | ParseError> =>
  Effect.tryMap(
    Effect.sync(() =>
      culori.formatHex({
        mode: "oklch",
        l: color.l,
        c: color.c,
        h: color.h,
        alpha: color.alpha
      })
    ),
    {
      try: (hex) => {
        if (!hex) {
          throw new Error("Culori could not format OKLCH as hex")
        }
        // Remove alpha channel if fully opaque
        return color.alpha === 1 ? hex.slice(0, 7) : hex
      },
      catch: (error) =>
        new ColorConversionError({
          fromSpace: "oklch",
          toSpace: "hex",
          color,
          reason: error instanceof Error ? error.message : String(error)
        })
    }
  ).pipe(Effect.flatMap(HexColor))

/**
 * Convert OKLCH to RGB
 */
export const oklchToRGB = (
  color: OKLCHColor
): Effect.Effect<RGBColor, ColorConversionError> =>
  Effect.tryMap(
    Effect.sync(() =>
      culori.rgb({
        mode: "oklch",
        l: color.l,
        c: color.c,
        h: color.h,
        alpha: color.alpha
      })
    ),
    {
      try: (rgb) => {
        if (!rgb) {
          throw new Error("Culori could not convert OKLCH to RGB")
        }
        return {
          r: Math.round((rgb.r ?? 0) * 255),
          g: Math.round((rgb.g ?? 0) * 255),
          b: Math.round((rgb.b ?? 0) * 255),
          alpha: rgb.alpha ?? 1
        }
      },
      catch: (error) =>
        new ColorConversionError({
          fromSpace: "oklch",
          toSpace: "rgb",
          color,
          reason: error instanceof Error ? error.message : String(error)
        })
    }
  )

/**
 * Convert RGB to OKLCH
 */
export const rgbToOKLCH = (
  color: RGBColor
): Effect.Effect<OKLCHColor, ColorConversionError> =>
  Effect.tryMap(
    Effect.sync(() =>
      culori.oklch({
        mode: "rgb",
        r: color.r / 255,
        g: color.g / 255,
        b: color.b / 255,
        alpha: color.alpha
      })
    ),
    {
      try: (oklch) => {
        if (!oklch) {
          throw new Error("Culori could not convert RGB to OKLCH")
        }
        return {
          l: oklch.l ?? 0,
          c: oklch.c ?? 0,
          h: oklch.h ?? 0,
          alpha: oklch.alpha ?? 1
        }
      },
      catch: (error) =>
        new ColorConversionError({
          fromSpace: "rgb",
          toSpace: "oklch",
          color,
          reason: error instanceof Error ? error.message : String(error)
        })
    }
  )

/**
 * Convert OKLCH to OKLAB
 */
export const oklchToOKLAB = (
  color: OKLCHColor
): Effect.Effect<OKLABColor, ColorConversionError | ParseError> =>
  Effect.tryMap(
    Effect.sync(() =>
      culori.oklab({
        mode: "oklch",
        l: color.l,
        c: color.c,
        h: color.h,
        alpha: color.alpha
      })
    ),
    {
      try: (oklab) => {
        if (!oklab) {
          throw new Error("Culori could not convert OKLCH to OKLAB")
        }
        return {
          l: oklab.l ?? 0,
          a: oklab.a ?? 0,
          b: oklab.b ?? 0,
          alpha: oklab.alpha ?? 1
        }
      },
      catch: (error) =>
        new ColorConversionError({
          fromSpace: "oklch",
          toSpace: "oklab",
          color,
          reason: error instanceof Error ? error.message : String(error)
        })
    }
  ).pipe(Effect.flatMap(OKLABColorDecoder))

/**
 * Convert OKLAB to OKLCH
 */
export const oklabToOKLCH = (
  color: OKLABColor
): Effect.Effect<OKLCHColor, ColorConversionError> =>
  Effect.tryMap(
    Effect.sync(() =>
      culori.oklch({
        mode: "oklab",
        l: color.l,
        a: color.a,
        b: color.b,
        alpha: color.alpha
      })
    ),
    {
      try: (oklch) => {
        if (!oklch) {
          throw new Error("Culori could not convert OKLAB to OKLCH")
        }
        return {
          l: oklch.l ?? 0,
          c: oklch.c ?? 0,
          h: oklch.h ?? 0,
          alpha: oklch.alpha ?? 1
        }
      },
      catch: (error) =>
        new ColorConversionError({
          fromSpace: "oklab",
          toSpace: "oklch",
          color,
          reason: error instanceof Error ? error.message : String(error)
        })
    }
  )

/**
 * Check if a color is displayable in sRGB gamut
 */
export const isDisplayable = (color: OKLCHColor): Effect.Effect<boolean, never> =>
  Effect.sync(() =>
    culori.displayable({
      mode: "oklch",
      l: color.l,
      c: color.c,
      h: color.h,
      alpha: color.alpha
    })
  )

/**
 * Clamp a color to the displayable sRGB gamut by reducing chroma
 */
export const clampToGamut = (
  color: OKLCHColor
): Effect.Effect<OKLCHColor, ColorConversionError> =>
  Effect.tryMap(
    Effect.sync(() =>
      culori.clampChroma(
        {
          mode: "oklch",
          l: color.l,
          c: color.c,
          h: color.h,
          alpha: color.alpha
        },
        "oklch"
      )
    ),
    {
      try: (clamped) => {
        if (!clamped || clamped.mode !== "oklch") {
          throw new Error("Culori could not clamp color to gamut")
        }
        return {
          l: clamped.l ?? color.l,
          c: clamped.c ?? color.c,
          h: clamped.h ?? color.h,
          alpha: clamped.alpha ?? color.alpha
        }
      },
      catch: (error) =>
        new ColorConversionError({
          fromSpace: "oklch",
          toSpace: "oklch",
          color,
          reason: error instanceof Error ? error.message : String(error)
        })
    }
  )

/**
 * Normalize hue to [0, 360) range
 */
export const normalizeHue = (hue: number): number => {
  const normalized = hue % 360
  return normalized < 0 ? normalized + 360 : normalized
}

/**
 * Calculate the difference between two hues (accounting for circularity)
 * Returns the shortest angular distance between h1 and h2
 */
export const hueDifference = (h1: number, h2: number): number => {
  const diff = ((h2 - h1 + 180) % 360) - 180
  return diff < -180 ? diff + 360 : diff
}

/**
 * Clamp a value between min and max
 */
export const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value))
}
