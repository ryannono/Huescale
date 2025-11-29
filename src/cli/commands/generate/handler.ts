// ============================================================================
// Generate Command Handler
// ============================================================================

/**
 * Main command handler for palette generation.
 * Uses ModeResolver to detect execution mode and routes to appropriate handler.
 */

import * as clack from "@clack/prompts"
import { Array as Arr, Effect, Option as O, pipe } from "effect"
import type { StopPosition } from "../../../domain/palette/palette.schema.js"
import { ConfigService } from "../../../services/ConfigService.js"
import type { BatchResult, PaletteResult } from "../../../services/PaletteService/palette.schema.js"
import {
  promptForAnotherTransformation,
  promptForBatchInputMode,
  promptForBatchPaste,
  promptForReferenceColor,
  promptForStop,
  promptForTargetColors
} from "../../prompts.js"
import type { TransformationBatch, TransformationRequest } from "../../schemas/transformation.schema.js"
import { handleBatchMode } from "./modes/batch/executor.js"
import { ModeResolver } from "./modes/resolver.js"
import type { ExecutionMode, ModeDetectionResult } from "./modes/resolver.schema.js"
import { handleSingleMode } from "./modes/single/executor.js"
import { completePartialTransformations } from "./modes/transform/completer.js"
import {
  handleBatchTransformations,
  handleOneToManyTransformation,
  handleSingleTransformation
} from "./modes/transform/executor.js"
import { parseBatchPairsInput } from "./parsers/batch-parser.js"

// ============================================================================
// Types
// ============================================================================

interface GenerateOptions {
  readonly colorOpt: O.Option<string>
  readonly exportOpt: O.Option<string>
  readonly exportPath: O.Option<string>
  readonly formatOpt: O.Option<string>
  readonly nameOpt: O.Option<string>
  readonly patternOpt: O.Option<string>
  readonly stopOpt: O.Option<number>
}

interface ModeHandlerContext {
  readonly exportOpt: O.Option<string>
  readonly exportPath: O.Option<string>
  readonly formatOpt: O.Option<string>
  readonly nameOpt: O.Option<string>
  readonly pattern: string
}

/** Union of possible interactive mode results */
type InteractiveResult = BatchResult | ReadonlyArray<PaletteResult>

// ============================================================================
// Constants
// ============================================================================

const INTRO_MESSAGE = "Color Palette Generator"
const PAIR_SEPARATOR = "::"

// ============================================================================
// Public API
// ============================================================================

/** Main handler for the generate command. */
export const handleGenerate = (options: GenerateOptions) =>
  Effect.gen(function*() {
    const pattern = yield* resolvePattern(options.patternOpt)
    const detection = yield* detectExecutionMode(options)
    const context: ModeHandlerContext = {
      exportOpt: options.exportOpt,
      exportPath: options.exportPath,
      formatOpt: options.formatOpt,
      nameOpt: options.nameOpt,
      pattern
    }

    if (shouldShowIntro(detection, options)) {
      clack.intro(INTRO_MESSAGE)
    }

    const interactiveResult = yield* tryInteractiveMode(detection, options, context)
    if (O.isSome(interactiveResult)) {
      clack.outro("Done!")
      return interactiveResult.value
    }

    const result = yield* handleExecutionMode(detection.mode, options, context)
    clack.outro("Done!")
    return result
  })

// ============================================================================
// Pattern Resolution
// ============================================================================

const resolvePattern = (patternOpt: O.Option<string>) =>
  Effect.gen(function*() {
    const config = yield* ConfigService
    return yield* O.match(patternOpt, {
      onNone: () => config.getPatternSource(),
      onSome: (p) => Effect.succeed(p)
    })
  })

// ============================================================================
// Mode Detection
// ============================================================================

const detectExecutionMode = (options: GenerateOptions) =>
  Effect.gen(function*() {
    const resolver = yield* Effect.provide(ModeResolver, ModeResolver.Default)
    return yield* resolver.detectMode({
      colorOpt: options.colorOpt,
      stopOpt: options.stopOpt,
      formatOpt: options.formatOpt,
      nameOpt: options.nameOpt,
      patternOpt: options.patternOpt,
      exportOpt: options.exportOpt,
      exportPath: options.exportPath
    })
  })

