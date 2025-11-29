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
import { Data, Effect, Option, pipe } from "effect"
import type { ParseError } from "effect/ParseResult"
import {
  HEX_WITHOUT_HASH_PATTERN,
  HexColor,
  type HexColor as HexColorType,
  type OKLABColor,
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
  pipe(
    normalizeColorString(colorString),
    parseCuloriColor,
    Option.match({
      onNone: () => Effect.fail(colorError(`Could not parse color string with culori: ${colorString}`)),
      onSome: (parsed) => culoriToOklch(parsed, parsed.mode ?? UNKNOWN_COLOR_MODE)
    })
  )

// ============================================================================
// Public API - Conversions
// ============================================================================

/**
 * Convert OKLCH to hex string
 */
export const oklchToHex = (
  color: OKLCHColor
): Effect.Effect<HexColorType, ColorError | ParseError> =>
  pipe(
    convertWithCulori(
      () => culori.formatHex(toCuloriOklch(color)),
      (hex): hex is string => hex !== undefined,
      (hex) => Effect.succeed(color.alpha === 1 ? hex.slice(0, 7) : hex),
      "Could not convert OKLCH to hex",
      "Culori could not format OKLCH as hex"
    )(color),
    Effect.flatMap(HexColor)
  )

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
): Effect.Effect<OKLABColor, ColorError> =>
  convertWithCulori(
    () => culori.oklab(toCuloriOklch(color)),
    (oklab): oklab is culori.Oklab => oklab !== undefined,
    fromCuloriOklab,
    "Could not convert OKLCH to OKLAB",
    "Culori could not convert OKLCH to OKLAB"
  )(color)

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
    Effect.map((clamped) => mergeOklchWithFallback(clamped, color))
  )

// ============================================================================
// Public API - Transformations
// ============================================================================

/**
 * Handle achromatic edge cases for optical appearance transformation.
 * Returns Some(color) if an edge case applies, None otherwise.
 */
const handleAchromaticCases = (
  reference: OKLCHColor,
  target: OKLCHColor
): Option.Option<OKLCHColor> => {
  // When reference has no chroma, keep target's hue but make it achromatic
  if (isAchromatic(reference)) {
    return Option.some({
      l: reference.l,
      c: 0,
      h: normalizeHue(target.h),
      alpha: reference.alpha
    })
  }

  // When target has no hue, preserve reference's hue since target has no opinion
  if (isAchromatic(target)) {
    return Option.some({
      l: reference.l,
      c: reference.c,
      h: normalizeHue(reference.h),
      alpha: reference.alpha
    })
  }

  return Option.none()
}

/**
 * Create the base transformation: reference L+C with target H
 */
const createBaseTransform = (
  reference: OKLCHColor,
  target: OKLCHColor
): OKLCHColor => ({
  l: reference.l,
  c: reference.c,
  h: normalizeHue(target.h),
  alpha: reference.alpha
})

/** Check if chroma was completely lost during clamping */
const hasLostChroma = (original: OKLCHColor, clamped: OKLCHColor): boolean => clamped.c === 0 && original.c > 0

/**
 * Clamp color to gamut, failing if chroma is lost entirely.
 */
const clampWithChromaCheck = (
  color: OKLCHColor
): Effect.Effect<OKLCHColor, ColorError> =>
  pipe(
    clampToGamut(color),
    Effect.filterOrFail(
      (clamped) => !hasLostChroma(color, clamped),
      () =>
        colorError(
          "Transformed color is out of gamut and clamping reduced chroma to 0, losing hue information"
        )
    )
  )

/**
 * Ensure a color fits in gamut, clamping if necessary.
 */
const ensureGamutWithChroma = (
  color: OKLCHColor
): Effect.Effect<OKLCHColor, ColorError> =>
  pipe(
    isDisplayable(color),
    Effect.flatMap(
      Effect.if({
        onTrue: () => Effect.succeed(color),
        onFalse: () => clampWithChromaCheck(color)
      })
    )
  )

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
  pipe(
    handleAchromaticCases(reference, target),
    Option.match({
      onSome: Effect.succeed,
      onNone: () => ensureGamutWithChroma(createBaseTransform(reference, target))
    })
  )

/** Check if lightness is within viable range for transformation */
const hasViableLightness = (color: OKLCHColor): boolean =>
  color.l >= MIN_VIABLE_LIGHTNESS && color.l <= MAX_VIABLE_LIGHTNESS

/** Calculate chroma loss ratio between original and clamped color */
const chromaLossRatio = (original: OKLCHColor, clamped: OKLCHColor): number =>
  original.c > 0 ? (original.c - clamped.c) / original.c : 0

/** Check if chroma loss is acceptable */
const hasAcceptableChromaLoss = (original: OKLCHColor, clamped: OKLCHColor): boolean =>
  chromaLossRatio(original, clamped) < MAX_CHROMA_LOSS_RATIO

