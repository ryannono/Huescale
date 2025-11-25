/**
 * Main command handler for palette generation
 *
 * Orchestrates mode detection (batch vs single) and routes to appropriate handler
 */

import * as clack from "@clack/prompts"
import { Effect, Either, Option as O } from "effect"
import { parseBatchPairsInput, type ParsedPair } from "../../parse-batch-input.js"
import { promptForBatchInputMode, promptForBatchPaste } from "../../prompts.js"
import { handleBatchMode } from "./batch-handler.js"
import { handleSingleMode } from "./single-handler.js"

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
    // Determine if interactive mode
    const hasColorInput = O.isSome(colorOpt)
    const isInteractive = !hasColorInput || O.isSome(stopOpt) === false

    // Try to detect batch mode from color input
    let pairs: Array<ParsedPair> | undefined
    let isBatchMode = false

    if (hasColorInput) {
      const colorValue = O.getOrThrow(colorOpt)
      // Try parsing as batch input (comma or newline separated)
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
    } else {
      // No color provided - prompt for mode
      if (isInteractive) {
        clack.intro("🎨 BP Color Palette Generator")
        const inputMode = yield* promptForBatchInputMode()

        if (inputMode === "paste") {
          const pasteInput = yield* promptForBatchPaste()
          const parsedPairs = yield* parseBatchPairsInput(pasteInput)
          isBatchMode = true
          pairs = parsedPairs
        } else {
          clack.log.info("Cycle mode not yet implemented. Using single palette mode.")
        }
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
