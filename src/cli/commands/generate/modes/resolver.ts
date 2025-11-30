/**
 * ModeResolver service
 *
 * Responsible for detecting and resolving the execution mode from CLI inputs.
 * Separates "what to do" (mode detection) from "how to do it" (execution).
 */

import { Array as Arr, Effect, Option as O, pipe } from "effect"
import type { ParseError } from "effect/ParseResult"
import { ColorString } from "../../../../domain/color/color.schema.js"
import { StopPosition } from "../../../../domain/palette/palette.schema.js"
import { parseBatchPairsInput } from "../parsers/batch-parser.js"
import {
  isTransformationSyntax,
  parseAnyTransformation,
  parseBatchTransformations,
  TransformParseError
} from "../parsers/transform-parser.js"
import {
  BatchPalettesMode,
  BatchTransformMode,
  type ExecutionMode,
  ManyTransformMode,
  type ModeDetectionResult,
  ModeDetectionResult as ModeDetectionResultDecoder,
  SinglePaletteMode,
  SingleTransformMode
} from "./resolver.schema.js"
import type {
  PartialTransformationBatch,
  PartialTransformationRequest,
  TransformationBatch,
  TransformationRequest
} from "./transform/transformation.schema.js"

// ============================================================================
// Types
// ============================================================================

export interface ModeDetectionInput {
  readonly colorOpt: O.Option<string>
  readonly exportOpt: O.Option<string>
  readonly exportPath: O.Option<string>
  readonly formatOpt: O.Option<string>
  readonly nameOpt: O.Option<string>
  readonly patternOpt: O.Option<string>
  readonly stopOpt: O.Option<number>
}

/** Union of all transformation types returned by parsers */
type AnyTransformation =
  | TransformationRequest
  | PartialTransformationRequest
  | TransformationBatch
  | PartialTransformationBatch

// ============================================================================
// Public API
// ============================================================================

/**
 * ModeResolver service using Effect.Service pattern
 *
 * Detects execution mode from CLI inputs by analyzing color input syntax.
 * Supports single palette, batch palettes, and transformation modes.
 *
 * @example
 * ```typescript
 * Effect.gen(function*() {
 *   const resolver = yield* ModeResolver
 *   const result = yield* resolver.detectMode({
 *     colorOpt: O.some("#2D72D2"),
 *     stopOpt: O.some(500),
 *     // ... other options
 *   })
 * }).pipe(Effect.provide(ModeResolver.Default))
 * ```
 */
export class ModeResolver extends Effect.Service<ModeResolver>()(
  "@oklch-palette-generator/cli/commands/generate/modes/ModeResolver",
  {
    effect: Effect.succeed({
      detectMode: detectModeImpl
    })
  }
) {
  /**
   * Test layer - same as Default since ModeResolver is pure (no side effects or dependencies)
   */
  static readonly Test = ModeResolver.Default
}

// ============================================================================
// Internal Helpers - Type Guards
// ============================================================================

/** Check if transformation has targets array (one-to-many) */
const isManyTransformation = (t: AnyTransformation): t is TransformationBatch | PartialTransformationBatch =>
  "targets" in t && Arr.isArray(t.targets)

/** Check if one-to-many transformation is valid (has required fields) */
const isValidManyTransformation = (t: TransformationBatch | PartialTransformationBatch): boolean =>
  t.reference !== undefined && Arr.isNonEmptyReadonlyArray(t.targets)

/** Check if single transformation is valid (has required fields) */
const isValidSingleTransformation = (t: TransformationRequest | PartialTransformationRequest): boolean =>
  t.reference !== undefined && "target" in t && t.target !== undefined

/** Check if any transformation is valid */
const isValidTransformation = (t: AnyTransformation): boolean =>
  isManyTransformation(t) ? isValidManyTransformation(t) : isValidSingleTransformation(t)

// ============================================================================
// Internal Helpers - Syntax Detection
// ============================================================================

/** Check if input uses batch syntax (comma or :: separator) */
const isBatchSyntax = (colorInput: string): boolean => colorInput.includes(",") || colorInput.includes("::")

/** Check if input contains batch transformation separators */
const hasBatchSeparator = (colorInput: string): boolean => colorInput.includes(",") || colorInput.includes("\n")

// ============================================================================
// Internal Helpers - Mode Creation
// ============================================================================

/** Create ManyTransformMode from a valid one-to-many transformation */
const createManyTransformMode = (
  t: TransformationBatch | PartialTransformationBatch
): Effect.Effect<ExecutionMode, ParseError> =>
  ManyTransformMode({
    _tag: "ManyTransform",
    reference: t.reference,
    stop: t.stop,
    targets: t.targets
  })

