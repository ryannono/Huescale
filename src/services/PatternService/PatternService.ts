/**
 * Pattern service for loading and processing color transformation patterns
 *
 * Loads patterns from JSON files, extracts transformation patterns,
 * and smooths them for palette generation.
 */

import { FileSystem, Path } from "@effect/platform"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Data, Effect, Either } from "effect"
import { parseColorStringToOKLCH } from "../../domain/color/color.js"
import { smoothPattern } from "../../domain/math/interpolation.js"
import { ExamplePaletteInput } from "../../domain/palette/palette.schema.js"
import type { AnalyzedPalette, TransformationPattern } from "../../domain/pattern/pattern.js"
import { extractPatterns } from "../../domain/pattern/pattern.js"
import { type DirectoryPath, type FilePath, FilePath as FilePathSchema } from "./filesystem.schema.js"

// ============================================================================
// Errors
// ============================================================================

/**
 * Error when pattern loading operations fail
 */
export class PatternLoadError extends Data.TaggedError("PatternLoadError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ============================================================================
// Service
// ============================================================================

/**
 * Pattern service with file loading and pattern extraction
 */
export class PatternService extends Effect.Service<PatternService>()("PatternService", {
  effect: Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    /**
     * Load palette from JSON file and convert colors to OKLCH
     */
    const loadPalette = (
      filePath: FilePath
    ): Effect.Effect<AnalyzedPalette, PatternLoadError> =>
      Effect.gen(function*() {
        const fileContent = yield* fs.readFileString(filePath).pipe(
          Effect.mapError(
            (error) =>
              new PatternLoadError({
                message: `Failed to read palette file: ${filePath}`,
                cause: error
              })
          )
        )

        const jsonData = yield* parseJson(fileContent, filePath)

        const examplePalette = yield* ExamplePaletteInput(jsonData).pipe(
          Effect.mapError(
            (error) =>
              new PatternLoadError({
                message: `Invalid palette schema: ${filePath}`,
                cause: error
              })
          )
        )

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
     * Load pattern from file, extract and smooth transformations
     */
    const loadPattern = (
      source: FilePath
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
        return yield* smoothPatternEffect(pattern, source)
      })

    /**
     * Load multiple palettes from directory and extract combined pattern
     */
    const loadPatternsFromDirectory = (
      directoryPath: DirectoryPath
    ): Effect.Effect<
      {
        readonly palettes: ReadonlyArray<AnalyzedPalette>
        readonly pattern: TransformationPattern
      },
      PatternLoadError
    > =>
      Effect.gen(function*() {
        const files = yield* fs.readDirectory(directoryPath).pipe(
          Effect.mapError(
            (error) =>
              new PatternLoadError({
                message: `Failed to read directory: ${directoryPath}`,
                cause: error
              })
          )
        )

        const jsonFiles = filterJsonFiles(files)

        if (jsonFiles.length === 0) {
          return yield* Effect.fail(
            new PatternLoadError({
              message: `No JSON palette files found in ${directoryPath}`
            })
          )
        }

        const palettes = yield* Effect.forEach(
          jsonFiles,
          (file) =>
            Effect.gen(function*() {
              const filePath = yield* joinAsFilePath(path, directoryPath, file)
              return yield* loadPalette(filePath)
            }),
          { concurrency: "unbounded" }
        )

        const pattern = yield* extractPatterns(palettes).pipe(
          Effect.mapError(
            (error) =>
              new PatternLoadError({
                message: `Failed to extract patterns from directory: ${directoryPath}`,
                cause: error
              })
          )
        )

        const smoothedPattern = yield* smoothPatternEffect(pattern, directoryPath)

        return {
          palettes,
          pattern: smoothedPattern
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

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse JSON string to object
 */
const parseJson = (
  content: string,
  filePath: FilePath
): Effect.Effect<unknown, PatternLoadError> =>
  Effect.try({
    try: () => JSON.parse(content),
    catch: (error) =>
      new PatternLoadError({
        message: `Failed to parse JSON: ${filePath}`,
        cause: error
      })
  })

/**
 * Smooth pattern and convert Either to Effect
 */
const smoothPatternEffect = (
  pattern: TransformationPattern,
  source: string
): Effect.Effect<TransformationPattern, PatternLoadError> =>
  Either.match(smoothPattern(pattern), {
    onLeft: (error) =>
      Effect.fail(
        new PatternLoadError({
          message: `Failed to smooth pattern from: ${source}`,
          cause: error
        })
      ),
    onRight: Effect.succeed
  })

/**
 * Join directory and file name into validated FilePath
 */
const joinAsFilePath = (
  path: Path.Path,
  dir: DirectoryPath,
  file: string
): Effect.Effect<FilePath, PatternLoadError> =>
  FilePathSchema(path.join(dir, file)).pipe(
    Effect.mapError(
      (error) =>
        new PatternLoadError({
          message: `Invalid file path: ${dir}/${file}`,
          cause: error
        })
    )
  )

/**
 * Filter array for JSON files
 */
const filterJsonFiles = (files: ReadonlyArray<string>): ReadonlyArray<string> =>
  files.filter((f) => f.endsWith(".json"))
