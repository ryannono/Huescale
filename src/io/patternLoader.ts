/**
 * Pattern loading I/O implementations.
 *
 * Factory functions that create LoadPattern functions for different environments:
 * - Filesystem (CLI)
 * - In-memory (testing)
 * - HTTP (future web consumer)
 */

import { FileSystem } from "@effect/platform"
import { Data, Effect } from "effect"
import { parseColorStringToOKLCH } from "../domain/color/color.js"
import { smoothPattern } from "../domain/math/interpolation.js"
import { ExamplePaletteRequest } from "../domain/palette/palette.schema.js"
import type { AnalyzedPalette, TransformationPattern } from "../domain/pattern/pattern.js"
import { extractPatterns } from "../domain/pattern/pattern.js"

// ============================================================================
// Errors
// ============================================================================

/** Error when pattern loading fails */
export class PatternLoadError extends Data.TaggedError("PatternLoadError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ============================================================================
// Types
// ============================================================================

/** Function type for loading patterns - implementations vary by platform */
export type LoadPattern = (source: string) => Effect.Effect<TransformationPattern, PatternLoadError>

/** Function type for loading raw palettes */
export type LoadPalette = (source: string) => Effect.Effect<AnalyzedPalette, PatternLoadError>

// ============================================================================
// Filesystem Implementation
// ============================================================================

/**
 * Create a pattern loader that reads from the filesystem.
 *
 * @param fs - Effect FileSystem service
 * @returns LoadPattern function that loads patterns from file paths
 */
export const makeFilePatternLoader = (fs: FileSystem.FileSystem): LoadPattern => (source) =>
  Effect.gen(function*() {
    const palette = yield* loadPaletteFromFile(fs, source)
    const pattern = yield* extractPatterns([palette]).pipe(
      Effect.mapError(
        (cause) =>
          new PatternLoadError({
            message: `Failed to extract pattern from: ${source}`,
            cause
          })
      )
    )
    return yield* smoothPattern(pattern).pipe(
      Effect.mapError(
        (cause) =>
          new PatternLoadError({
            message: `Failed to smooth pattern from: ${source}`,
            cause
          })
      )
    )
  })

/**
 * Create a palette loader that reads from the filesystem.
 *
 * @param fs - Effect FileSystem service
 * @returns LoadPalette function that loads palettes from file paths
 */
export const makeFilePaletteLoader = (fs: FileSystem.FileSystem): LoadPalette => (source) =>
  loadPaletteFromFile(fs, source)

// ============================================================================
// In-Memory Implementation (Testing)
// ============================================================================

/**
 * Create a pattern loader from an in-memory map.
 *
 * Useful for testing without filesystem access.
 *
 * @param patterns - Map of source identifiers to patterns
 * @returns LoadPattern function that looks up patterns in the map
 */
export const makeMemoryPatternLoader = (
  patterns: ReadonlyMap<string, TransformationPattern>
): LoadPattern =>
(source) =>
  Effect.fromNullable(patterns.get(source)).pipe(
    Effect.mapError(
      () =>
        new PatternLoadError({
          message: `Pattern not found: ${source}`
        })
    )
  )

/**
 * Create a palette loader from an in-memory map.
 *
 * @param palettes - Map of source identifiers to palettes
 * @returns LoadPalette function that looks up palettes in the map
 */
export const makeMemoryPaletteLoader = (
  palettes: ReadonlyMap<string, AnalyzedPalette>
): LoadPalette =>
(source) =>
  Effect.fromNullable(palettes.get(source)).pipe(
    Effect.mapError(
      () =>
        new PatternLoadError({
          message: `Palette not found: ${source}`
        })
    )
  )

// ============================================================================
// Internal Helpers
// ============================================================================

/** Load a palette from a file and convert to OKLCH */
const loadPaletteFromFile = (
  fs: FileSystem.FileSystem,
  filePath: string
): Effect.Effect<AnalyzedPalette, PatternLoadError> =>
  Effect.gen(function*() {
    const content = yield* fs.readFileString(filePath).pipe(
      Effect.mapError(
        (cause) =>
          new PatternLoadError({
            message: `Failed to read palette file: ${filePath}`,
            cause
          })
      )
    )

    const json = yield* parseJson(content, filePath)

    const rawPalette = yield* ExamplePaletteRequest(json).pipe(
      Effect.mapError(
        (cause) =>
          new PatternLoadError({
            message: `Invalid palette schema: ${filePath}`,
            cause
          })
      )
    )

    const stops = yield* Effect.forEach(
      rawPalette.stops,
      (stop) =>
        parseColorStringToOKLCH(stop.hex).pipe(
          Effect.map((color) => ({ position: stop.position, color }))
        ),
      { concurrency: "unbounded" }
    ).pipe(
      Effect.mapError(
        (cause) =>
          new PatternLoadError({
            message: `Failed to convert colors to OKLCH: ${filePath}`,
            cause
          })
      )
    )

    return { name: rawPalette.name, stops }
  })

/** Parse JSON string safely */
const parseJson = (
  content: string,
  source: string
): Effect.Effect<unknown, PatternLoadError> =>
  Effect.try({
    try: () => JSON.parse(content),
    catch: (cause) =>
      new PatternLoadError({
        message: `Failed to parse JSON: ${source}`,
        cause
      })
  })
