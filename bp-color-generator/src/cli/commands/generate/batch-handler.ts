/**
 * Batch mode palette generation handler
 */

import * as clack from "@clack/prompts"
import { Effect, Option as O } from "effect"
import type { ColorStopPair } from "../../../schemas/batch.js"
import type { ExportConfig } from "../../../schemas/export.js"
import { ExportService } from "../../../services/ExportService.js"
import { PaletteService } from "../../../services/PaletteService.js"
import { getPairsWithMissingStops, type ParsedPair, setPairStop } from "../../parse-batch-input.js"
import { promptForJsonPath, promptForPaletteName, promptForStop } from "../../prompts.js"
import { displayBatchInteractive } from "../shared.js"
import { validateExportTarget, validateFormat } from "./validation.js"

/**
 * Handle batch mode palette generation
 */
export const handleBatchMode = ({
  exportOpt,
  exportPath,
  formatOpt,
  isInteractive,
  nameOpt,
  pairs,
  pattern
}: {
  exportOpt: O.Option<string>
  exportPath: O.Option<string>
  formatOpt: O.Option<string>
  isInteractive: boolean
  nameOpt: O.Option<string>
  pairs: Array<ParsedPair>
  pattern: string
}) =>
  Effect.gen(function*() {
    if (isInteractive) {
      clack.log.success(`Found ${pairs.length} color(s)`)
    }

    // Prompt for missing stops
    const missingStops = getPairsWithMissingStops(pairs)
    if (missingStops.length > 0) {
      if (isInteractive) {
        clack.log.warn(`${missingStops.length} color(s) missing stop position`)
      }

      for (const pair of missingStops) {
        if (isInteractive) {
          clack.log.info(`For color: ${pair.color}`)
        }
        const stop = yield* promptForStop()
        const updated = yield* setPairStop(pair, stop)
        // Update in pairs array
        const index = pairs.findIndex((p) => p.raw === pair.raw)
        if (index !== -1) {
          pairs[index] = updated
        }
      }
    }

    // Convert to ColorStopPair array
    const colorStopPairs: Array<ColorStopPair> = pairs.map((p) => ({
      color: p.color,
      stop: p.stop!
    }))

    // Get output format with validation
    const format = yield* validateFormat(formatOpt)

    // Get group name
    const groupName = yield* O.match(nameOpt, {
      onNone: () => promptForPaletteName("batch"),
      onSome: (value) => Effect.succeed(value)
    })

    // Generate batch palettes
    const service = yield* PaletteService

    const spinner = isInteractive ? clack.spinner() : undefined
    if (spinner) {
      spinner.start(`Generating ${colorStopPairs.length} palette(s)...`)
    }

    const batchResult = yield* service.generateBatch({
      pairs: colorStopPairs,
      outputFormat: format,
      paletteGroupName: groupName,
      patternSource: pattern
    })

    if (spinner) {
      if (batchResult.partial) {
        spinner.stop(`⚠️  Generated ${batchResult.palettes.length} palette(s) with some failures`)
      } else {
        spinner.stop(`✅ Generated ${batchResult.palettes.length} palette(s)`)
      }
    }

    // Display results
    yield* displayBatchInteractive(batchResult)

    // Handle export with validation
    const exportTarget = yield* validateExportTarget(exportOpt)

    if (exportTarget !== "none") {
      let jsonPathValue = O.getOrUndefined(exportPath)
      if (exportTarget === "json" && !jsonPathValue) {
        jsonPathValue = yield* promptForJsonPath()
      }

      const exportConfig: ExportConfig = {
        target: exportTarget,
        jsonPath: jsonPathValue,
        includeOKLCH: true
      }

      const exportService = yield* ExportService
      yield* exportService.exportBatch(batchResult, exportConfig)
      clack.log.success(
        exportTarget === "json"
          ? `Exported to ${exportConfig.jsonPath}`
          : "Copied to clipboard!"
      )
    }

    return batchResult
  })
