/**
 * Program to load example palettes and extract transformation patterns
 */

import { Effect } from "effect"
import * as fs from "node:fs/promises"
import type { AnalyzedPalette } from "../domain/learning/pattern.js"
import { extractPatterns } from "../domain/learning/statistics.js"
import { parseColorStringToOKLCH } from "../schemas/color.js"
import { ExamplePaletteInput } from "../schemas/palette.js"

/**
 * Load an example palette from a JSON file and convert to OKLCH
 */
export const loadExamplePalette = (
  filePath: string
): Effect.Effect<AnalyzedPalette, Error> =>
  Effect.gen(function*() {
    // Read file
    const fileContent = yield* Effect.tryPromise({
      try: () => fs.readFile(filePath, "utf-8"),
      catch: (error) =>
        new Error(`Failed to read palette file: ${error instanceof Error ? error.message : String(error)}`)
    })

    // Parse JSON and validate with schema decoder
    const jsonData = yield* Effect.try({
      try: () => JSON.parse(fileContent),
      catch: (error) => new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`)
    })

    const examplePalette = yield* ExamplePaletteInput(jsonData)

    // Convert all hex colors to OKLCH
    const stopsWithOKLCH = yield* Effect.forEach(examplePalette.stops, (stop) =>
      Effect.gen(function*() {
        const oklch = yield* parseColorStringToOKLCH(stop.hex)
        return {
          position: stop.position,
          color: oklch
        }
      }))

    return {
      name: examplePalette.name,
      stops: stopsWithOKLCH
    }
  })

/**
 * Load example palettes from a directory and extract patterns
 */
export const learnPatternsFromDirectory = (
  directoryPath: string
): Effect.Effect<
  {
    readonly palettes: ReadonlyArray<AnalyzedPalette>
    readonly pattern: ReturnType<typeof extractPatterns> extends Effect.Effect<infer A, infer _E> ? A
      : never
  },
  Error
> =>
  Effect.gen(function*() {
    // Read directory
    const files = yield* Effect.tryPromise({
      try: () => fs.readdir(directoryPath),
      catch: (error) =>
        new Error(
          `Failed to read directory: ${error instanceof Error ? error.message : String(error)}`
        )
    })

    // Filter for JSON files
    const jsonFiles = files.filter((f) => f.endsWith(".json"))

    if (jsonFiles.length === 0) {
      return yield* Effect.fail(new Error(`No JSON palette files found in ${directoryPath}`))
    }

    // Load all palettes
    const palettes = yield* Effect.forEach(
      jsonFiles,
      (file) => loadExamplePalette(`${directoryPath}/${file}`),
      { concurrency: "unbounded" }
    )

    // Extract patterns
    const pattern = yield* extractPatterns(palettes)

    return { palettes, pattern }
  })

/**
 * Load a single example palette and extract its pattern
 */
export const learnFromSinglePalette = (
  filePath: string
): Effect.Effect<
  {
    readonly palette: AnalyzedPalette
    readonly pattern: ReturnType<typeof extractPatterns> extends Effect.Effect<infer A, infer _E> ? A
      : never
  },
  Error
> =>
  Effect.gen(function*() {
    const palette = yield* loadExamplePalette(filePath)
    const pattern = yield* extractPatterns([palette])

    return { palette, pattern }
  })
