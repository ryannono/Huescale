/**
 * Shared command logic for palette generation
 */

import * as clack from "@clack/prompts"
import { Effect, Option as O } from "effect"
import { ColorSpace } from "../../../../domain/color/color.schema.js"
import { StopPosition } from "../../../../domain/palette/palette.schema.js"
import type { ExportConfig, JSONPath as JSONPathType } from "../../../../services/ExportService/export.schema.js"
import { JSONPath } from "../../../../services/ExportService/export.schema.js"
import { ExportService } from "../../../../services/ExportService/index.js"
import { BatchGeneratedPaletteOutput } from "../../../../services/PaletteService/batch.schema.js"
import { GeneratePaletteInput } from "../../../../services/PaletteService/generation.schema.js"
import { PaletteService } from "../../../../services/PaletteService/index.js"
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

    const jsonPathValue = O.getOrUndefined(exportPath)
    let validatedJsonPath: JSONPathType | undefined = undefined

    if (exportTarget === "json") {
      if (jsonPathValue) {
        // Validate the provided path
        validatedJsonPath = yield* JSONPath(jsonPathValue)
      } else {
        // Prompt for path
        validatedJsonPath = yield* promptForJsonPath()
      }
    }

    const config: ExportConfig = {
      target: exportTarget,
      jsonPath: validatedJsonPath
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
