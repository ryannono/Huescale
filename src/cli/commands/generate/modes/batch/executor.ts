/** Generates multiple palettes from a batch of color/stop pairs. */

import * as clack from "@clack/prompts"
import { Array as Arr, Data, Effect, Exit, HashMap, Option as O, pipe } from "effect"
import type { ColorSpace } from "../../../../../domain/color/color.schema.js"
import type { StopPosition } from "../../../../../domain/palette/palette.schema.js"
import { ConfigService } from "../../../../../services/ConfigService.js"
import { PaletteService } from "../../../../../services/PaletteService/index.js"
import type { BatchResult, ColorAnchor } from "../../../../../services/PaletteService/palette.schema.js"
import { promptForPaletteName, promptForStop } from "../../../../prompts.js"
import { buildExportConfig, displayBatch, executeBatchExport } from "../../output/formatter.js"
import { type ParsedPair, setPairStop } from "../../parsers/batch-parser.js"
import { validateFormat } from "../../validation.js"

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_FALLBACK_STOP: StopPosition = 500

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

type BatchModeOptions = {
  readonly exportOpt: O.Option<string>
  readonly exportPath: O.Option<string>
  readonly formatOpt: O.Option<string>
  readonly isInteractive: boolean
  readonly nameOpt: O.Option<string>
  readonly pairs: Arr.NonEmptyReadonlyArray<ParsedPair>
  readonly pattern: string
}

type IndexedPair = {
  readonly originalIndex: number
  readonly pair: ParsedPair
}

type CompletePair = {
  readonly color: string
  readonly raw: string
  readonly stop: StopPosition
}

// ============================================================================
// Constants
// ============================================================================

const Messages = {
  foundColors: (count: number) => `Found ${count} color(s)`,
  generated: (count: number, partial: boolean) =>
    partial
      ? `Generated ${count} palette(s) with some failures`
      : `Generated ${count} palette(s)`,
  generating: (count: number) => `Generating ${count} palette(s)...`,
  missingStops: (count: number) => `${count} color(s) missing stop position`,
  operationFailed: "Operation failed"
}

// ============================================================================
// Public API
// ============================================================================

/** Prompts for missing stops, generates palettes, and handles export. */
export const handleBatchMode = ({
  exportOpt,
  exportPath,
  formatOpt,
  isInteractive,
  nameOpt,
  pairs,
  pattern
}: BatchModeOptions) =>
  Effect.gen(function*() {
    const mode = toExecutionMode(isInteractive)
    yield* logWhenInteractive(clack.log.success, Messages.foundColors(pairs.length), mode)

    const completedPairs = yield* completeMissingStops(pairs, mode)
    const colorAnchors = toColorAnchors(completedPairs)
    const format = yield* validateFormat(formatOpt)

    const config = yield* ConfigService
    const configData = yield* config.getConfig()
    const groupName = yield* O.match(nameOpt, {
      onNone: () => promptForPaletteName(configData.defaultBatchName),
      onSome: Effect.succeed
    })

    const service = yield* PaletteService
    const batchResult = yield* withSpinner(
      generateBatch(service, colorAnchors, format, groupName, pattern),
      Messages.generating(colorAnchors.length),
      (result) => Messages.generated(result.palettes.length, result.partial),
      mode
    )

    yield* displayBatch(batchResult)
    yield* handleExport(batchResult, exportOpt, exportPath)

    return batchResult
  })

// ============================================================================
// Logging
// ============================================================================

const logWhenInteractive = (
  logFn: (msg: string) => void,
  message: string,
  mode: ExecutionMode
): Effect.Effect<void> =>
  pipe(
    Effect.when(
      Effect.sync(() => logFn(message)),
      () => isInteractiveMode(mode)
    ),
    Effect.asVoid
  )

// ============================================================================
// Completion
// ============================================================================

/** Prompts user for missing stop positions and returns all pairs completed. */
const completeMissingStops = (
  pairs: Arr.NonEmptyReadonlyArray<ParsedPair>,
  mode: ExecutionMode
) =>
  Effect.gen(function*() {
    const incomplete = findIncompletePairs(pairs)

    if (incomplete.length === 0) {
      return toCompletePairs(pairs)
    }

    yield* logWhenInteractive(clack.log.warn, Messages.missingStops(incomplete.length), mode)

    const nowComplete = yield* Effect.forEach(
      incomplete,
      ({ originalIndex, pair }) =>
        pipe(
          promptForStop(pair.color, originalIndex + 1),
          Effect.flatMap((stop) => setPairStop(pair, stop))
        ),
      { concurrency: 1 }
    )

    return mergeCompletedPairs(pairs, nowComplete, incomplete)
  })

