/**
 * Single palette mode handler
 *
 * Generates a single palette from a color and anchor stop position.
 */

import { Effect, Option as O } from "effect"
import { promptForPaletteName } from "../../../../prompts.js"
import { buildExportConfig, displayPalette, executePaletteExport, generateAndDisplay } from "../../output/formatter.js"
import { validateColor, validateFormat, validateStop } from "../../validation.js"

// ============================================================================
// Types
// ============================================================================

type SingleModeOptions = {
  readonly colorOpt: O.Option<string>
  readonly exportOpt: O.Option<string>
  readonly exportPath: O.Option<string>
  readonly formatOpt: O.Option<string>
  readonly nameOpt: O.Option<string>
  readonly pattern: string
  readonly stopOpt: O.Option<number>
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Handle single palette mode generation
 *
 * Validates inputs (prompting for missing required values), generates
 * a palette using the configured pattern, displays the result, and
 * optionally exports to JSON or clipboard.
 */
export const handleSingleMode = ({
  colorOpt,
  exportOpt,
  exportPath,
  formatOpt,
  nameOpt,
  pattern,
  stopOpt
}: SingleModeOptions) =>
  Effect.gen(function*() {
    const color = yield* validateColor(colorOpt)
    const stop = yield* validateStop(stopOpt)
    const format = yield* validateFormat(formatOpt)

    const name = yield* O.match(nameOpt, {
      onNone: () => promptForPaletteName("generated"),
      onSome: Effect.succeed
    })

    const result = yield* generateAndDisplay({ color, format, name, pattern, stop })
    yield* displayPalette(result)

    const exportConfig = yield* buildExportConfig(exportOpt, exportPath)
    yield* O.match(exportConfig, {
      onNone: () => Effect.void,
      onSome: (config) => executePaletteExport(result, config)
    })

    return result
  })
