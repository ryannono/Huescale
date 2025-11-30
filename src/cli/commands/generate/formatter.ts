/**
 * Shared command logic for palette generation
 *
 * Provides functions for generating palettes, displaying results,
 * and handling export operations.
 */

import { FileSystem, Path } from "@effect/platform"
import { Array as Arr, Effect, Option as O, ParseResult, pipe } from "effect"
import type { ColorSpace } from "../../../domain/color/color.schema.js"
import type { BatchResult, PaletteResult, StopPosition } from "../../../domain/palette/palette.schema.js"
import { makeFileExporter } from "../../../io/exporter.js"
import type { ExportConfig, JSONPath as JSONPathType } from "../../../io/io.schema.js"
import { JSONPath } from "../../../io/io.schema.js"
import { makeFilePatternLoader } from "../../../io/patternLoader.js"
import { ConsoleService } from "../../../services/ConsoleService/index.js"
import { CancelledError, PromptService } from "../../../services/PromptService/index.js"
import { generatePalette } from "../../../usecases/generatePalette.js"
import { promptForJsonPath } from "../../prompts.js"
import { validateExportTarget } from "./validation.js"

// ============================================================================
// Constants
// ============================================================================

const Messages = {
  batchStatus: (count: number, failureCount: number) =>
    failureCount > 0
      ? `Generated with ${failureCount} failure(s): ${count} palette(s) ✓`
      : `All generated successfully: ${count} palette(s) ✓`,
  copiedToClipboard: "Copied to clipboard!",
  exportedToJson: (path: JSONPathType | undefined) => `Exported to ${path}`,
  format: (format: string) => `Format: ${format}`,
  group: (name: string) => `Group: ${name}`,
  paletteTitle: (name: string) => `Palette: ${name}`,
  failure: (color: string, stop: number, error: string) => `Failed: ${color} at stop ${stop} - ${error}`
} as const

// ============================================================================
// Types
// ============================================================================

type GenerateAndDisplayOptions = {
  readonly color: string
  readonly format: ColorSpace
  readonly name: string
  readonly pattern: string
  readonly stop: StopPosition
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate a palette from color and stop position
 *
 * Uses the generatePalette use case with filesystem pattern loader.
 */
export const generateAndDisplay = ({
  color,
  format,
  name,
  pattern,
  stop
}: GenerateAndDisplayOptions) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const loadPattern = makeFilePatternLoader(fs)

    return yield* generatePalette(
      {
        anchorStop: stop,
        inputColor: color,
        outputFormat: format,
        paletteName: name,
        patternSource: pattern
      },
      loadPattern
    )
  })

/**
 * Display a single palette result
 *
 * Formats and outputs the palette using clack's note display,
 * showing input color, anchor stop, format, and all generated stops.
 */
export const displayPalette = (result: PaletteResult) =>
  Effect.gen(function*() {
    const console = yield* ConsoleService
    yield* console.note(formatPaletteNote(result), Messages.paletteTitle(result.name))
  })

/**
 * Display batch generation results
 *
 * Shows summary status, group name, output format, failures (if any),
 * and each generated palette in the batch.
 */
export const displayBatch = (batch: BatchResult) =>
  Effect.gen(function*() {
    const console = yield* ConsoleService

    yield* console.log.success(Messages.batchStatus(batch.palettes.length, batch.failures.length))
    yield* console.log.info(Messages.group(batch.groupName))
    yield* console.log.info(Messages.format(batch.outputFormat))

    // Display any failures
    yield* Effect.forEach(batch.failures, (failure) =>
      console.log.warning(Messages.failure(failure.color, failure.stop, failure.error)))

    yield* Effect.forEach(batch.palettes, (palette) =>
      console.note(formatBatchPaletteNote(palette), palette.name))
  })

/**
 * Build export configuration from CLI options
 *
 * Validates the export target and resolves the JSON path if needed.
 * Returns None if export target is "none", otherwise returns the config.
 */
export const buildExportConfig = (
  exportOpt: O.Option<string>,
  exportPath: O.Option<string>
) =>
  pipe(
    validateExportTarget(exportOpt),
    Effect.flatMap((exportTarget) =>
      exportTarget === "none"
        ? Effect.succeed(O.none())
        : pipe(
          resolveJsonPath(exportTarget, exportPath),
          Effect.map(
            (jsonPath): O.Option<ExportConfig> => O.some({ jsonPath, target: exportTarget })
          )
        )
    )
  )

/**
 * Execute export for a single palette
 *
 * Exports the palette to the configured target (JSON file or clipboard)
 * and logs a success message.
 */
export const executePaletteExport = (palette: PaletteResult, config: ExportConfig) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const exportData = makeFileExporter(fs, path)
    yield* exportData(palette, config)
    yield* logExportSuccess(config)
  })

/**
 * Execute export for a batch of palettes
 *
 * Exports all palettes in the batch to the configured target
 * and logs a success message.
 */
export const executeBatchExport = (batch: BatchResult, config: ExportConfig) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const exportData = makeFileExporter(fs, path)
    yield* exportData(batch, config)
    yield* logExportSuccess(config)
  })

// ============================================================================
// Internal Helpers
// ============================================================================

/** Format stops as indented list */
const formatStopsList = (stops: PaletteResult["stops"]): string =>
  pipe(
    stops,
    Arr.map((s) => `  ${s.position}: ${s.value}`),
    Arr.join("\n")
  )

/** Format single palette note with format line */
const formatPaletteNote = (palette: PaletteResult): string =>
  `Input: ${palette.inputColor} at stop ${palette.anchorStop}\n` +
  `Format: ${palette.outputFormat}\n\n` +
  formatStopsList(palette.stops)

/** Format batch palette note without format line */
const formatBatchPaletteNote = (palette: PaletteResult): string =>
  `Input: ${palette.inputColor} at stop ${palette.anchorStop}\n\n${formatStopsList(palette.stops)}`

/** Get success message based on export target */
const getExportSuccessMessage = (config: ExportConfig): string =>
  config.target === "json"
    ? Messages.exportedToJson(config.jsonPath)
    : Messages.copiedToClipboard

/** Resolve JSON path from option or prompt user */
const resolveJsonPath = (
  exportTarget: ExportConfig["target"],
  exportPath: O.Option<string>
): Effect.Effect<JSONPathType | undefined, ParseResult.ParseError | CancelledError, PromptService> =>
  exportTarget === "json"
    ? pipe(
      exportPath,
      O.match({
        onNone: () => promptForJsonPath(),
        onSome: (path) => JSONPath(path)
      })
    )
    : Effect.succeed(undefined)

/** Log export success message */
const logExportSuccess = (config: ExportConfig) =>
  Effect.gen(function*() {
    const console = yield* ConsoleService
    yield* console.log.success(getExportSuccessMessage(config))
  })
