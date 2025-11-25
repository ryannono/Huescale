/**
 * Main command handler for palette generation
 *
 * Orchestrates mode detection (batch vs single) and routes to appropriate handler
 */

import * as clack from "@clack/prompts"
import { Effect, Either, Option as O } from "effect"
import { ConfigService } from "../../../services/ConfigService.js"
import { parseBatchPairsInput, type ParsedPair } from "../../parse-batch-input.js"
import {
  isTransformationSyntax,
  parseAnyTransformation,
  parseBatchTransformations
} from "../../parse-transformation-input.js"
import {
  promptForAnotherTransformation,
  promptForBatchInputMode,
  promptForBatchPaste,
  promptForReferenceColor,
  promptForStop,
  promptForTargetColors
} from "../../prompts.js"
import { handleBatchMode } from "./batch-handler.js"
import { handleSingleMode } from "./single-handler.js"
import {
  handleBatchTransformations,
  handleOneToManyTransformation,
  handleSingleTransformation
} from "./transformation-handler.js"

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
    const pattern = O.isSome(patternOpt) ? O.getOrThrow(patternOpt) : yield* config.getPatternSource()
    // Determine if interactive mode
    const hasColorInput = O.isSome(colorOpt)
    const isInteractive = !hasColorInput || O.isSome(stopOpt) === false

    // Show intro once at the start for interactive mode
    if (isInteractive) {
      clack.intro("🎨 BP Color Palette Generator")
    }

    // Try to detect transformation mode or batch mode from color input
    let pairs: Array<ParsedPair> | undefined
    let isBatchMode = false
    let isTransformationMode = false
    let transformationInputs: any

    if (hasColorInput) {
      const colorValue = O.getOrThrow(colorOpt)

      // Check if it's transformation syntax (contains >)
      if (isTransformationSyntax(colorValue)) {
        isTransformationMode = true

        // Try to parse as batch transformations first (multiple lines)
        if (colorValue.includes("\n") || (colorValue.split(",").length > 1 && !colorValue.includes("("))) {
          transformationInputs = yield* parseBatchTransformations(colorValue)
        } else {
          // Single transformation
          transformationInputs = [yield* parseAnyTransformation(colorValue)]
        }
      } else {
        // Not transformation syntax - try parsing as regular batch input (comma or newline separated)
        const batchParseResult = yield* Effect.either(parseBatchPairsInput(colorValue))

        if (Either.isRight(batchParseResult)) {
          const parsed = batchParseResult.right
          // If we got multiple pairs, it's batch mode
          if (parsed.length > 1) {
            isBatchMode = true
            pairs = parsed
          } else if (parsed.length === 1) {
            // Single pair - could be batch or single mode
            // If it has :: or : separator, treat as batch
            if (colorValue.includes("::") || colorValue.includes(":")) {
              isBatchMode = true
              pairs = parsed
            }
          }
        }
      }
    } else {
      // No color provided - prompt for mode in interactive
      if (isInteractive) {
        const inputMode = yield* promptForBatchInputMode()

        if (inputMode === "paste") {
          const pasteInput = yield* promptForBatchPaste()
          const parsedPairs = yield* parseBatchPairsInput(pasteInput)
          isBatchMode = true
          pairs = parsedPairs
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
                target: targetColors[0],
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

          transformationInputs = allTransformations
          isTransformationMode = true
        }
        // else: cycle mode just falls through to single palette mode
      }
    }

    // TRANSFORMATION MODE FLOW
    if (isTransformationMode && transformationInputs) {
      if (transformationInputs.length === 1) {
        const input = transformationInputs[0]
        if ("targets" in input) {
          // One-to-many transformation
          return yield* handleOneToManyTransformation({
            formatOpt,
            input,
            isInteractive,
            nameOpt,
            pattern
          })
        } else {
          // Single transformation
          return yield* handleSingleTransformation({
            formatOpt,
            input,
            isInteractive,
            nameOpt,
            pattern
          })
        }
      } else {
        // Batch transformations
        return yield* handleBatchTransformations({
          formatOpt,
          inputs: transformationInputs,
          isInteractive,
          nameOpt,
          pattern
        })
      }
    }

    // BATCH MODE FLOW
    if (isBatchMode && pairs) {
      return yield* handleBatchMode({
        exportOpt,
        exportPath,
        formatOpt,
        isInteractive,
        nameOpt,
        pairs,
        pattern
      })
    }

    // SINGLE PALETTE MODE
    return yield* handleSingleMode({
      colorOpt,
      formatOpt,
      isInteractive,
      nameOpt,
      pattern,
      stopOpt
    })
  })