const findIncompletePairs = (pairs: ReadonlyArray<ParsedPair>): ReadonlyArray<IndexedPair> =>
  pipe(
    pairs,
    Arr.filterMap((pair, index) =>
      pair.stop === undefined
        ? O.some({ originalIndex: index, pair })
        : O.none()
    )
  )

const pairHasStop = (
  pair: ParsedPair
): pair is ParsedPair & { readonly stop: StopPosition } => pair.stop !== undefined

const toComplete = (pair: ParsedPair & { readonly stop: StopPosition }): CompletePair => ({
  color: pair.color,
  raw: pair.raw,
  stop: pair.stop
})

const toCompletePairs = (
  pairs: Arr.NonEmptyReadonlyArray<ParsedPair>
): Arr.NonEmptyReadonlyArray<CompletePair> =>
  pipe(
    pairs,
    Arr.filter(pairHasStop),
    Arr.match({
      onEmpty: () => [toComplete({ ...Arr.headNonEmpty(pairs), stop: DEFAULT_FALLBACK_STOP })],
      onNonEmpty: (nonEmpty) => Arr.map(nonEmpty, toComplete)
    })
  )

const toIndexEntry = (
  [{ originalIndex }, completed]: readonly [IndexedPair, ParsedPair]
): readonly [number, ParsedPair] => [originalIndex, completed]

/** Merges completed pairs back into original order preserving indices. */
const mergeCompletedPairs = (
  original: Arr.NonEmptyReadonlyArray<ParsedPair>,
  nowComplete: ReadonlyArray<ParsedPair>,
  incomplete: ReadonlyArray<IndexedPair>
): Arr.NonEmptyReadonlyArray<CompletePair> => {
  const completedByIndex = pipe(
    incomplete,
    Arr.zip(nowComplete),
    Arr.map(toIndexEntry),
    HashMap.fromIterable
  )

  const lookupOrKeep = (pair: ParsedPair, index: number): ParsedPair =>
    pipe(
      HashMap.get(completedByIndex, index),
      O.getOrElse(() => pair)
    )

  const toCompletePairOption = (pair: ParsedPair): O.Option<CompletePair> =>
    pair.stop !== undefined
      ? O.some({ color: pair.color, raw: pair.raw, stop: pair.stop })
      : O.none()

  const merged = pipe(
    original,
    Arr.filterMap((pair, index) => toCompletePairOption(lookupOrKeep(pair, index)))
  )

  return Arr.match(merged, {
    onEmpty: () => [toComplete({ ...Arr.headNonEmpty(original), stop: DEFAULT_FALLBACK_STOP })],
    onNonEmpty: (nonEmpty) => nonEmpty
  })
}

// ============================================================================
// Conversion
// ============================================================================

const toColorAnchors = (
  pairs: Arr.NonEmptyReadonlyArray<CompletePair>
): Arr.NonEmptyReadonlyArray<ColorAnchor> => Arr.map(pairs, ({ color, stop }) => ({ color, stop }))

// ============================================================================
// Generation
// ============================================================================

/** Wraps an effect with spinner feedback in interactive mode. */
const withSpinner = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  startMessage: string,
  completeMessage: (result: A) => string,
  mode: ExecutionMode
): Effect.Effect<A, E, R> =>
  isInteractiveMode(mode)
    ? Effect.acquireUseRelease(
      Effect.sync(() => {
        const spinner = clack.spinner()
        spinner.start(startMessage)
        return spinner
      }),
      () => effect,
      (spinner, exit) =>
        Effect.sync(() => {
          const message = Exit.isSuccess(exit)
            ? completeMessage(exit.value)
            : Messages.operationFailed
          spinner.stop(message)
        })
    )
    : effect

const generateBatch = (
  service: PaletteService,
  colorAnchors: Arr.NonEmptyReadonlyArray<ColorAnchor>,
  format: ColorSpace,
  groupName: string,
  pattern: string
) =>
  service.generateBatch({
    outputFormat: format,
    pairs: colorAnchors,
    paletteGroupName: groupName,
    patternSource: pattern
  })

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
