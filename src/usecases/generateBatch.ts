/**
 * Generate batch palettes use case.
 *
 * Generates multiple palettes in a single operation, collecting successes and failures.
 * Pattern is loaded once and reused for all palette generations.
 */

import { Array as Arr, Data, Effect, Either, Option as O } from "effect"
import type { ColorSpace } from "../domain/color/color.schema.js"
import {
  type BatchResult,
  type ColorStopPair,
  type GenerationFailure,
  ISOTimestamp,
  type ISOTimestamp as ISOTimestampType,
  type PaletteResult
} from "../domain/palette/palette.schema.js"
import type { LoadPattern, PatternLoadError } from "../io/patternLoader.js"
import { GeneratePaletteError, generatePaletteWithPattern } from "./generatePalette.js"

// ============================================================================
// Errors
// ============================================================================

/** Error when all palette generations in a batch fail */
export class BatchGenerationError extends Data.TaggedError("BatchGenerationError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ============================================================================
// Types
// ============================================================================

/** Input for generating a batch of palettes */
export interface GenerateBatchInput {
  readonly pairs: ReadonlyArray<ColorStopPair>
  readonly outputFormat: ColorSpace
  readonly groupName: string
  readonly patternSource: string
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate multiple palettes in a batch.
 *
 * Loads the pattern once, then generates all palettes concurrently.
 * Collects both successful results and failures, returning a BatchResult.
 * Fails only if ALL palette generations fail.
 *
 * @param input - Batch generation parameters
 * @param loadPattern - Function to load pattern (platform-specific implementation)
 * @returns Effect containing batch result with palettes and any failures
 */
export const generateBatch = (
  input: GenerateBatchInput,
  loadPattern: LoadPattern
): Effect.Effect<BatchResult, BatchGenerationError | PatternLoadError> =>
  Effect.gen(function*() {
    const pattern = yield* loadPattern(input.patternSource)

    const results = yield* Effect.forEach(
      input.pairs,
      (pair) =>
        Effect.either(
          generatePaletteWithPattern(
            {
              inputColor: pair.color,
              anchorStop: pair.stop,
              outputFormat: input.outputFormat,
              paletteName: `${input.groupName}-${pair.color}`
            },
            pattern
          )
        ),
      { concurrency: "unbounded" }
    )

    const successfulPalettes = Arr.getSomes(Arr.map(results, Either.getRight))
    const failures = extractFailures(input.pairs, results)

    if (!Arr.isNonEmptyReadonlyArray(successfulPalettes)) {
      return yield* Effect.fail(
        new BatchGenerationError({
          message: `All palette generations failed: ${formatFailures(failures)}`
        })
      )
    }

    const generatedAt = yield* getCurrentISOTimestamp()

    return {
      groupName: input.groupName,
      outputFormat: input.outputFormat,
      palettes: successfulPalettes,
      failures,
      generatedAt
    }
  })

// ============================================================================
// Internal Helpers
// ============================================================================

/** Extract failures with their original color/stop pairs */
const extractFailures = (
  pairs: ReadonlyArray<ColorStopPair>,
  results: ReadonlyArray<Either.Either<PaletteResult, GeneratePaletteError>>
): ReadonlyArray<GenerationFailure> =>
  Arr.filterMap(
    Arr.zip(pairs, results),
    ([pair, result]) =>
      Either.match(result, {
        onLeft: (error): O.Option<GenerationFailure> =>
          O.some({
            color: pair.color,
            stop: pair.stop,
            error: error.message
          }),
        onRight: () => O.none()
      })
  )

/** Format failures for error message */
const formatFailures = (failures: ReadonlyArray<GenerationFailure>): string =>
  Arr.map(failures, (f) => `${f.color} (${f.error})`).join(", ")

/** Get current timestamp in ISO format */
const getCurrentISOTimestamp = (): Effect.Effect<ISOTimestampType, BatchGenerationError> =>
  Effect.clockWith((clock) =>
    clock.currentTimeMillis.pipe(
      Effect.flatMap((millis) =>
        ISOTimestamp(new Date(millis).toISOString()).pipe(
          Effect.mapError(
            (cause) =>
              new BatchGenerationError({
                message: "Failed to encode timestamp",
                cause
              })
          )
        )
      )
    )
  )