/** Create SingleTransformMode from a transformation */
const createSingleTransformMode = (
  t: TransformationRequest | PartialTransformationRequest
): Effect.Effect<ExecutionMode, ParseError> => SingleTransformMode({ _tag: "SingleTransform", input: t })

/** Convert a transformation to appropriate mode */
const transformationToMode = (
  t: AnyTransformation,
  colorInput: string
): Effect.Effect<ExecutionMode, ParseError | TransformParseError> => {
  if (isManyTransformation(t)) {
    return isValidManyTransformation(t)
      ? createManyTransformMode(t)
      : Effect.fail(
        new TransformParseError({
          message: `Invalid transformation syntax: reference and targets are required: ${colorInput}`
        })
      )
  }
  return createSingleTransformMode(t)
}

// ============================================================================
// Internal Helpers - Mode Detection
// ============================================================================

/** Main mode detection logic */
function detectModeImpl(
  input: ModeDetectionInput
): Effect.Effect<ModeDetectionResult, ParseError | TransformParseError> {
  return pipe(
    input.colorOpt,
    O.match({
      onNone: () => createInteractiveResult(),
      onSome: (colorInput) => detectModeFromColor(colorInput, input.stopOpt)
    })
  )
}

/** Create result for interactive mode (no color provided) */
const createInteractiveResult = (): Effect.Effect<ModeDetectionResult, ParseError> =>
  ModeDetectionResultDecoder({
    mode: { _tag: "SinglePalette", color: undefined, stop: undefined },
    isInteractive: true
  })

/** Detect mode from color input string (non-interactive since color is provided) */
const detectModeFromColor = (
  colorInput: string,
  stopOpt: O.Option<number>
): Effect.Effect<ModeDetectionResult, ParseError | TransformParseError> =>
  pipe(
    isTransformationSyntax(colorInput)
      ? detectTransformationMode(colorInput)
      : isBatchSyntax(colorInput)
      ? detectBatchPaletteMode(colorInput)
      : detectSinglePaletteMode(colorInput, stopOpt),
    Effect.flatMap((mode) => ModeDetectionResultDecoder({ mode, isInteractive: false }))
  )

/** Detect transformation mode from color input */
const detectTransformationMode = (
  colorInput: string
): Effect.Effect<ExecutionMode, ParseError | TransformParseError> =>
  hasBatchSeparator(colorInput)
    ? detectBatchTransformationMode(colorInput)
    : detectSingleTransformationMode(colorInput)

/** Detect batch transformation mode (comma or newline separated) */
const detectBatchTransformationMode = (
  colorInput: string
): Effect.Effect<ExecutionMode, ParseError | TransformParseError> =>
  pipe(
    parseBatchTransformations(colorInput),
    Effect.flatMap((transformations) =>
      pipe(
        Arr.head(transformations),
        O.filter(() => transformations.length === 1),
        O.match({
          onNone: () => handleMultipleTransformations(transformations, colorInput),
          onSome: (single) => transformationToMode(single, colorInput)
        })
      )
    )
  )

/** Handle multiple transformations - filter invalid and create batch mode */
const handleMultipleTransformations = (
  transformations: ReadonlyArray<AnyTransformation>,
  colorInput: string
): Effect.Effect<ExecutionMode, ParseError | TransformParseError> => {
  const validInputs = Arr.filter(transformations, isValidTransformation)

  return Arr.isEmptyReadonlyArray(validInputs)
    ? Effect.fail(new TransformParseError({ message: `No valid transformations found: ${colorInput}` }))
    : BatchTransformMode({ _tag: "BatchTransform", transformations: validInputs })
}

/** Detect single transformation mode */
const detectSingleTransformationMode = (
  colorInput: string
): Effect.Effect<ExecutionMode, ParseError | TransformParseError> =>
  pipe(
    parseAnyTransformation(colorInput),
    Effect.flatMap((t) => transformationToMode(t, colorInput))
  )

/** Detect batch palette mode from color input */
const detectBatchPaletteMode = (
  colorInput: string
): Effect.Effect<ExecutionMode, ParseError> =>
  pipe(
    parseBatchPairsInput(colorInput),
    Effect.map((pairs) => Arr.map(pairs, (p) => ({ color: p.color, stop: p.stop }))),
    Effect.flatMap((pairs) => BatchPalettesMode({ _tag: "BatchPalettes", pairs }))
  )

/** Detect single palette mode from color string and optional stop */
const detectSinglePaletteMode = (
  colorInput: string,
  stopOpt: O.Option<number>
): Effect.Effect<ExecutionMode, ParseError> =>
  Effect.gen(function*() {
    const color = yield* ColorString(colorInput)
    const stop = yield* O.match(stopOpt, {
      onNone: () => Effect.succeed(undefined),
      onSome: (n) => StopPosition(n)
    })
    return yield* SinglePaletteMode({ _tag: "SinglePalette", color, stop })
  })
