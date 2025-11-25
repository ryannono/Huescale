/**
 * Single palette mode handler
 */

import { Effect, Option as O } from "effect"
import { promptForPaletteName } from "../../../../prompts.js"
import { buildExportConfig, displayPalette, executePaletteExport, generateAndDisplay } from "../../output/formatter.js"
import { validateColor, validateFormat, validateStop } from "../../validation.js"

/**
 * Handle single palette mode generation
 */
export const handleSingleMode = ({
  colorOpt,
  exportOpt,
  exportPath,
  formatOpt,
  nameOpt,
  pattern,
  stopOpt
}: {
  colorOpt: O.Option<string>
  exportOpt: O.Option<string>
  exportPath: O.Option<string>
  formatOpt: O.Option<string>
  nameOpt: O.Option<string>
  pattern: string
  stopOpt: O.Option<number>
}) =>
  Effect.gen(function*() {
    // Validate inputs with retry on error
    const color = yield* validateColor(colorOpt)
    const stop = yield* validateStop(stopOpt)
    const format = yield* validateFormat(formatOpt)

    const name = yield* O.match(nameOpt, {
      onNone: () => promptForPaletteName("generated"),
      onSome: (value) => Effect.succeed(value)
    })

    // Generate palette
    const result = yield* generateAndDisplay({ color, format, name, pattern, stop })

    // Display palette
    yield* displayPalette(result)

    // Handle export
    const exportConfig = yield* buildExportConfig(exportOpt, exportPath)

    yield* O.match(exportConfig, {
      onNone: () => Effect.void,
      onSome: (config) => executePaletteExport(result, config)
    })

    return result
  })
