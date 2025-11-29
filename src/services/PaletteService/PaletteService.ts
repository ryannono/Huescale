/**
 * Palette service for color palette generation with pattern-based transformations.
 */

import { Array, Data, Effect, Either, Layer, Schema } from "effect"
import type { ParseError } from "effect/ParseResult"
import { ColorError, oklchToHex, oklchToOKLAB, oklchToRGB, parseColorStringToOKLCH } from "../../domain/color/color.js"
import type { ColorSpace, OKLABColor, OKLCHColor, RGBColor } from "../../domain/color/color.schema.js"
import { generatePaletteFromStop } from "../../domain/palette/generator.js"
import { ConfigService } from "../ConfigService.js"
import { FilePath, type FilePath as FilePathType } from "../PatternService/filesystem.schema.js"
import { PatternService } from "../PatternService/index.js"
import {
  type BatchRequest,
  type BatchResult,
  ISOTimestampSchema,
  type PaletteRequest,
  PaletteResult
} from "./palette.schema.js"

// ============================================================================
// Types
// ============================================================================

type ColorConverter = (
  color: OKLCHColor
) => Effect.Effect<string, ColorError | ParseError>

// ============================================================================
// Errors
// ============================================================================

/** Wraps underlying errors from color parsing, pattern loading, or palette generation. */
export class PaletteGenerationError extends Data.TaggedError(
  "PaletteGenerationError"
)<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ============================================================================
// Color Formatting
// ============================================================================

const formatRGB = (rgb: RGBColor): string =>
  `rgb(${rgb.r}, ${rgb.g}, ${rgb.b}${rgb.alpha !== 1 ? `, ${rgb.alpha}` : ""})`

const formatOKLCH = (color: OKLCHColor): string =>
  `oklch(${(color.l * 100).toFixed(2)}% ${color.c.toFixed(3)} ${color.h.toFixed(1)}${
    color.alpha !== 1 ? ` / ${color.alpha}` : ""
  })`

const formatOKLAB = (oklab: OKLABColor): string =>
  `oklab(${(oklab.l * 100).toFixed(2)}% ${oklab.a.toFixed(3)} ${oklab.b.toFixed(3)}${
    oklab.alpha !== 1 ? ` / ${oklab.alpha}` : ""
  })`

const colorConverters: Record<ColorSpace, ColorConverter> = {
  hex: oklchToHex,
  rgb: (color) => oklchToRGB(color).pipe(Effect.map(formatRGB)),
  oklch: (color) => Effect.succeed(formatOKLCH(color)),
  oklab: (color) => oklchToOKLAB(color).pipe(Effect.map(formatOKLAB))
}

const convertColor = (
  color: OKLCHColor,
  format: ColorSpace
): Effect.Effect<string, ColorError | ParseError> => colorConverters[format](color)

// ============================================================================
// Internal Helpers
// ============================================================================

const wrapPaletteError = (inputColor: string) => (error: unknown) =>
  new PaletteGenerationError({
    message: `Failed to generate palette for ${inputColor}`,
    cause: error
  })

const resolvePatternSource = (
  input: PaletteRequest,
  configPatternSource: FilePathType
): Effect.Effect<FilePathType, PaletteGenerationError> =>
  input.patternSource
    ? FilePath(input.patternSource).pipe(
      Effect.mapError(
        (error) =>
          new PaletteGenerationError({
            message: `Invalid pattern source: ${input.patternSource}`,
            cause: error
          })
      )
    )
    : Effect.succeed(configPatternSource)

const formatPaletteStops = (
  stops: ReadonlyArray<{ readonly color: OKLCHColor; readonly position: number }>,
  outputFormat: ColorSpace
) =>
  Effect.forEach(
    stops,
    (stop) =>
      convertColor(stop.color, outputFormat).pipe(
        Effect.map((formatted) => ({
          color: stop.color,
          position: stop.position,
          value: formatted
        }))
      ),
    { concurrency: "unbounded" }
  )

const getCurrentISOTimestamp = Effect.clockWith((clock) =>
  clock.currentTimeMillis.pipe(
    Effect.map((millis) => Schema.decodeSync(ISOTimestampSchema)(new Date(millis).toISOString()))
  )
)

// ============================================================================
// Service
// ============================================================================

/** Provides palette generation with dependency injection for PatternService and ConfigService. */
export class PaletteService extends Effect.Service<PaletteService>()(
  "PaletteService",
  {
    effect: Effect.gen(function*() {
      const patternService = yield* PatternService
      const configService = yield* ConfigService

      const generate = (
        input: PaletteRequest
      ): Effect.Effect<PaletteResult, PaletteGenerationError> =>
        Effect.gen(function*() {
          const { anchorStop, inputColor, outputFormat, paletteName } = input
          const config = yield* configService.getConfig()
          const patternSource = yield* resolvePatternSource(input, config.patternSource)

          const oklchColor = yield* parseColorStringToOKLCH(inputColor)
          const pattern = yield* patternService.loadPattern(patternSource)
          const palette = yield* generatePaletteFromStop(
            oklchColor,
            anchorStop,
            pattern,
            paletteName
          )

          const formattedStops = yield* formatPaletteStops(palette.stops, outputFormat)

          return yield* PaletteResult({
            anchorStop,
            inputColor,
            name: palette.name,
            outputFormat,
            stops: formattedStops
          })
        }).pipe(Effect.mapError(wrapPaletteError(input.inputColor)))

      const generateBatch = (
        input: BatchRequest
      ): Effect.Effect<BatchResult, PaletteGenerationError> =>
        Effect.gen(function*() {
          const results = yield* Effect.forEach(
            input.pairs,
            ({ color, stop }) =>
              Effect.either(
                generate({
                  inputColor: color,
                  anchorStop: stop,
                  outputFormat: input.outputFormat,
                  paletteName: `${input.paletteGroupName}-${color}`,
                  patternSource: input.patternSource
                })
              ),
            { concurrency: "unbounded" }
          )

          const successfulPalettes = Array.getSomes(Array.map(results, Either.getRight))

          if (!Array.isNonEmptyReadonlyArray(successfulPalettes)) {
            return yield* Effect.fail(
              new PaletteGenerationError({ message: "All palette generations failed" })
            )
          }

          const generatedAt = yield* getCurrentISOTimestamp

          return {
            groupName: input.paletteGroupName,
            outputFormat: input.outputFormat,
            palettes: successfulPalettes,
            partial: successfulPalettes.length < results.length,
            generatedAt
          }
        })

      return {
        generate,
        generateBatch
      }
    }),
    dependencies: [PatternService.Default, ConfigService.Default]
  }
) {
  /** Test layer using ConfigService.Test and PatternService.Test for predictable behavior. */
  static readonly Test = PaletteService.DefaultWithoutDependencies.pipe(
    Layer.provide(Layer.mergeAll(PatternService.Test, ConfigService.Test))
  )
}
