/**
 * Single palette mode executor
 *
 * Generates a single palette from a color and anchor stop position.
 */

import { Effect, Option as O } from "effect"
import { buildExportConfig, displayPalette, executePaletteExport, generateAndDisplay } from "../../formatter.js"
import type { SinglePaletteComplete } from "../../inputSpecs/singlePalette.input.js"

// ============================================================================
// Types
// ============================================================================

interface SingleModeExecuteOptions {
  readonly exportOpt: O.Option<string>
  readonly exportPath: O.Option<string>
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Execute single palette mode with complete, validated input.
 *
 * This is the new workflow-based API that receives fully validated input.
 * No prompting or validation happens here - just pure execution.
 */
export const executeSinglePalette = (
  input: SinglePaletteComplete,
  options: SingleModeExecuteOptions
) =>
  Effect.gen(function*() {
    const result = yield* generateAndDisplay({
      color: input.color,
      format: input.format,
      name: input.name,
      pattern: input.pattern,
      stop: input.stop
    })
    yield* displayPalette(result)

    const exportConfig = yield* buildExportConfig(options.exportOpt, options.exportPath)
    yield* O.match(exportConfig, {
      onNone: () => Effect.void,
      onSome: (config) => executePaletteExport(result, config)
    })

    return result
  })
