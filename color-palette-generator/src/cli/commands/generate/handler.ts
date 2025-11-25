/**
 * Main command handler for palette generation
 *
 * Uses ModeResolver to detect execution mode and routes to appropriate handler
 */

import * as clack from "@clack/prompts"
import { Effect, Option as O } from "effect"
import { ConfigService } from "../../../services/ConfigService.js"
import {
  promptForAnotherTransformation,
  promptForBatchInputMode,
  promptForBatchPaste,
  promptForReferenceColor,
  promptForStop,
  promptForTargetColors
} from "../../prompts.js"
import { handleBatchMode } from "./modes/batch/executor.js"
import { ModeResolver } from "./modes/resolver.js"
import { handleSingleMode } from "./modes/single/executor.js"
import {
  handleBatchTransformations,
  handleOneToManyTransformation,
  handleSingleTransformation
} from "./modes/transform/executor.js"
import { parseBatchPairsInput } from "./parsers/batch-parser.js"

/**
 * Main handler for the generate command
 *
 * Detects mode (batch vs single) and delegates to appropriate handler
 */
export const handleGenerate = ({
  colorOpt,
  exportOpt,
  exportPath,
  formatOpt,
  nameOpt,
  patternOpt,
  stopOpt
}: {
  colorOpt: O.Option<string>
  exportOpt: O.Option<string>
  exportPath: O.Option<string>
  formatOpt: O.Option<string>
  nameOpt: O.Option<string>
  patternOpt: O.Option<string>
  stopOpt: O.Option<number>
}) =>
  Effect.gen(function*() {
    // Get pattern from option or config
    const config = yield* ConfigService
    const pattern = yield* O.match(patternOpt, {
      onNone: () => config.getPatternSource(),
      onSome: (p) => Effect.succeed(p)
    })

    // Use ModeResolver to detect execution mode
    const resolver = yield* ModeResolver
    const detection = yield* resolver.detectMode({
      colorOpt,
      stopOpt,
      formatOpt,
      nameOpt,
      patternOpt,
      exportOpt,
      exportPath
    })

    const { isInteractive, mode } = detection

    // Determine if we need to show intro (any prompts will be displayed)
    const willPrompt = isInteractive ||
      O.isNone(formatOpt) ||
      O.isNone(nameOpt) ||
      (mode._tag === "SinglePalette" && O.isNone(stopOpt))

    // Show intro before any prompts
    if (willPrompt) {
      clack.intro("🎨 Color Palette Generator")
    }

    // Handle interactive transformation prompts
    if (isInteractive && mode._tag === "SinglePalette" && O.isNone(colorOpt)) {
      const inputMode = yield* promptForBatchInputMode()

      if (inputMode === "paste") {
        const pasteInput = yield* promptForBatchPaste()
        const parsedPairs = yield* parseBatchPairsInput(pasteInput)
        return yield* handleBatchMode({
          exportOpt,
          exportPath,
          formatOpt,
          isInteractive,
          nameOpt,
          pairs: parsedPairs,
          pattern
        })
      } else if (inputMode === "transform") {
        // Interactive transformation mode - support multiple transformations
        const allTransformations = []

        let continueAdding = true
        while (continueAdding) {
          const referenceColor = yield* promptForReferenceColor()
          const targetColors = yield* promptForTargetColors()
          const stop = yield* promptForStop()

          // Build transformation input
          if (targetColors.length === 1) {
            allTransformations.push({
              reference: referenceColor,
              target: targetColors[0]!,
              stop
            })
          } else {
            allTransformations.push({
              reference: referenceColor,
              targets: targetColors,
              stop
            })
          }

          // Ask if user wants to add another
          continueAdding = yield* promptForAnotherTransformation()
        }

        return yield* handleBatchTransformations({
          exportOpt,
          exportPath,
          formatOpt,
          inputs: allTransformations,
          isInteractive,
          nameOpt,
          pattern
        })
      }
      // else: cycle mode falls through to single palette mode
    }

    // Route to appropriate handler based on detected mode
    let result
    switch (mode._tag) {
      case "SinglePalette":
        result = yield* handleSingleMode({
          colorOpt,
          exportOpt,
          exportPath,
          formatOpt,
          nameOpt,
          pattern,
          stopOpt
        })
        break

      case "BatchPalettes":
        result = yield* handleBatchMode({
          exportOpt,
          exportPath,
          formatOpt,
          isInteractive,
          nameOpt,
          pairs: mode.pairs.map((p) => ({ color: p.color, stop: p.stop, raw: `${p.color}::${p.stop}` })),
          pattern
        })
        break

      case "SingleTransform":
        result = yield* handleSingleTransformation({
          exportOpt,
          exportPath,
          formatOpt,
          input: mode.input,
          isInteractive,
          nameOpt,
          pattern
        })
        break

      case "ManyTransform":
        result = yield* handleOneToManyTransformation({
          exportOpt,
          exportPath,
          formatOpt,
          input: {
            reference: mode.reference,
            targets: mode.targets,
            stop: mode.stop
          },
          isInteractive,
          nameOpt,
          pattern
        })
        break

      case "BatchTransform":
        result = yield* handleBatchTransformations({
          exportOpt,
          exportPath,
          formatOpt,
          inputs: [...mode.transformations],
          isInteractive,
          nameOpt,
          pattern
        })
        break
    }

    // Show outro after everything is complete
    clack.outro("Done! ✓")

    return result
  })
