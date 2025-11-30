/**
 * Color formatting utilities for converting OKLCH colors to various output formats.
 *
 * Pure functions for formatting colors as strings in hex, RGB, OKLCH, and OKLAB formats.
 */

import { Effect } from "effect"
import type { ParseError } from "effect/ParseResult"
import type { FormattedStop, PaletteStop } from "../palette/palette.schema.js"
import type { ColorError } from "./color.js"
import { oklchToHex, oklchToOKLAB, oklchToRGB } from "./color.js"
import type { ColorSpace, OKLABColor, OKLCHColor, RGBColor } from "./color.schema.js"

// ============================================================================
// Constants
// ============================================================================

/** Alpha value representing full opacity (no transparency) */
const FULL_OPACITY = 1

/** Multiplier to convert lightness from 0-1 to percentage */
const LIGHTNESS_TO_PERCENT = 100

/** Decimal places for lightness percentage display */
const LIGHTNESS_PRECISION = 2

/** Decimal places for chroma value display */
const CHROMA_PRECISION = 3

/** Decimal places for hue angle display */
const HUE_PRECISION = 1

/** Decimal places for OKLAB a/b axis display */
const OKLAB_AXIS_PRECISION = 3

// ============================================================================
// Types
// ============================================================================

/** Function that converts an OKLCH color to a formatted string */
export type ColorFormatter = (color: OKLCHColor) => Effect.Effect<string, ColorError | ParseError>

// ============================================================================
// Internal Helpers
// ============================================================================

/** Check if color has partial transparency */
const hasTransparency = (alpha: number): boolean => alpha !== FULL_OPACITY

/** Format alpha suffix for CSS color functions */
const formatAlphaSuffix = (alpha: number, separator: string): string =>
  hasTransparency(alpha) ? `${separator}${alpha}` : ""

/** Format lightness as CSS percentage */
const formatLightness = (l: number): string => `${(l * LIGHTNESS_TO_PERCENT).toFixed(LIGHTNESS_PRECISION)}%`

/** Format chroma value */
const formatChroma = (c: number): string => c.toFixed(CHROMA_PRECISION)

/** Format hue angle */
const formatHue = (h: number): string => h.toFixed(HUE_PRECISION)

/** Format OKLAB axis value */
const formatOKLABAxis = (value: number): string => value.toFixed(OKLAB_AXIS_PRECISION)

// ============================================================================
// Pure Formatters
// ============================================================================

/** Format an RGB color as a CSS rgb() string */
export const formatRGB = (rgb: RGBColor): string =>
  `rgb(${rgb.r}, ${rgb.g}, ${rgb.b}${formatAlphaSuffix(rgb.alpha, ", ")})`

/** Format an OKLCH color as a CSS oklch() string */
export const formatOKLCH = (color: OKLCHColor): string =>
  `oklch(${formatLightness(color.l)} ${formatChroma(color.c)} ${formatHue(color.h)}${
    formatAlphaSuffix(color.alpha, " / ")
  })`

/** Format an OKLAB color as a CSS oklab() string */
export const formatOKLAB = (oklab: OKLABColor): string =>
  `oklab(${formatLightness(oklab.l)} ${formatOKLABAxis(oklab.a)} ${formatOKLABAxis(oklab.b)}${
    formatAlphaSuffix(oklab.alpha, " / ")
  })`

// ============================================================================
// Color Conversion + Formatting
// ============================================================================

/** Map of color space to formatter function */
const colorFormatters = {
  hex: oklchToHex,
  rgb: (color: OKLCHColor) => oklchToRGB(color).pipe(Effect.map(formatRGB)),
  oklch: (color: OKLCHColor) => Effect.succeed(formatOKLCH(color)),
  oklab: (color: OKLCHColor) => oklchToOKLAB(color).pipe(Effect.map(formatOKLAB))
} satisfies Record<ColorSpace, ColorFormatter>

/**
 * Convert an OKLCH color to a formatted string in the specified format.
 *
 * @param color - The OKLCH color to format
 * @param format - The output format (hex, rgb, oklch, oklab)
 * @returns Effect containing the formatted color string
 */
export const formatColor = (
  color: OKLCHColor,
  format: ColorSpace
): Effect.Effect<string, ColorError | ParseError> => colorFormatters[format](color)

/**
 * Format an array of palette stops in the specified output format.
 *
 * @param stops - Array of stops with color and position
 * @param outputFormat - The output format for color values
 * @returns Effect containing array of formatted stops
 */
export const formatPaletteStops = (
  stops: ReadonlyArray<PaletteStop>,
  outputFormat: ColorSpace
): Effect.Effect<ReadonlyArray<FormattedStop>, ColorError | ParseError> =>
  Effect.forEach(
    stops,
    (stop) =>
      formatColor(stop.color, outputFormat).pipe(
        Effect.map((value): FormattedStop => ({
          color: stop.color,
          position: stop.position,
          value
        }))
      ),
    { concurrency: "unbounded" }
  )
