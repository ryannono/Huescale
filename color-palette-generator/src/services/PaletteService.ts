/**
 * Palette service for color palette generation
 *
 * Provides:
 * - Single palette generation
 * - Batch palette generation
 * - Color format conversion
 *
 * Orchestrates PatternService and ConfigService to generate complete palettes.
 */

import { Array, Data, Effect, Either, Layer, Option } from "effect"
import type { ParseError } from "effect/ParseResult"
import { oklchToHex, oklchToOKLAB, oklchToRGB } from "../domain/color/conversions.js"
import { ColorConversionError } from "../domain/color/errors.js"
import { generatePaletteFromStop } from "../domain/palette/generator.js"
import type { BatchGeneratedPaletteOutput, BatchGeneratePaletteInput } from "../schemas/batch.js"
import type { ColorSpace } from "../schemas/color.js"
import { parseColorStringToOKLCH } from "../schemas/color.js"
import { GeneratedPaletteOutput, type GeneratePaletteInput } from "../schemas/generate-palette.js"
import type { Palette } from "../schemas/palette.js"
import { ConfigService } from "./ConfigService.js"
import { PatternService } from "./PatternService.js"

/**
 * Error type for palette generation failures
 */
export class PaletteGenerationError extends Data.TaggedError("PaletteGenerationError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Palette service using Effect.Service pattern
 *
 * @example
 * ```typescript
 * Effect.gen(function*() {
 *   const service = yield* PaletteService
 *   const result = yield* service.generate({
 *     inputColor: "#2D72D2",
 *     anchorStop: 500,
 *     outputFormat: "hex",
 *     paletteName: "blue"
 *   })
 * }).pipe(Effect.provide(PaletteService.Default))
 * ```
 */
export class PaletteService extends Effect.Service<PaletteService>()("PaletteService", {
  effect: Effect.gen(function*() {
    const patternService = yield* PatternService
    const configService = yield* ConfigService

    /**
     * Convert OKLCH color to requested format
     */
    const convertColor = (
      color: Palette["stops"][number]["color"],
      format: ColorSpace
    ): Effect.Effect<string, ColorConversionError | ParseError> => {
      switch (format) {
        case "hex":
          return oklchToHex(color)
        case "rgb":
          return Effect.map(
            oklchToRGB(color),
            (rgb) => `rgb(${rgb.r}, ${rgb.g}, ${rgb.b}${rgb.alpha !== 1 ? `, ${rgb.alpha}` : ""})`
          )
        case "oklch":
          return Effect.succeed(
            `oklch(${(color.l * 100).toFixed(2)}% ${color.c.toFixed(3)} ${color.h.toFixed(1)}${
              color.alpha !== 1 ? ` / ${color.alpha}` : ""
            })`
          )
        case "oklab":
          return Effect.map(
            oklchToOKLAB(color),
            (oklab) =>
              `oklab(${(oklab.l * 100).toFixed(2)}% ${oklab.a.toFixed(3)} ${oklab.b.toFixed(3)}${
                oklab.alpha !== 1 ? ` / ${oklab.alpha}` : ""
              })`
          )
      }
    }

    /**
     * Generate a single palette
     */
    const generate = (
      input: GeneratePaletteInput
    ): Effect.Effect<GeneratedPaletteOutput, PaletteGenerationError> =>
      Effect.gen(function*() {
        const { anchorStop, inputColor, outputFormat, paletteName } = input

        // Get pattern source (input override or config default)
        const config = yield* configService.getConfig()
        const patternSource = input.patternSource ?? config.patternSource

        // Step 1: Parse input color to OKLCH
        const oklchColor = yield* parseColorStringToOKLCH(inputColor)

        // Step 2: Load pattern from PatternService
        const pattern = yield* patternService.loadPattern(patternSource)

        // Step 3: Generate palette
        const palette = yield* generatePaletteFromStop(oklchColor, anchorStop, pattern, paletteName)

        // Step 4: Convert to requested output format
        const formattedStops = yield* Effect.forEach(
          palette.stops,
          (stop) =>
            Effect.gen(function*() {
              const formatted = yield* convertColor(stop.color, outputFormat)
              return {
                color: stop.color,
                position: stop.position,
                value: formatted
              }
            }),
          { concurrency: "unbounded" }
        )

        // Step 5: Validate output with schema
        return yield* GeneratedPaletteOutput({
          anchorStop,
          inputColor,
          name: palette.name,
          outputFormat,
          stops: formattedStops
        })
      }).pipe(
        Effect.mapError(
          (error) =>
            new PaletteGenerationError({
              message: `Failed to generate palette for ${input.inputColor}`,
              cause: error
            })
        )
      )

    /**
     * Generate multiple palettes in batch
     */
    const generateBatch = (
      input: BatchGeneratePaletteInput
    ): Effect.Effect<BatchGeneratedPaletteOutput, never> =>
      Effect.gen(function*() {
        // Generate all palettes in parallel, collecting results
        const results = yield* Effect.all(
          input.pairs.map(({ color, stop }) =>
            Effect.either(
              generate({
                inputColor: color,
                anchorStop: stop,
                outputFormat: input.outputFormat,
                paletteName: `${input.paletteGroupName}-${color}`,
                patternSource: input.patternSource
              })
            )
          ),
          { mode: "either", concurrency: 3 }
        )

        // Filter successful results and track if any failed (results is Either<Either<Palette, Error>, never>[])
        let hadFailures = false
        const palettes = Array.filterMap(results, (outerResult) =>
          Either.match(outerResult, {
            onLeft: () => {
              hadFailures = true
              return Option.none()
            },
            onRight: (innerResult) =>
              Either.match(innerResult, {
                onLeft: () => {
                  hadFailures = true
                  return Option.none()
                },
                onRight: (palette) => Option.some(palette)
              })
          }))

        return {
          groupName: input.paletteGroupName,
          outputFormat: input.outputFormat,
          palettes,
          partial: hadFailures,
          generatedAt: new Date().toISOString()
        }
      })

    return {
      generate,
      generateBatch
    }
  }),
  dependencies: [PatternService.Default, ConfigService.Default]
}) {
  /**
   * Test layer with test dependencies
   *
   * Uses ConfigService.Test and PatternService.Test for predictable test behavior.
   */
  static readonly Test = PaletteService.DefaultWithoutDependencies.pipe(
    Layer.provide(Layer.mergeAll(PatternService.Test, ConfigService.Test))
  )
}
