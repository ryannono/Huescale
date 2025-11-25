/**
 * Pattern service for loading and processing color transformation patterns
 *
 * Provides:
 * - Loading patterns from JSON files
 * - Loading example palettes
 * - Pattern extraction and smoothing
 *
 * Uses Effect's FileSystem service instead of Node.js fs for better testing and abstraction.
 */

import { FileSystem, Path } from "@effect/platform"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Data, Effect } from "effect"
import type { AnalyzedPalette, TransformationPattern } from "../domain/learning/pattern.js"
import { extractPatterns } from "../domain/learning/statistics.js"
import { smoothPattern } from "../domain/math/interpolation.js"
import { parseColorStringToOKLCH } from "../schemas/color.js"
import { ExamplePaletteInput } from "../schemas/palette.js"

/**
 * Error type for pattern loading failures
 */
export class PatternLoadError extends Data.TaggedError("PatternLoadError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Pattern service using Effect.Service pattern
 *
 * @example
 * ```typescript
 * Effect.gen(function*() {
 *   const service = yield* PatternService
 *   const pattern = yield* service.loadPattern("test/fixtures/valid-palettes/example-orange.json")
 *   console.log(pattern.referenceStop) // 500
 * }).pipe(Effect.provide(PatternService.Default))
 * ```
 */
export class PatternService extends Effect.Service<PatternService>()("PatternService", {
  effect: Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    /**
     * Load an example palette from a JSON file and convert to OKLCH
     */
    const loadPalette = (
      filePath: string
    ): Effect.Effect<AnalyzedPalette, PatternLoadError> =>
      Effect.gen(function*() {
        // Read file
        const fileContent = yield* fs.readFileString(filePath).pipe(
          Effect.mapError(
            (error) =>
              new PatternLoadError({
                message: `Failed to read palette file: ${filePath}`,
                cause: error
              })
          )
        )

        // Parse JSON and validate with schema
        const jsonData = yield* Effect.try({
          try: () => JSON.parse(fileContent),
          catch: (error) =>
            new PatternLoadError({
              message: `Failed to parse JSON: ${filePath}`,
              cause: error
            })
        })

        const examplePalette = yield* ExamplePaletteInput(jsonData).pipe(
          Effect.mapError(
            (error) =>
              new PatternLoadError({
                message: `Invalid palette schema: ${filePath}`,
                cause: error
              })
          )
        )

        // Convert all hex colors to OKLCH
        const stopsWithOKLCH = yield* Effect.forEach(
          examplePalette.stops,
          (stop) =>
            Effect.gen(function*() {
              const oklch = yield* parseColorStringToOKLCH(stop.hex)
              return {
                position: stop.position,
                color: oklch
              }
            }),
          { concurrency: "unbounded" }
        ).pipe(
          Effect.mapError(
            (error) =>
              new PatternLoadError({
                message: `Failed to convert colors to OKLCH: ${filePath}`,
                cause: error
              })
          )
        )

        return {
          name: examplePalette.name,
          stops: stopsWithOKLCH
        }
      })

    /**
     * Load a pattern from a file path
     * This loads a palette, extracts its transformation pattern, and smooths it
     */
    const loadPattern = (
      source: string
    ): Effect.Effect<TransformationPattern, PatternLoadError> =>
      Effect.gen(function*() {
        const palette = yield* loadPalette(source)
        const pattern = yield* extractPatterns([palette]).pipe(
          Effect.mapError(
            (error) =>
              new PatternLoadError({
                message: `Failed to extract pattern from: ${source}`,
                cause: error
              })
          )
        )
        return smoothPattern(pattern)
      })

    /**
     * Load multiple palettes from a directory and extract a combined pattern
     */
    const loadPatternsFromDirectory = (
      directoryPath: string
    ): Effect.Effect<
      {
        readonly palettes: ReadonlyArray<AnalyzedPalette>
        readonly pattern: TransformationPattern
      },
      PatternLoadError
    > =>
      Effect.gen(function*() {
        // Read directory
        const files = yield* fs.readDirectory(directoryPath).pipe(
          Effect.mapError(
            (error) =>
              new PatternLoadError({
                message: `Failed to read directory: ${directoryPath}`,
                cause: error
              })
          )
        )

        // Filter for JSON files
        const jsonFiles = files.filter((f) => f.endsWith(".json"))

        if (jsonFiles.length === 0) {
          return yield* Effect.fail(
            new PatternLoadError({
              message: `No JSON palette files found in ${directoryPath}`
            })
          )
        }

        // Load all palettes
        const palettes = yield* Effect.forEach(
          jsonFiles,
          (file) => loadPalette(path.join(directoryPath, file)),
          { concurrency: "unbounded" }
        )

        // Extract patterns
        const pattern = yield* extractPatterns(palettes).pipe(
          Effect.mapError(
            (error) =>
              new PatternLoadError({
                message: `Failed to extract patterns from directory: ${directoryPath}`,
                cause: error
              })
          )
        )

        return {
          palettes,
          pattern: smoothPattern(pattern)
        }
      })

    return {
      loadPattern,
      loadPalette,
      loadPatternsFromDirectory
    }
  }),
  dependencies: [NodeFileSystem.layer, NodePath.layer]
}) {
  /**
   * Test layer - same as Default since PatternService has no environment-specific behavior
   */
  static readonly Test = PatternService.Default
}