// ============================================================================
// Intro Display Logic
// ============================================================================

const shouldShowIntro = (detection: ModeDetectionResult, options: GenerateOptions): boolean => {
  const { isInteractive, mode } = detection
  const hasUndefinedOptions = O.isNone(options.formatOpt) || O.isNone(options.nameOpt)
  const modeRequiresPrompt = getModePromptRequirement(mode, options.stopOpt)
  return isInteractive || hasUndefinedOptions || modeRequiresPrompt
}

const getModePromptRequirement = (mode: ExecutionMode, stopOpt: O.Option<number>): boolean => {
  switch (mode._tag) {
    case "SinglePalette":
      return O.isNone(stopOpt)
    case "SingleTransform":
      return mode.input.stop === undefined
    case "ManyTransform":
      return mode.stop === undefined
    case "BatchTransform":
      return mode.transformations.some((t) => t.stop === undefined)
    case "BatchPalettes":
      return false
  }
}

// ============================================================================
// Interactive Transformation Mode
// ============================================================================

const tryInteractiveMode = (
  detection: ModeDetectionResult,
  options: GenerateOptions,
  context: ModeHandlerContext
) => {
  const shouldHandle = detection.isInteractive &&
    detection.mode._tag === "SinglePalette" &&
    O.isNone(options.colorOpt)

  if (!shouldHandle) {
    return Effect.succeed(O.none<InteractiveResult>())
  }

  return Effect.gen(function*() {
    const inputMode = yield* promptForBatchInputMode()

    switch (inputMode) {
      case "paste": {
        const result = yield* handlePasteMode(detection.isInteractive, context)
        return O.some<InteractiveResult>(result)
      }
      case "transform": {
        const result = yield* handleInteractiveTransformLoop(context)
        return O.some<InteractiveResult>(result)
      }
      default:
        return O.none<InteractiveResult>()
    }
  })
}

const handlePasteMode = (isInteractive: boolean, context: ModeHandlerContext) =>
  Effect.gen(function*() {
    const pasteInput = yield* promptForBatchPaste()
    const parsedPairs = yield* parseBatchPairsInput(pasteInput)
    return yield* handleBatchMode({
      exportOpt: context.exportOpt,
      exportPath: context.exportPath,
      formatOpt: context.formatOpt,
      isInteractive,
      nameOpt: context.nameOpt,
      pairs: parsedPairs,
      pattern: context.pattern
    })
  })

// ============================================================================
// Interactive Transformation Loop (Recursive FP Pattern)
// ============================================================================

const handleInteractiveTransformLoop = (context: ModeHandlerContext) =>
  pipe(
    collectTransformationsRecursively([]),
    Effect.flatMap((transformations) =>
      handleBatchTransformations({
        exportOpt: context.exportOpt,
        exportPath: context.exportPath,
        formatOpt: context.formatOpt,
        inputs: transformations,
        nameOpt: context.nameOpt,
        pattern: context.pattern
      })
    )
  )

const collectTransformationsRecursively = (
  accumulated: ReadonlyArray<TransformationRequest | TransformationBatch>
): Effect.Effect<ReadonlyArray<TransformationRequest | TransformationBatch>, unknown, never> =>
  Effect.gen(function*() {
    const transformation = yield* collectSingleTransformation()
    const updatedList = [...accumulated, transformation]
    const shouldContinue = yield* promptForAnotherTransformation()

    return shouldContinue
      ? yield* collectTransformationsRecursively(updatedList)
      : updatedList
  })

const collectSingleTransformation = (): Effect.Effect<TransformationRequest | TransformationBatch, unknown, never> =>
  Effect.gen(function*() {
    const referenceColor = yield* promptForReferenceColor()
    const targetColors = yield* promptForTargetColors()
    const stop = yield* promptForStop()

    return buildTransformationFromTargets(referenceColor, targetColors, stop)
  })

const buildTransformationFromTargets = (
  reference: string,
  targets: ReadonlyArray<string>,
  stop: StopPosition
): TransformationRequest | TransformationBatch => {
  const hasMultipleTargets = Arr.isNonEmptyReadonlyArray(targets) && targets.length > 1

  if (hasMultipleTargets) {
    return { reference, targets, stop }
  }

  const firstTarget = pipe(
    Arr.head(targets),
    O.getOrElse(() => reference)
  )

  return { reference, target: firstTarget, stop }
}

