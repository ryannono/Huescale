/** Generates multiple palettes from a batch of color/stop pairs. */

import { FileSystem } from "@effect/platform"
import { Array as Arr, Data, Effect, Exit, Option as O, pipe } from "effect"
import type { BatchResult } from "../../../../../domain/palette/palette.schema.js"
import { makeFilePatternLoader } from "../../../../../io/patternLoader.js"
import { ConsoleService } from "../../../../../services/ConsoleService/index.js"
import { generateBatch } from "../../../../../usecases/generateBatch.js"
import { buildExportConfig, displayBatch, executeBatchExport } from "../../formatter.js"
import type { BatchPalettesComplete } from "../../inputSpecs/batchPalettes.input.js"

// ============================================================================
// Constants
// ============================================================================

const Messages = {
  foundColors: (count: number) => `Found ${count} color(s)`,
  generated: (count: number, failureCount: number) =>
    failureCount > 0
      ? `Generated ${count} palette(s) with ${failureCount} failure(s)`
      : `Generated ${count} palette(s)`,
  generating: (count: number) => `Generating ${count} palette(s)...`,
  operationFailed: "Operation failed"
}

// ============================================================================
// Types
// ============================================================================

type ExecutionMode = Data.TaggedEnum<{
  Interactive: object
  Silent: object
}>

const ExecutionMode = Data.taggedEnum<ExecutionMode>()

const isInteractiveMode = ExecutionMode.$is("Interactive")

const toExecutionMode = (isInteractive: boolean): ExecutionMode =>
  isInteractive ? ExecutionMode.Interactive() : ExecutionMode.Silent()

type BatchExecuteOptions = {
  readonly exportOpt: O.Option<string>
  readonly exportPath: O.Option<string>
  readonly isInteractive: boolean
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Execute batch palette generation with complete, validated input.
 *
 * This is the new workflow-based API that receives fully validated input.
 * No prompting or validation happens here - just pure execution.
 */
export const executeBatchPalettes = (
  input: BatchPalettesComplete,
  options: BatchExecuteOptions
) =>
  Effect.gen(function*() {
    const console = yield* ConsoleService
    const fs = yield* FileSystem.FileSystem
    const mode = toExecutionMode(options.isInteractive)

    const colorAnchors = Arr.map(input.pairs, ({ color, stop }) => ({ color, stop }))
    yield* logWhenInteractive(console, "success", Messages.foundColors(colorAnchors.length), mode)

    const loadPattern = makeFilePatternLoader(fs)
    const batchResult = yield* withSpinner(
      console,
      generateBatch(
        {
          pairs: colorAnchors,
          outputFormat: input.format,
          groupName: input.name,
          patternSource: input.pattern
        },
        loadPattern
      ),
      Messages.generating(colorAnchors.length),
      (result) => Messages.generated(result.palettes.length, result.failures.length),
      mode
    )

    yield* displayBatch(batchResult)
    yield* handleExport(batchResult, options.exportOpt, options.exportPath)

    return batchResult
  })

// ============================================================================
// Logging
// ============================================================================

type LogLevel = "success" | "warning" | "error" | "info"

const logWhenInteractive = (
  console: ConsoleService,
  level: LogLevel,
  message: string,
  mode: ExecutionMode
): Effect.Effect<void> =>
  pipe(
    Effect.when(console.log[level](message), () => isInteractiveMode(mode)),
    Effect.asVoid
  )

// ============================================================================
// Generation
// ============================================================================

/** Wraps an effect with spinner feedback in interactive mode. */
const withSpinner = <A, E, R>(
  console: ConsoleService,
  effect: Effect.Effect<A, E, R>,
  startMessage: string,
  completeMessage: (result: A) => string,
  mode: ExecutionMode
): Effect.Effect<A, E, R> =>
  isInteractiveMode(mode)
    ? Effect.acquireUseRelease(
      Effect.flatMap(console.spinner(), (s) => Effect.as(s.start(startMessage), s)),
      () => effect,
      (spinner, exit) => {
        const message = Exit.isSuccess(exit)
          ? completeMessage(exit.value)
          : Messages.operationFailed
        return spinner.stop(message)
      }
    )
    : effect

// ============================================================================
// Export
// ============================================================================

const handleExport = (
  batchResult: BatchResult,
  exportOpt: O.Option<string>,
  exportPath: O.Option<string>
) =>
  pipe(
    buildExportConfig(exportOpt, exportPath),
    Effect.flatMap(
      O.match({
        onNone: () => Effect.void,
        onSome: (config) => executeBatchExport(batchResult, config)
      })
    )
  )
