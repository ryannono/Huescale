/**
 * Export I/O implementations.
 *
 * Factory functions that create export functions for different targets:
 * - Filesystem (JSON files)
 * - Clipboard
 * - In-memory (testing)
 */

import { FileSystem, Path } from "@effect/platform"
import clipboardy from "clipboardy"
import { Data, Effect, Match } from "effect"
import type { BatchResult, PaletteResult } from "../domain/palette/palette.schema.js"
import type { ExportConfig } from "./io.schema.js"
import { JSONPath } from "./io.schema.js"

// ============================================================================
// Errors
// ============================================================================

/** Error when export operations fail */
export class ExportError extends Data.TaggedError("ExportError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ============================================================================
// Constants
// ============================================================================

/** JSON indentation for pretty printing */
const JSON_INDENT = 2

// ============================================================================
// Types
// ============================================================================

/** Data that can be exported */
export type ExportableData = PaletteResult | BatchResult

/** Function type for exporting data */
export type ExportData = (
  data: ExportableData,
  config: ExportConfig
) => Effect.Effect<void, ExportError>

// ============================================================================
// Filesystem Implementation
// ============================================================================

/**
 * Create an exporter that writes to the filesystem.
 *
 * @param fs - Effect FileSystem service
 * @param path - Effect Path service
 * @returns ExportData function that exports to files or clipboard
 */
export const makeFileExporter = (
  fs: FileSystem.FileSystem,
  path: Path.Path
): ExportData =>
(data, config) =>
  Match.value(config.target).pipe(
    Match.when("none", () => Effect.void),
    Match.when("clipboard", () => toClipboard(serializeForExport(data))),
    Match.when("json", () =>
      Effect.gen(function*() {
        const validatedPath = yield* JSONPath(config.jsonPath).pipe(
          Effect.mapError(
            (cause) =>
              new ExportError({
                message: `Invalid JSON path: ${config.jsonPath}`,
                cause
              })
          )
        )
        yield* toFile(serializeForExport(data), validatedPath, fs, path)
      })),
    Match.exhaustive
  )

// ============================================================================
// In-Memory Implementation (Testing)
// ============================================================================

/** Captured export for testing */
export interface CapturedExport {
  readonly data: ExportableData
  readonly config: ExportConfig
  readonly serialized: string
}

/**
 * Create an exporter that captures exports in memory.
 *
 * Useful for testing without filesystem or clipboard access.
 * NOTE: Intentionally impure (mutates captures array) - for testing only.
 *
 * @param captures - Mutable array to store captured exports
 * @returns ExportData function that captures to the array
 */
export const makeMemoryExporter = (
  captures: Array<CapturedExport>
): ExportData =>
(data, config) =>
  Effect.sync(() => {
    const newCapture: CapturedExport = {
      data,
      config,
      serialized: serializeForExport(data)
    }
    captures.push(newCapture)
  })

// ============================================================================
// Internal Helpers
// ============================================================================

/** Serialize data to JSON string */
const serializeForExport = <T>(data: T): string => JSON.stringify(data, null, JSON_INDENT)

/** Write JSON to file */
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
      (cause) =>
        new ExportError({
          message: `Failed to export to file: ${jsonPath}`,
          cause
        })
    )
  )

/** Copy JSON to clipboard */
const toClipboard = (json: string): Effect.Effect<void, ExportError> =>
  Effect.tryPromise({
    try: () => clipboardy.write(json),
    catch: (cause) =>
      new ExportError({
        message: "Failed to copy to clipboard",
        cause
      })
  })
