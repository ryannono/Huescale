/**
 * Export service for palette output
 *
 * Provides JSON file export, clipboard export, and batch export support.
 * Uses Effect's FileSystem service for better testing and abstraction.
 */

import { FileSystem, Path } from "@effect/platform"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import clipboardy from "clipboardy"
import { Data, Effect, Match } from "effect"
import type { BatchResult, PaletteResult } from "../PaletteService/palette.schema.js"
import type { ExportConfig } from "./export.schema.js"
import { JSONPath } from "./export.schema.js"

// ============================================================================
// Constants
// ============================================================================

/** JSON indentation for pretty printing */
const JSON_INDENT = 2

// ============================================================================
// Errors
// ============================================================================

/**
 * Error when export operations fail
 */
export class ExportError extends Data.TaggedError("ExportError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ============================================================================
// Service
// ============================================================================

/**
 * Export service using Effect.Service pattern
 */
export class ExportService extends Effect.Service<ExportService>()("ExportService", {
  effect: Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    return {
      /**
       * Export single palette
       */
      exportPalette: (palette: PaletteResult, config: ExportConfig): Effect.Effect<void, ExportError> =>
        exportData(palette, config, fs, path),

      /**
       * Export batch of palettes
       */
      exportBatch: (batch: BatchResult, config: ExportConfig): Effect.Effect<void, ExportError> =>
        exportData(batch, config, fs, path)
    }
  }),
  dependencies: [NodeFileSystem.layer, NodePath.layer]
}) {}

// ============================================================================
// Export Helpers
// ============================================================================

/**
 * Serialize data to JSON string
 */
const serializeForExport = <T>(data: T): string => JSON.stringify(data, null, JSON_INDENT)

/**
 * Export data based on config target (exhaustive pattern match)
 */
const exportData = (
  data: PaletteResult | BatchResult,
  config: ExportConfig,
  fs: FileSystem.FileSystem,
  path: Path.Path
): Effect.Effect<void, ExportError> =>
  Match.value(config.target).pipe(
    Match.when("none", () => Effect.void),
    Match.when("clipboard", () => toClipboard(serializeForExport(data))),
    Match.when("json", () =>
      Effect.gen(function*() {
        // Validate JSONPath
        const validatedPath = yield* JSONPath(config.jsonPath).pipe(
          Effect.mapError(
            (error) =>
              new ExportError({
                message: `Invalid JSON path: ${config.jsonPath}`,
                cause: error
              })
          )
        )
        yield* toFile(serializeForExport(data), validatedPath, fs, path)
      })),
    Match.exhaustive
  )

/**
 * Export to JSON file
 */
const toFile = (
  json: string,
  jsonPath: string,
  fs: FileSystem.FileSystem,
  path: Path.Path
): Effect.Effect<void, ExportError> =>
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
