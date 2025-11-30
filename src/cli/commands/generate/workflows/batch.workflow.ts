/**
 * BatchPalettes workflow - completes partial input to full input.
 *
 * Takes a BatchPalettesPartial (from CLI/parsed input) and prompts for any missing fields,
 * producing a validated BatchPalettesComplete that can be passed to the executor.
 */

import { Array as Arr, Effect, Option as O, pipe, Schema } from "effect"
import { ColorSpaceSchema } from "../../../../domain/color/color.schema.js"
import {
  ColorStopPair,
  type PartialColorStopPair,
  type StopPosition
} from "../../../../domain/palette/palette.schema.js"
import { PromptService } from "../../../../services/PromptService/index.js"
import { promptForOutputFormat, promptForPaletteName, promptForStop } from "../../../prompts.js"
import {
  type BatchPalettesComplete,
  BatchPalettesCompleteSchema,
  type BatchPalettesPartial
} from "../inputSpecs/batchPalettes.input.js"
import {
  forEachNonEmpty,
  refineOption,
  resolveWithFallback,
  resolveWithPrompt,
  type WorkflowCompletionError
} from "./shared/index.js"

// ============================================================================
// Local Schema Refiners (created from generic refineOption)
// ============================================================================

/** Refine Option<string> to Option<ColorSpace> using Schema validation */
const refineFormatOption = refineOption(ColorSpaceSchema)

// ============================================================================
// Local Resolvers (created from generic resolveWithPrompt)
// ============================================================================

/** Resolve format by prompting when missing */
const resolveFormat = resolveWithPrompt(promptForOutputFormat)

/** Resolve name by prompting when missing (with default) */
const resolveName = (
  nameOpt: string | undefined,
  defaultName: string
): Effect.Effect<string, WorkflowCompletionError, PromptService> =>
  pipe(
    O.fromNullable(nameOpt),
    O.match({
      onNone: () => promptForPaletteName(defaultName),
      onSome: Effect.succeed
    })
  )

// ============================================================================
// Workflow Completion
// ============================================================================

/**
 * Complete a partial BatchPalettes input by prompting for missing fields.
 *
 * - Prompts for missing stops in pairs
 * - Prompts for format if missing
 * - Prompts for name if missing
 */
export const completeBatchPalettesInput = (
  partial: BatchPalettesPartial,
  patternFromContext: string,
  defaultName: string
): Effect.Effect<BatchPalettesComplete, WorkflowCompletionError, PromptService> =>
  pipe(
    Effect.all({
      pairs: completePairs(partial.pairs),
      format: resolveFormat(partial.format),
      name: resolveName(partial.name, defaultName),
      pattern: Effect.succeed(resolveWithFallback(patternFromContext)(partial.pattern))
    }),
    Effect.flatMap((resolved) => Schema.decode(BatchPalettesCompleteSchema)(resolved))
  )

// ============================================================================
// Pair Completion
// ============================================================================

/**
 * Complete all pairs by prompting for missing stops.
 * Uses forEachNonEmpty to preserve non-empty guarantee without type casting.
 */
const completePairs = (
  pairs: Arr.NonEmptyReadonlyArray<PartialColorStopPair>
): Effect.Effect<Arr.NonEmptyReadonlyArray<ColorStopPair>, WorkflowCompletionError, PromptService> =>
  forEachNonEmpty(pairs, (pair, index) => completePair(pair, index))

/**
 * Complete a single pair by prompting for stop if missing.
 */
const completePair = (
  pair: PartialColorStopPair,
  index: number
): Effect.Effect<ColorStopPair, WorkflowCompletionError, PromptService> =>
  pipe(
    O.fromNullable(pair.stop),
    O.match({
      onNone: () =>
        pipe(
          promptForStop(pair.color, index + 1),
          Effect.map((stop): ColorStopPair => ({ color: pair.color, stop }))
        ),
      onSome: (stop) => Effect.succeed({ color: pair.color, stop })
    })
  )

// ============================================================================
// Conversion Helpers
// ============================================================================

/**
 * Build a partial input from parsed pairs and CLI options.
 * Uses type-safe Schema refinement instead of unsafe type casts.
 */
export const buildBatchPartialFromPairs = (
  pairs: Arr.NonEmptyReadonlyArray<{ readonly color: string; readonly stop: StopPosition | undefined }>,
  options: {
    readonly formatOpt: O.Option<string>
    readonly nameOpt: O.Option<string>
    readonly patternOpt: O.Option<string>
  }
): BatchPalettesPartial => {
  const mappedPairs = Arr.map(pairs, (p): PartialColorStopPair => ({
    color: p.color,
    stop: p.stop
  }))

  return {
    pairs: Arr.prepend(Arr.drop(mappedPairs, 1), Arr.headNonEmpty(mappedPairs)),
    format: O.getOrUndefined(refineFormatOption(options.formatOpt)),
    name: O.getOrUndefined(options.nameOpt),
    pattern: O.getOrUndefined(options.patternOpt)
  }
}
