/**
 * Batch mode palette generation handler
 */

import * as clack from "@clack/prompts"
import { Effect, Option as O } from "effect"
import type { ColorStopPair } from "../../../../../services/PaletteService/batch.schema.js"
import { PaletteService } from "../../../../../services/PaletteService/index.js"
import { promptForPaletteName, promptForStop } from "../../../../prompts.js"
import { buildExportConfig, displayBatch, executeBatchExport } from "../../output/formatter.js"
import { getPairsWithMissingStops, type ParsedPair, setPairStop } from "../../parsers/batch-parser.js"
import { validateFormat } from "../../validation.js"

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

      for (let i = 0; i < missingStops.length; i++) {
        const pair = missingStops[i]!
        const colorIndex = pairs.findIndex((p) => p.raw === pair.raw) + 1
        const stop = yield* promptForStop(pair.color, colorIndex)
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
        spinner.stop(`Generated ${batchResult.palettes.length} palette(s) with some failures`)
      } else {
        spinner.stop(`Generated ${batchResult.palettes.length} palette(s)`)
      }
    }

    // Display results
    yield* displayBatch(batchResult)

    // Handle export
    const exportConfig = yield* buildExportConfig(exportOpt, exportPath)

    yield* O.match(exportConfig, {
      onNone: () => Effect.void,
      onSome: (config) => executeBatchExport(batchResult, config)
    })

    return batchResult
  })
