/**
 * Generate palette use case.
 *
 * Pure composition of domain logic with I/O capabilities passed as arguments.
 * Works for CLI (filesystem), web (HTTP), or tests (memory) by varying the LoadPattern impl.
 */

import { Data, Effect } from "effect"
import { parseColorStringToOKLCH } from "../domain/color/color.js"
import type { ColorSpace } from "../domain/color/color.schema.js"
import { formatPaletteStops } from "../domain/color/formatter.js"
import { generatePaletteFromStop } from "../domain/palette/generator.js"
import {
  type PaletteResult,
  PaletteResult as PaletteResultSchema,
  type StopPosition
} from "../domain/palette/palette.schema.js"
import type { TransformationPattern } from "../domain/pattern/pattern.js"
import type { LoadPattern, PatternLoadError } from "../io/patternLoader.js"

// ============================================================================
// Errors
// ============================================================================

/** Error when palette generation fails */
export class GeneratePaletteError extends Data.TaggedError("GeneratePaletteError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ============================================================================
// Types
// ============================================================================

/** Input for generating a single palette */
export interface GeneratePaletteInput {
  readonly inputColor: string
  readonly anchorStop: StopPosition
  readonly outputFormat: ColorSpace
  readonly paletteName: string
  readonly patternSource: string
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate a palette from input.
 *
 * Takes a LoadPattern function as argument - caller decides how patterns are loaded.
 * This makes the use case work for CLI (filesystem), web (HTTP), or tests (memory).
 *
 * @param input - Palette generation parameters
 * @param loadPattern - Function to load pattern (platform-specific implementation)
 * @returns Effect containing the generated palette result
 */
export const generatePalette = (
  input: GeneratePaletteInput,
  loadPattern: LoadPattern
): Effect.Effect<PaletteResult, GeneratePaletteError | PatternLoadError> =>
  Effect.gen(function*() {
    const pattern = yield* loadPattern(input.patternSource)
    return yield* generatePaletteWithPattern(input, pattern)
  })

/**
 * Generate palette with pattern already loaded.
 *
 * Use this when you already have the pattern (e.g., batch operations
 * that load pattern once and generate multiple palettes).
 *
 * @param input - Palette generation parameters (without patternSource)
 * @param pattern - Pre-loaded transformation pattern
 * @returns Effect containing the generated palette result
 */
export const generatePaletteWithPattern = (
  input: Omit<GeneratePaletteInput, "patternSource">,
  pattern: TransformationPattern
): Effect.Effect<PaletteResult, GeneratePaletteError> =>
  Effect.gen(function*() {
    const oklchColor = yield* parseColorStringToOKLCH(input.inputColor)

    const palette = yield* generatePaletteFromStop(
      oklchColor,
      input.anchorStop,
      pattern,
      input.paletteName
    )

    const stops = yield* formatPaletteStops(palette.stops, input.outputFormat)

    return yield* PaletteResultSchema({
      name: palette.name,
      anchorStop: input.anchorStop,
      inputColor: input.inputColor,
      outputFormat: input.outputFormat,
      stops
    })
  }).pipe(
    Effect.mapError(
      (cause) =>
        new GeneratePaletteError({
          message: `Failed to generate palette for ${input.inputColor}`,
          cause
        })
    )
  )
