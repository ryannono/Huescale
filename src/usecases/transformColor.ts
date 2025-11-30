/**
 * Transform color use case.
 *
 * Applies optical appearance from a reference color to target colors,
 * then generates palettes from the transformed colors.
 */

import { Array as Arr, Data, Effect, Either, Option as O, Schema } from "effect"
import { applyOpticalAppearance, oklchToHex, parseColorStringToOKLCH } from "../domain/color/color.js"
import type { ColorSpace } from "../domain/color/color.schema.js"
import {
  type BatchResult,
  type GenerationFailure,
  ISOTimestampSchema,
  type PaletteResult,
  type StopPosition
} from "../domain/palette/palette.schema.js"
import type { TransformationPattern } from "../domain/pattern/pattern.js"
import type { LoadPattern, PatternLoadError } from "../io/patternLoader.js"
import { generatePaletteWithPattern } from "./generatePalette.js"

// ============================================================================
// Errors
// ============================================================================

/** Error when color transformation fails */
export class TransformColorError extends Data.TaggedError("TransformColorError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ============================================================================
// Types
// ============================================================================

/** Input for single color transformation */
export interface TransformSingleInput {
  readonly reference: string
  readonly target: string
  readonly stop: StopPosition
  readonly name: string
  readonly outputFormat: ColorSpace
  readonly patternSource: string
}

/** Input for one-to-many color transformation */
export interface TransformManyInput {
  readonly reference: string
  readonly targets: ReadonlyArray<string>
  readonly stop: StopPosition
  readonly name: string
  readonly outputFormat: ColorSpace
  readonly patternSource: string
}

/** Input for batch transformations */
export interface TransformBatchInput {
  readonly transformations: ReadonlyArray<TransformSingleInput | TransformManyInput>
  readonly outputFormat: ColorSpace
  readonly groupName: string
  readonly patternSource: string
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Transform a single color and generate a palette.
 *
 * Applies the optical appearance (lightness/chroma) of the reference color
 * to the target color's hue, then generates a palette from the result.
 *
 * @param input - Transformation parameters
 * @param loadPattern - Function to load pattern
 * @returns Effect containing the generated palette
 */
export const transformSingle = (
  input: TransformSingleInput,
  loadPattern: LoadPattern
): Effect.Effect<PaletteResult, TransformColorError | PatternLoadError> =>
  Effect.gen(function*() {
    const pattern = yield* loadPattern(input.patternSource)
    const transformedHex = yield* applyTransformation(input.reference, input.target)

    return yield* generatePaletteWithPattern(
      {
        inputColor: transformedHex,
        anchorStop: input.stop,
        outputFormat: input.outputFormat,
        paletteName: input.name
      },
      pattern
    )
  }).pipe(
    Effect.mapError((cause) =>
      cause._tag === "PatternLoadError"
        ? cause
        : new TransformColorError({
          message: `Failed to transform ${input.target} using ${input.reference}`,
          cause
        })
    )
  )

/**
 * Transform one reference color to many targets and generate palettes.
 *
 * Applies the optical appearance of the reference to each target,
 * generating a separate palette for each.
 *
 * @param input - One-to-many transformation parameters
 * @param loadPattern - Function to load pattern
 * @returns Effect containing array of generated palettes
 */
export const transformMany = (
  input: TransformManyInput,
  loadPattern: LoadPattern
): Effect.Effect<ReadonlyArray<PaletteResult>, TransformColorError | PatternLoadError> =>
  Effect.gen(function*() {
    const pattern = yield* loadPattern(input.patternSource)
    const referenceColor = yield* parseColorStringToOKLCH(input.reference).pipe(
      Effect.mapError(
        (cause) =>
          new TransformColorError({
            message: `Invalid reference color: ${input.reference}`,
            cause
          })
      )
    )

    return yield* Effect.forEach(
      input.targets,
      (target) =>
        Effect.gen(function*() {
          const targetColor = yield* parseColorStringToOKLCH(target)
          const transformedColor = yield* applyOpticalAppearance(referenceColor, targetColor)
          const transformedHex = yield* oklchToHex(transformedColor)

          return yield* generatePaletteWithPattern(
            {
              inputColor: transformedHex,
              anchorStop: input.stop,
              outputFormat: input.outputFormat,
              paletteName: `${input.name}-${target}`
            },
            pattern
          )
        }),
      { concurrency: "unbounded" }
    )
  }).pipe(
    Effect.mapError((cause) =>
      cause._tag === "PatternLoadError" || cause._tag === "TransformColorError"
        ? cause
        : new TransformColorError({
          message: `Failed to transform targets using ${input.reference}`,
          cause
        })
    )
  )

/**
 * Execute batch transformations and collect results.
 *
 * Processes multiple transformations (single or one-to-many), collecting
 * all generated palettes into a BatchResult. Handles partial failures.
 *
 * @param input - Batch transformation parameters
 * @param loadPattern - Function to load pattern
 * @returns Effect containing batch result with palettes and failures
 */
export const transformBatch = (
  input: TransformBatchInput,
  loadPattern: LoadPattern
): Effect.Effect<BatchResult, TransformColorError | PatternLoadError> =>
  Effect.gen(function*() {
    const pattern = yield* loadPattern(input.patternSource)

    const nestedResults = yield* Effect.forEach(
      input.transformations,
      (transformation) =>
        isTransformManyInput(transformation)
          ? processOneToMany(transformation, pattern, input.outputFormat, input.groupName)
          : processSingle(transformation, pattern, input.outputFormat, input.groupName),
      { concurrency: "unbounded" }
    )

    const allResults = Arr.flatten(nestedResults)
    const successfulPalettes = Arr.getSomes(Arr.map(allResults, (r) => r.palette))
    const failures = Arr.filterMap(allResults, (r) => r.failure)

    if (!Arr.isNonEmptyReadonlyArray(successfulPalettes)) {
      return yield* Effect.fail(
        new TransformColorError({
          message: `All transformations failed: ${formatFailures(failures)}`
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

/** Result of processing a single transformation */
interface ProcessResult {
  readonly palette: O.Option<PaletteResult>
  readonly failure: O.Option<GenerationFailure>
}

/** Type guard for one-to-many input */
const isTransformManyInput = (
  input: TransformSingleInput | TransformManyInput
): input is TransformManyInput => "targets" in input

/** Apply optical appearance transformation and return hex color */
const applyTransformation = (
  reference: string,
  target: string
): Effect.Effect<string, TransformColorError> =>
  Effect.gen(function*() {
    const referenceColor = yield* parseColorStringToOKLCH(reference)
    const targetColor = yield* parseColorStringToOKLCH(target)
    const transformedColor = yield* applyOpticalAppearance(referenceColor, targetColor)
    return yield* oklchToHex(transformedColor)
  }).pipe(
    Effect.mapError(
      (cause) =>
        new TransformColorError({
          message: `Failed to apply transformation from ${reference} to ${target}`,
          cause
        })
    )
  )

/** Process a single transformation, capturing success or failure */
const processSingle = (
  input: TransformSingleInput | Omit<TransformSingleInput, "patternSource">,
  pattern: TransformationPattern,
  outputFormat: ColorSpace,
  groupName: string
): Effect.Effect<ReadonlyArray<ProcessResult>, never> =>
  Effect.gen(function*() {
    const result = yield* Effect.either(
      Effect.gen(function*() {
        const transformedHex = yield* applyTransformation(input.reference, input.target)
        return yield* generatePaletteWithPattern(
          {
            inputColor: transformedHex,
            anchorStop: input.stop,
            outputFormat,
            paletteName: input.name ?? groupName
          },
          pattern
        )
      })
    )

    return [
      Either.match(result, {
        onLeft: (error): ProcessResult => ({
          palette: O.none(),
          failure: O.some({
            color: input.target,
            stop: input.stop,
            error: error.message
          })
        }),
        onRight: (palette): ProcessResult => ({
          palette: O.some(palette),
          failure: O.none()
        })
      })
    ]
  })

/** Process one-to-many transformation */
const processOneToMany = (
  input: TransformManyInput | Omit<TransformManyInput, "patternSource">,
  pattern: TransformationPattern,
  outputFormat: ColorSpace,
  groupName: string
): Effect.Effect<ReadonlyArray<ProcessResult>, never> =>
  Effect.gen(function*() {
    const referenceResult = yield* Effect.either(
      parseColorStringToOKLCH(input.reference)
    )

    if (Either.isLeft(referenceResult)) {
      return Arr.map(
        input.targets,
        (target): ProcessResult => ({
          palette: O.none(),
          failure: O.some({
            color: target,
            stop: input.stop,
            error: `Invalid reference color: ${input.reference}`
          })
        })
      )
    }

    const referenceColor = Either.getOrThrow(referenceResult)

    return yield* Effect.forEach(
      input.targets,
      (target) =>
        Effect.gen(function*() {
          const result = yield* Effect.either(
            Effect.gen(function*() {
              const targetColor = yield* parseColorStringToOKLCH(target)
              const transformedColor = yield* applyOpticalAppearance(referenceColor, targetColor)
              const transformedHex = yield* oklchToHex(transformedColor)

              return yield* generatePaletteWithPattern(
                {
                  inputColor: transformedHex,
                  anchorStop: input.stop,
                  outputFormat,
                  paletteName: `${input.name ?? groupName}-${target}`
                },
                pattern
              )
            })
          )

          return Either.match(result, {
            onLeft: (error): ProcessResult => ({
              palette: O.none(),
              failure: O.some({
                color: target,
                stop: input.stop,
                error: error.message
              })
            }),
            onRight: (palette): ProcessResult => ({
              palette: O.some(palette),
              failure: O.none()
            })
          })
        }),
      { concurrency: "unbounded" }
    )
  })

/** Format failures for error message */
const formatFailures = (failures: ReadonlyArray<GenerationFailure>): string =>
  Arr.map(failures, (f) => `${f.color} (${f.error})`).join(", ")

/** Get current timestamp in ISO format */
const getCurrentISOTimestamp = () =>
  Effect.clockWith((clock) =>
    clock.currentTimeMillis.pipe(
      Effect.map((millis) => Schema.decodeSync(ISOTimestampSchema)(new Date(millis).toISOString()))
    )
  )
