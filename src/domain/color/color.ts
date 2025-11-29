/**
 * Color operations: parsing, conversions, and transformations
 *
 * All functions return Effects and use schema decoders for proper validation.
 * OKLCH is used as the internal representation for all color manipulations.
 *
 * Code organization:
 * 1. Errors - Tagged error types
 * 2. Constants - Threshold values and regex patterns
 * 3. Public API - Exported functions for color operations
 * 4. Helpers - Internal effectful helpers
 * 5. Utils - Pure utility functions
 */

import * as culori from "culori"
import { Data, Effect, Either, Option, pipe } from "effect"
import type { ParseError } from "effect/ParseResult"
import {
  HexColor,
  type HexColor as HexColorType,
  type OKLABColor,
  OKLABColor as OKLABColorDecoder,
  type OKLCHColor,
  type RGBColor
} from "./color.schema.js"

// ============================================================================
// Errors
// ============================================================================

/**
 * Error when color operations fail (parsing, conversions, transformations)
 */
export class ColorError extends Data.TaggedError("ColorError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ============================================================================
// Constants
// ============================================================================

/** Regex pattern for hex colors without # prefix */
const HEX_WITHOUT_HASH_PATTERN = /^[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/

/** Lightness threshold below which transformations may not work well (near black) */
const MIN_VIABLE_LIGHTNESS = 0.05

/** Lightness threshold above which transformations may not work well (near white) */
const MAX_VIABLE_LIGHTNESS = 0.95

/** Maximum acceptable chroma loss ratio for viable transformations */
const MAX_CHROMA_LOSS_RATIO = 0.5

/** Default mode string when culori doesn't provide one */
const UNKNOWN_COLOR_MODE = "unknown"

// ============================================================================
// Public API - Parsing
// ============================================================================

/**
 * Parse a color string to OKLCH using culori
 */
export const parseColorStringToOKLCH = (
  colorString: string
): Effect.Effect<OKLCHColor, ColorError> =>
  Effect.gen(function*() {
    const normalized = normalizeColorString(colorString)
    const parsed = yield* parseCuloriColor(normalized).pipe(
      Option.match({
        onNone: () => Effect.fail(colorError(`Could not parse color string with culori: ${colorString}`)),
        onSome: Effect.succeed
      })
    )
    return yield* culoriToOklch(parsed, parsed.mode ?? UNKNOWN_COLOR_MODE)
  })

// ============================================================================
// Public API - Conversions
// ============================================================================

/**
 * Convert OKLCH to hex string
 */
export const oklchToHex = (
  color: OKLCHColor
): Effect.Effect<HexColorType, ColorError | ParseError> =>
  convertWithCulori(
    () => culori.formatHex(toCuloriOklch(color)),
    (hex): hex is string => hex !== undefined,
    (hex) => (color.alpha === 1 ? hex.slice(0, 7) : hex),
    "Could not convert OKLCH to hex",
    "Culori could not format OKLCH as hex"
  )(color).pipe(Effect.flatMap(HexColor))

/**
 * Convert OKLCH to RGB
 */
export const oklchToRGB = (
  color: OKLCHColor
): Effect.Effect<RGBColor, ColorError> =>
  convertWithCulori(
    () => culori.rgb(toCuloriOklch(color)),
    (rgb): rgb is culori.Rgb => rgb !== undefined,
    fromCuloriRgb,
    "Could not convert OKLCH to RGB",
    "Culori could not convert OKLCH to RGB"
  )(color)

/**
 * Convert RGB to OKLCH
 */
export const rgbToOKLCH = (
  color: RGBColor
): Effect.Effect<OKLCHColor, ColorError> =>
  convertWithCulori(
    () => culori.oklch(toCuloriRgb(color)),
    (oklch): oklch is culori.Oklch => oklch !== undefined,
    fromCuloriOklch,
    "Could not convert RGB to OKLCH",
    "Culori could not convert RGB to OKLCH"
  )(color)

/**
 * Convert OKLCH to OKLAB
 */
export const oklchToOKLAB = (
  color: OKLCHColor
): Effect.Effect<OKLABColor, ColorError | ParseError> =>
  pipe(
    Effect.try({
      try: () => culori.oklab(toCuloriOklch(color)),
      catch: (error) => colorError("Could not convert OKLCH to OKLAB", error)
    }),
    Effect.filterOrFail(
      (oklab): oklab is culori.Oklab => oklab !== undefined,
      () => colorError("Culori could not convert OKLCH to OKLAB")
    ),
    Effect.map(fromCuloriOklab),
    Effect.flatMap(OKLABColorDecoder)
  )

/**
 * Convert OKLAB to OKLCH
 */
export const oklabToOKLCH = (
  color: OKLABColor
): Effect.Effect<OKLCHColor, ColorError> =>
  convertWithCulori(
    () => culori.oklch(toCuloriOklab(color)),
    (oklch): oklch is culori.Oklch => oklch !== undefined,
    fromCuloriOklch,
    "Could not convert OKLAB to OKLCH",
    "Culori could not convert OKLAB to OKLCH"
  )(color)

// ============================================================================
// Public API - Gamut Operations
// ============================================================================

/**
 * Check if a color is displayable in sRGB gamut
 */
export const isDisplayable = (
  color: OKLCHColor
): Effect.Effect<boolean, never> => Effect.sync(() => culori.displayable(toCuloriOklch(color)))

/**
 * Clamp a color to the displayable sRGB gamut by reducing chroma
 */
export const clampToGamut = (
  color: OKLCHColor
): Effect.Effect<OKLCHColor, ColorError> =>
  pipe(
    Effect.try({
      try: () => culori.clampChroma(toCuloriOklch(color), "oklch"),
      catch: (error) => colorError("Could not clamp OKLCH color to gamut", error)
    }),
    Effect.filterOrFail(
      (clamped): clamped is culori.Oklch => clamped !== undefined && clamped.mode === "oklch",
      () => colorError("Culori could not clamp color to gamut")
    ),
    Effect.map((clamped) => ({
      l: clamped.l ?? color.l,
      c: clamped.c ?? color.c,
      h: clamped.h ?? color.h,
      alpha: clamped.alpha ?? color.alpha
    }))
  )

// ============================================================================
// Public API - Transformations
// ============================================================================

/**
 * Apply optical appearance from reference color to target color
 *
 * Takes the lightness and chroma from the reference color and applies them
 * to the target color's hue. This preserves the "look and feel" (brightness
 * and saturation) of the reference while changing the hue to match the target.
 *
 * @param reference - The color to take L and C from
 * @param target - The color to take H from
 * @returns Effect containing the transformed color or an error
 *
 * @example
 * ```typescript
 * // Apply blue's appearance to green's hue
 * const blue: OKLCHColor = { l: 0.57, c: 0.15, h: 259, alpha: 1 }
 * const green: OKLCHColor = { l: 0.62, c: 0.18, h: 140, alpha: 1 }
 * const transformed = yield* applyOpticalAppearance(blue, green)
 * // Result: { l: 0.57, c: 0.15, h: 140, alpha: 1 } - blue's L+C with green's H
 * ```
 */
export const applyOpticalAppearance = (
  reference: OKLCHColor,
  target: OKLCHColor
): Effect.Effect<OKLCHColor, ColorError> =>
  Effect.gen(function*() {
    // Handle achromatic reference (gray reference)
    // When reference has no chroma, we keep the target's hue but make it achromatic
    if (isAchromatic(reference)) {
      return {
        l: reference.l,
        c: 0,
        h: normalizeHue(target.h),
        alpha: reference.alpha
      }
    }

    // Handle achromatic target (gray target)
    // When target has no hue, preserve the reference's hue since target has no opinion
    if (isAchromatic(target)) {
      return {
        l: reference.l,
        c: reference.c,
        h: normalizeHue(reference.h),
        alpha: reference.alpha
      }
    }

    // Create transformed color: reference L+C, target H
    const transformed: OKLCHColor = {
      l: reference.l,
      c: reference.c,
      h: normalizeHue(target.h),
      alpha: reference.alpha
    }

    // Check if color is displayable in sRGB
    const displayable = yield* isDisplayable(transformed)

    if (displayable) {
      return transformed
    }

    // If not displayable, clamp to gamut by reducing chroma
    // This preserves hue but reduces saturation until the color fits in sRGB
    const clamped = yield* clampToGamut(transformed)

    // If clamping resulted in zero chroma, fail with hue loss error
    if (clamped.c === 0 && transformed.c > 0) {
      return yield* Effect.fail(
        colorError(
          "Transformed color is out of gamut and clamping reduced chroma to 0, losing hue information"
        )
      )
    }

    return clamped
  })

/**
 * Check if a transformation is viable without significant quality loss
 */
export const isTransformationViable = (
  reference: OKLCHColor,
  target: OKLCHColor
): Effect.Effect<boolean, ColorError> =>
  Effect.gen(function*() {
    // Very dark or very light reference colors may not transform well
    // because they have limited chroma range
    if (
      reference.l < MIN_VIABLE_LIGHTNESS ||
      reference.l > MAX_VIABLE_LIGHTNESS
    ) {
      return false
    }

    // If both colors are achromatic, transformation is just a lightness copy (always viable)
    if (isAchromatic(reference) && isAchromatic(target)) {
      return true
    }

    // Create a test transformation to check gamut
    const testTransform: OKLCHColor = {
      l: reference.l,
      c: reference.c,
      h: normalizeHue(target.h),
      alpha: reference.alpha
    }

    const displayable = yield* isDisplayable(testTransform)

    // If directly displayable, definitely viable
    if (displayable) {
      return true
    }

    // If not displayable, clamp and check how much chroma was lost
    const clampResult = yield* Effect.either(clampToGamut(testTransform))

    // Pattern match on Either to determine viability
    return Either.match(clampResult, {
      // If clamping failed, transformation is not viable
      onLeft: () => false,
      // If clamping succeeded, check chroma loss ratio
      onRight: (clamped) => {
        const chromaLoss = reference.c > 0 ? (reference.c - clamped.c) / reference.c : 0
        return chromaLoss < MAX_CHROMA_LOSS_RATIO
      }
    })
  })

// ============================================================================
// Helpers
// ============================================================================

/** Wrap culori parse in Option */
const parseCuloriColor = (colorString: string): Option.Option<culori.Color> =>
  Option.fromNullable(culori.parse(colorString))

/** Create a ColorError with formatted message */
const colorError = (message: string, error?: unknown): ColorError =>
  new ColorError({
    message: error !== undefined
      ? `${message}: ${formatErrorMessage(error)}`
      : message
  })

/** Convert any culori color to OKLCH with error handling */
const culoriToOklch = (
  color: culori.Color,
  sourceMode: string
): Effect.Effect<OKLCHColor, ColorError> =>
  pipe(
    Effect.sync(() => culori.oklch(color)),
    Effect.filterOrFail(
      (oklch): oklch is culori.Oklch => oklch !== undefined,
      () =>
        colorError(
          `Culori could not convert parsed color to OKLCH from ${sourceMode}`
        )
    ),
    Effect.map(fromCuloriOklch)
  )

/** Generic helper for culori color conversions */
const convertWithCulori = <TInput, TOutput, TResult>(
  convert: (input: TInput) => TOutput | undefined,
  isValid: (result: TOutput | undefined) => result is TOutput,
  transform: (result: TOutput) => TResult,
  tryErrorMessage: string,
  filterErrorMessage: string
) =>
(input: TInput): Effect.Effect<TResult, ColorError> =>
  pipe(
    Effect.try({
      try: () => convert(input),
      catch: (error) => colorError(tryErrorMessage, error)
    }),
    Effect.filterOrFail(isValid, () => colorError(filterErrorMessage)),
    Effect.map(transform)
  )

// ============================================================================
// Utils
// ============================================================================

/** Normalize hue to [0, 360) range */
export const normalizeHue = (hue: number): number => {
  const normalized = hue % 360
  return normalized < 0 ? normalized + 360 : normalized
}

/** Calculate the shortest angular distance between two hues */
export const hueDifference = (h1: number, h2: number): number => {
  const diff = ((h2 - h1 + 180) % 360) - 180
  return diff < -180 ? diff + 360 : diff
}

/** Clamp a value between min and max */
export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

/** Extract error message from unknown error */
const formatErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** Create a culori OKLCH color object from OKLCHColor */
const toCuloriOklch = (color: OKLCHColor): culori.Oklch => ({
  mode: "oklch",
  l: color.l,
  c: color.c,
  h: color.h,
  alpha: color.alpha
})

/** Create a culori OKLAB color object from OKLABColor */
const toCuloriOklab = (color: OKLABColor): culori.Oklab => ({
  mode: "oklab",
  l: color.l,
  a: color.a,
  b: color.b,
  alpha: color.alpha
})

/** Create a culori RGB color object from RGBColor */
const toCuloriRgb = (color: RGBColor): culori.Rgb => ({
  mode: "rgb",
  r: color.r / 255,
  g: color.g / 255,
  b: color.b / 255,
  alpha: color.alpha
})

/** Extract OKLCHColor from culori oklch result */
const fromCuloriOklch = (oklch: culori.Oklch): OKLCHColor => ({
  l: oklch.l ?? 0,
  c: oklch.c ?? 0,
  h: oklch.h ?? 0,
  alpha: oklch.alpha ?? 1
})

/** Extract OKLABColor from culori oklab result */
const fromCuloriOklab = (oklab: culori.Oklab): OKLABColor => ({
  l: oklab.l ?? 0,
  a: oklab.a ?? 0,
  b: oklab.b ?? 0,
  alpha: oklab.alpha ?? 1
})

/** Extract RGBColor from culori rgb result */
const fromCuloriRgb = (rgb: culori.Rgb): RGBColor => ({
  r: Math.round((rgb.r ?? 0) * 255),
  g: Math.round((rgb.g ?? 0) * 255),
  b: Math.round((rgb.b ?? 0) * 255),
  alpha: rgb.alpha ?? 1
})

/** Normalize color string by adding # prefix for hex colors */
const normalizeColorString = (colorString: string): string =>
  HEX_WITHOUT_HASH_PATTERN.test(colorString) ? `#${colorString}` : colorString

/** Check if a color is achromatic */
const isAchromatic = (color: OKLCHColor): boolean => color.c === 0 || isNaN(color.h)
