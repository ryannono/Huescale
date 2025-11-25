/**
 * Shared command logic for palette generation
 */

import * as clack from "@clack/prompts"
import { Effect, Option as O } from "effect"
import { BatchGeneratedPaletteOutput } from "../../../../schemas/batch.js"
import { ColorSpace } from "../../../../schemas/color.js"
import type { ExportConfig } from "../../../../schemas/export.js"
import { GeneratePaletteInput } from "../../../../schemas/generate-palette.js"
import { StopPosition } from "../../../../schemas/palette.js"
import { ExportService } from "../../../../services/ExportService.js"
import { PaletteService } from "../../../../services/PaletteService.js"
import { promptForJsonPath } from "../../../prompts.js"
import { validateExportTarget } from "../validation.js"

/**
 * Generate and display palette
 */
export const generateAndDisplay = ({
  color,
  format,
  name,
  pattern,
  stop
}: {
  color: string
  format: ColorSpace
  name: string
  pattern: string
  stop: StopPosition
}) =>
  Effect.gen(function*() {
    const service = yield* PaletteService

    // Validate and create input using schema
    const input = yield* GeneratePaletteInput({
      anchorStop: stop,
      inputColor: color,
      outputFormat: format,
      paletteName: name,
      patternSource: pattern
    })

    // Generate palette
    const result = yield* service.generate(input)

    return result
  })

/**
 * Display palette with clack formatting
 */
export const displayPalette = (
  result: Effect.Effect.Success<ReturnType<typeof generateAndDisplay>>
) =>
  Effect.sync(() => {
    clack.note(
      `Input: ${result.inputColor} at stop ${result.anchorStop}\nFormat: ${result.outputFormat}\n\n${
        result.stops.map((s) => `  ${s.position}: ${s.value}`).join("\n")
      }`,
      `Palette: ${result.name}`
    )
  })

/**
 * Display batch results with clack formatting
 */
export const displayBatch = (batch: BatchGeneratedPaletteOutput) =>
  Effect.sync(() => {
    const status = batch.partial ? "Generated with some failures" : "All generated successfully"

    clack.log.success(`${status}: ${batch.palettes.length} palette(s) ✓`)
    clack.log.info(`Group: ${batch.groupName}`)
    clack.log.info(`Format: ${batch.outputFormat}`)

    for (const palette of batch.palettes) {
      clack.note(
        `Input: ${palette.inputColor} at stop ${palette.anchorStop}\n\n${
          palette.stops.map((s) => `  ${s.position}: ${s.value}`).join("\n")
        }`,
        palette.name
      )
    }
  })

/**
 * Validate and build export config
 * Returns None if export target is "none", otherwise returns the config
 */
export const buildExportConfig = (
  exportOpt: O.Option<string>,
  exportPath: O.Option<string>
) =>
  Effect.gen(function*() {
    const exportTarget = yield* validateExportTarget(exportOpt)

    if (exportTarget === "none") {
      return O.none()
    }

    let jsonPathValue = O.getOrUndefined(exportPath)
    if (exportTarget === "json" && !jsonPathValue) {
      jsonPathValue = yield* promptForJsonPath()
    }

    const config: ExportConfig = {
      target: exportTarget,
      jsonPath: jsonPathValue,
      includeOKLCH: true
    }

    return O.some(config)
  })

/**
 * Execute export for a single palette with config
 */
export const executePaletteExport = (
  palette: Effect.Effect.Success<ReturnType<typeof generateAndDisplay>>,
  config: ExportConfig
) =>
  Effect.gen(function*() {
    const exportService = yield* ExportService
    yield* exportService.exportPalette(palette, config)
    clack.log.success(
      config.target === "json"
        ? `Exported to ${config.jsonPath}`
        : "Copied to clipboard!"
    )
  })

/**
 * Execute export for multiple palettes with config
 */
export const executePalettesExport = (
  palettes: Array<Effect.Effect.Success<ReturnType<typeof generateAndDisplay>>>,
  config: ExportConfig
) =>
  Effect.gen(function*() {
    const exportService = yield* ExportService
    // Export each palette individually
    for (const palette of palettes) {
      yield* exportService.exportPalette(palette, config)
    }
    clack.log.success(
      config.target === "json"
        ? `Exported ${palettes.length} palette(s) to ${config.jsonPath}`
        : `Copied ${palettes.length} palette(s) to clipboard!`
    )
  })

/**
 * Execute export for batch result with config
 */
export const executeBatchExport = (
  batch: BatchGeneratedPaletteOutput,
  config: ExportConfig
) =>
  Effect.gen(function*() {
    const exportService = yield* ExportService
    yield* exportService.exportBatch(batch, config)
    clack.log.success(
      config.target === "json"
        ? `Exported to ${config.jsonPath}`
        : "Copied to clipboard!"
    )
  })
