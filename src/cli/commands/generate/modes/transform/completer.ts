/**
 * Completes partial batch transformations by prompting for missing stops.
 */

import { Array as Arr, Data, Effect, Option, pipe } from "effect"
import type { ParseError } from "effect/ParseResult"
import type { StopPosition } from "../../../../../domain/palette/palette.schema.js"
import { promptForStop } from "../../../../prompts.js"
import type {
  PartialTransformationBatch,
  PartialTransformationRequest,
  TransformationBatch,
  TransformationRequest
} from "./transformation.schema.js"

// ============================================================================
// Types
// ============================================================================

/** Complete or partial transformation input. */
type InputType =
  | TransformationRequest
  | TransformationBatch
  | PartialTransformationRequest
  | PartialTransformationBatch

/** Fully validated transformation output. */
type OutputType = TransformationRequest | TransformationBatch

/** Result of processing a single transformation. */
type ProcessResult = {
  readonly completed: Option.Option<OutputType>
  readonly wasPartial: boolean
}

/** Discriminated union for transformation classification states. */
type ClassifiedTransformation = Data.TaggedEnum<{
  readonly CompleteBatch: { readonly data: TransformationBatch }
  readonly CompleteSingle: { readonly data: TransformationRequest }
  readonly PartialBatch: { readonly reference: string; readonly targets: Arr.NonEmptyReadonlyArray<string> }
  readonly PartialSingle: { readonly reference: string; readonly target: string }
  readonly Invalid: object
}>

const ClassifiedTransformation = Data.taggedEnum<ClassifiedTransformation>()

// ============================================================================
// Public API
// ============================================================================

/** Completes partial transformations by prompting for missing stop positions. */
export const completePartialTransformations = (
  transformations: ReadonlyArray<InputType>
): Effect.Effect<
  {
    readonly inputs: ReadonlyArray<OutputType>
    readonly hadPartial: boolean
  },
  ParseError
> =>
  pipe(
    transformations,
    Effect.forEach((t, idx) => processTransformation(t, idx + 1), { concurrency: 1 }),
    Effect.map(aggregateResults)
  )

// ============================================================================
// Processing
// ============================================================================

const processTransformation = (
  transformation: InputType,
  index: number
): Effect.Effect<ProcessResult, ParseError> =>
  pipe(
    classifyTransformation(transformation),
    (classified) =>
      ClassifiedTransformation.$match(classified, {
        CompleteBatch: ({ data }) => completeResult(data),
        CompleteSingle: ({ data }) => completeResult(data),
        PartialBatch: ({ reference, targets }) =>
          partialResult(buildBatchDescription(reference, targets), index, (stop) => ({
            reference,
            targets,
            stop
          })),
        PartialSingle: ({ reference, target }) =>
          partialResult(buildSingleDescription(reference, target), index, (stop) => ({
            reference,
            target,
            stop
          })),
        Invalid: () => invalidResult
      })
  )

// ============================================================================
// Classification
// ============================================================================

const hasValidReference = (t: InputType): t is InputType & { readonly reference: string } =>
  typeof t.reference === "string" && t.reference.length > 0

const hasStop = (t: InputType): t is InputType & { readonly stop: number } => "stop" in t && typeof t.stop === "number"

const classifyTransformation = (t: InputType): ClassifiedTransformation => {
  if (!hasValidReference(t)) {
    return ClassifiedTransformation.Invalid()
  }

  const { reference } = t

  if ("targets" in t && Arr.isNonEmptyReadonlyArray(t.targets)) {
    return hasStop(t)
      ? ClassifiedTransformation.CompleteBatch({ data: { reference, targets: t.targets, stop: t.stop } })
      : ClassifiedTransformation.PartialBatch({ reference, targets: t.targets })
  }

  if ("target" in t && typeof t.target === "string" && t.target.length > 0) {
    return hasStop(t)
      ? ClassifiedTransformation.CompleteSingle({ data: { reference, target: t.target, stop: t.stop } })
      : ClassifiedTransformation.PartialSingle({ reference, target: t.target })
  }

  return ClassifiedTransformation.Invalid()
}

// ============================================================================
// Description Builders
// ============================================================================

const buildBatchDescription = (reference: string, targets: Arr.NonEmptyReadonlyArray<string>): string =>
  `${reference}>(${targets.join(", ")})`

const buildSingleDescription = (reference: string, target: string): string => `${reference}>${target}`

// ============================================================================
// Result Builders
// ============================================================================

const completeResult = (data: OutputType): Effect.Effect<ProcessResult, never> =>
  Effect.succeed({ completed: Option.some(data), wasPartial: false })

const invalidResult: Effect.Effect<ProcessResult, never> = Effect.succeed({
  completed: Option.none(),
  wasPartial: false
})

const partialResult = (
  description: string,
  index: number,
  builder: (stop: StopPosition) => OutputType
): Effect.Effect<ProcessResult, ParseError> =>
  pipe(
    promptForStop(description, index),
    Effect.map((stop) => ({ completed: Option.some(builder(stop)), wasPartial: true }))
  )

// ============================================================================
// Aggregation
// ============================================================================

const aggregateResults = (
  results: ReadonlyArray<ProcessResult>
): { readonly inputs: ReadonlyArray<OutputType>; readonly hadPartial: boolean } => ({
  inputs: pipe(
    results,
    Arr.map((r) => r.completed),
    Arr.getSomes
  ),
  hadPartial: Arr.some(results, (r) => r.wasPartial)
})
