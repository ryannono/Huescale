/**
 * Export service for palette output
 *
 * Provides:
 * - Export to JSON file
 * - Export to clipboard
 * - Batch export support
 *
 * Uses Effect's FileSystem service for better testing and abstraction.
 */

import { FileSystem, Path } from "@effect/platform"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import clipboardy from "clipboardy"
import { Data, Effect } from "effect"
import type { BatchGeneratedPaletteOutput } from "../schemas/batch.js"
import type { ExportConfig } from "../schemas/export.js"
import type { GeneratedPaletteOutput } from "../schemas/generate-palette.js"

/**
 * Error type for export failures
 */
export class ExportError extends Data.TaggedError("ExportError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Export service using Effect.Service pattern
 *
 * @example
 * ```typescript
 * Effect.gen(function*() {
 *   const service = yield* ExportService
 *   yield* service.exportPalette(palette, {
 *     target: "json",
 *     jsonPath: "./output/palette.json",
 *     includeOKLCH: true
 *   })
 * }).pipe(Effect.provide(ExportService.Default))
 * ```
 */
export class ExportService extends Effect.Service<ExportService>()("ExportService", {
  effect: Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    /**
     * Export to JSON file
     */
    const toFile = (json: string, jsonPath: string): Effect.Effect<void, ExportError> =>
      Effect.gen(function*() {
        const dir = path.dirname(jsonPath)
        yield* fs.makeDirectory(dir, { recursive: true })
        yield* fs.writeFileString(jsonPath, json)
      }).pipe(
        Effect.mapError(
          (error) =>
            new ExportError({
              message: `Failed to export to file: ${jsonPath}`,
              cause: error
            })
        )
      )

    /**
     * Export to clipboard
     */
    const toClipboard = (json: string): Effect.Effect<void, ExportError> =>
      Effect.tryPromise({
        try: () => clipboardy.write(json),
        catch: (error) =>
          new ExportError({
            message: "Failed to copy to clipboard",
            cause: error
          })
      })

    /**
     * Export a single palette
     */
    const exportPalette = (
      palette: GeneratedPaletteOutput,
      config: ExportConfig
    ): Effect.Effect<void, ExportError> =>
      Effect.gen(function*() {
        if (config.target === "none") {
          return
        }

        const json = JSON.stringify(palette, null, 2)

        if (config.target === "clipboard") {
          yield* toClipboard(json)
        } else if (config.target === "json") {
          if (!config.jsonPath) {
            return yield* Effect.fail(
              new ExportError({
                message: "JSON export requires a file path"
              })
            )
          }
          yield* toFile(json, config.jsonPath)
        }
      })

    /**
     * Export a batch of palettes
     */
    const exportBatch = (
      batch: BatchGeneratedPaletteOutput,
      config: ExportConfig
    ): Effect.Effect<void, ExportError> =>
      Effect.gen(function*() {
        if (config.target === "none") {
          return
        }

        const json = JSON.stringify(batch, null, 2)

        if (config.target === "clipboard") {
          yield* toClipboard(json)
        } else if (config.target === "json") {
          if (!config.jsonPath) {
            return yield* Effect.fail(
              new ExportError({
                message: "JSON export requires a file path"
              })
            )
          }
          yield* toFile(json, config.jsonPath)
        }
      })

    return {
      exportPalette,
      exportBatch
    }
  }),
  dependencies: [NodeFileSystem.layer, NodePath.layer]
}) {}