// ============================================================================
// Mode Execution Handlers
// ============================================================================

const handleExecutionMode = (
  mode: ExecutionMode,
  options: GenerateOptions,
  context: ModeHandlerContext
) => {
  switch (mode._tag) {
    case "SinglePalette":
      return handleSinglePaletteMode(options, context)
    case "BatchPalettes":
      return handleBatchPalettesMode(mode, context)
    case "SingleTransform":
      return handleSingleTransformMode(mode, context)
    case "ManyTransform":
      return handleManyTransformMode(mode, context)
    case "BatchTransform":
      return handleBatchTransformMode(mode, context)
  }
}

const handleSinglePaletteMode = (options: GenerateOptions, context: ModeHandlerContext) =>
  handleSingleMode({
    colorOpt: options.colorOpt,
    exportOpt: context.exportOpt,
    exportPath: context.exportPath,
    formatOpt: context.formatOpt,
    nameOpt: context.nameOpt,
    pattern: context.pattern,
    stopOpt: options.stopOpt
  })

const handleBatchPalettesMode = (
  mode: Extract<ExecutionMode, { _tag: "BatchPalettes" }>,
  context: ModeHandlerContext
) =>
  handleBatchMode({
    exportOpt: context.exportOpt,
    exportPath: context.exportPath,
    formatOpt: context.formatOpt,
    isInteractive: false,
    nameOpt: context.nameOpt,
    pairs: Arr.map(mode.pairs, (p) => ({
      color: p.color,
      stop: p.stop,
      raw: `${p.color}${PAIR_SEPARATOR}${p.stop}`
    })),
    pattern: context.pattern
  })

const handleSingleTransformMode = (
  mode: Extract<ExecutionMode, { _tag: "SingleTransform" }>,
  context: ModeHandlerContext
) =>
  pipe(
    resolveTransformationRequest(mode.input),
    Effect.flatMap((input) =>
      handleSingleTransformation({
        exportOpt: context.exportOpt,
        exportPath: context.exportPath,
        formatOpt: context.formatOpt,
        input,
        nameOpt: context.nameOpt,
        pattern: context.pattern
      })
    )
  )

const resolveTransformationRequest = (
  input: {
    readonly reference?: string | undefined
    readonly target?: string | undefined
    readonly stop?: StopPosition | undefined
  }
): Effect.Effect<TransformationRequest, unknown, never> => {
  const { reference, stop, target } = input

  if (reference === undefined || target === undefined) {
    return Effect.fail("Invalid transformation: missing reference or target")
  }

  if (stop !== undefined) {
    return Effect.succeed({ reference, target, stop })
  }

  return pipe(
    promptForStop(),
    Effect.map((promptedStop) => ({ reference, target, stop: promptedStop }))
  )
}

const handleManyTransformMode = (
  mode: Extract<ExecutionMode, { _tag: "ManyTransform" }>,
  context: ModeHandlerContext
) =>
  pipe(
    mode.stop !== undefined
      ? Effect.succeed(mode.stop)
      : promptForStop(),
    Effect.flatMap((stop) =>
      handleOneToManyTransformation({
        exportOpt: context.exportOpt,
        exportPath: context.exportPath,
        formatOpt: context.formatOpt,
        input: {
          reference: mode.reference,
          targets: mode.targets,
          stop
        },
        nameOpt: context.nameOpt,
        pattern: context.pattern
      })
    )
  )

const handleBatchTransformMode = (
  mode: Extract<ExecutionMode, { _tag: "BatchTransform" }>,
  context: ModeHandlerContext
) =>
  pipe(
    completePartialTransformations(mode.transformations),
    Effect.map(({ inputs }) => inputs),
    Effect.flatMap((completedInputs) =>
      handleBatchTransformations({
        exportOpt: context.exportOpt,
        exportPath: context.exportPath,
        formatOpt: context.formatOpt,
        inputs: completedInputs,
        nameOpt: context.nameOpt,
        pattern: context.pattern
      })
    )
  )