/** Check viability based on clamp result */
const checkClampViability = (
  reference: OKLCHColor,
  testTransform: OKLCHColor
): Effect.Effect<boolean, never> =>
  pipe(
    clampToGamut(testTransform),
    Effect.map((clamped) => hasAcceptableChromaLoss(reference, clamped)),
    Effect.catchAll(() => Effect.succeed(false))
  )

/** Check displayability, falling back to clamp check */
const checkDisplayabilityOrClamp = (
  reference: OKLCHColor,
  testTransform: OKLCHColor
): Effect.Effect<boolean, never> =>
  pipe(
    isDisplayable(testTransform),
    Effect.flatMap((displayable) => displayable ? Effect.succeed(true) : checkClampViability(reference, testTransform))
  )

/**
 * Check if a transformation is viable without significant quality loss
 */
export const isTransformationViable = (
  reference: OKLCHColor,
  target: OKLCHColor
): Effect.Effect<boolean, never> => {
  // Early exit: lightness out of viable range
  if (!hasViableLightness(reference)) {
    return Effect.succeed(false)
  }

  // Early exit: both achromatic means simple lightness copy (always viable)
  if (isAchromatic(reference) && isAchromatic(target)) {
    return Effect.succeed(true)
  }

  return checkDisplayabilityOrClamp(reference, createBaseTransform(reference, target))
}

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
    Effect.flatMap(fromCuloriOklch)
  )

/** Generic helper for culori color conversions with Effect-returning transform */
const convertWithCulori = <TInput, TOutput, TResult>(
  convert: (input: TInput) => TOutput | undefined,
  isValid: (result: TOutput | undefined) => result is TOutput,
  transform: (result: TOutput) => Effect.Effect<TResult, ColorError>,
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
    Effect.flatMap(transform)
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

/** Merge OKLCH color with fallback values for undefined properties */
const mergeOklchWithFallback = (
  primary: Partial<OKLCHColor>,
  fallback: OKLCHColor
): OKLCHColor => ({
  l: primary.l ?? fallback.l,
  c: primary.c ?? fallback.c,
  h: primary.h ?? fallback.h,
  alpha: primary.alpha ?? fallback.alpha
})

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

/** Type guard for defined value */
const isDefined = <T>(value: T | undefined): value is T => value !== undefined

/** Format culori color properties for error messages */
const formatColorProps = <T extends object, K extends keyof T>(
  color: T,
  keys: ReadonlyArray<K>
): string => keys.map((key) => `${String(key)}=${color[key]}`).join(", ")

/** Extract OKLCHColor from culori oklch result with validation */
const fromCuloriOklch = (oklch: culori.Oklch): Effect.Effect<OKLCHColor, ColorError> =>
  isDefined(oklch.l) && isDefined(oklch.c) && isDefined(oklch.h)
    ? Effect.succeed({
      l: oklch.l,
      c: oklch.c,
      h: oklch.h,
      alpha: oklch.alpha ?? 1
    })
    : Effect.fail(
      colorError(`Culori returned incomplete OKLCH color: ${formatColorProps(oklch, ["l", "c", "h"])}`)
    )

/** Extract OKLABColor from culori oklab result with validation */
const fromCuloriOklab = (oklab: culori.Oklab): Effect.Effect<OKLABColor, ColorError> =>
  isDefined(oklab.l) && isDefined(oklab.a) && isDefined(oklab.b)
    ? Effect.succeed({
      l: oklab.l,
      a: oklab.a,
      b: oklab.b,
      alpha: oklab.alpha ?? 1
    })
    : Effect.fail(
      colorError(`Culori returned incomplete OKLAB color: ${formatColorProps(oklab, ["l", "a", "b"])}`)
    )

/** Extract RGBColor from culori rgb result with validation */
const fromCuloriRgb = (rgb: culori.Rgb): Effect.Effect<RGBColor, ColorError> =>
  isDefined(rgb.r) && isDefined(rgb.g) && isDefined(rgb.b)
    ? Effect.succeed({
      r: Math.round(rgb.r * 255),
      g: Math.round(rgb.g * 255),
      b: Math.round(rgb.b * 255),
      alpha: rgb.alpha ?? 1
    })
    : Effect.fail(
      colorError(`Culori returned incomplete RGB color: ${formatColorProps(rgb, ["r", "g", "b"])}`)
    )

/** Normalize color string by adding # prefix for hex colors */
const normalizeColorString = (colorString: string): string =>
  HEX_WITHOUT_HASH_PATTERN.test(colorString) ? `#${colorString}` : colorString

/** Check if a color is achromatic */
const isAchromatic = (color: OKLCHColor): boolean => color.c === 0 || isNaN(color.h)
