// ============================================================================
// Generate Command Handler
// ============================================================================

/**
 * Main command handler for palette generation.
 * Uses ModeResolver to detect execution mode and routes to appropriate handler.
 */

import { Array as Arr, Effect, Match, Option as O, pipe } from "effect"
import type { StopPosition } from "../../../domain/palette/palette.schema.js"
import { ConfigService } from "../../../services/ConfigService.js"
import { ConsoleService } from "../../../services/ConsoleService/index.js"
import type { BatchResult, PaletteResult } from "../../../services/PaletteService/palette.schema.js"
import { PromptService } from "../../../services/PromptService/index.js"
import {
  promptForAnotherTransformation,
  promptForBatchInputMode,
  promptForBatchPaste,
  promptForReferenceColor,
  promptForStop,
  promptForTargetColors
} from "../../prompts.js"
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
import type { TransformationBatch, TransformationRequest } from "./modes/transform/transformation.schema.js"
import { parseBatchPairsInput } from "./parsers/batch-parser.js"
import { getModePromptRequirement } from "./types/interactionPolicy.js"
import { logPhase } from "./types/phaseLogger.js"
import {
  Complete,
  DisplayingResult,
  Executing,
  GatheringInput,
  Initializing,
  SelectingMode
} from "./types/sessionPhase.js"

// ============================================================================
// Constants
// ============================================================================

const INTRO_MESSAGE = "Color Palette Generator"
const OUTRO_MESSAGE = "Done!"
const PAIR_SEPARATOR = "::"

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
// Session Finalization
// ============================================================================

const finalizeSession = <A>(result: A): Effect.Effect<A, never, ConsoleService> =>
  pipe(
    logPhase(DisplayingResult()),
    Effect.zipRight(Effect.flatMap(ConsoleService, (c) => c.outro(OUTRO_MESSAGE))),
    Effect.zipRight(logPhase(Complete())),
    Effect.as(result)
  )

const showIntroWhen = (
  condition: boolean
): Effect.Effect<void, never, ConsoleService> =>
  condition
    ? Effect.flatMap(ConsoleService, (c) => c.intro(INTRO_MESSAGE))
    : Effect.void

// ============================================================================
// Main Handler Context Builder
// ============================================================================

const buildHandlerContext = (
  options: GenerateOptions,
  pattern: string
): ModeHandlerContext => ({
  exportOpt: options.exportOpt,
  exportPath: options.exportPath,
  formatOpt: options.formatOpt,
  nameOpt: options.nameOpt,
  pattern
})

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Main handler for the generate command.
 *
 * Orchestrates the CLI session: resolves pattern, detects execution mode,
 * handles interactive prompts if needed, then executes the appropriate
 * mode handler (single palette, batch, or transformation).
 */
export const handleGenerate = (options: GenerateOptions) =>
  Effect.gen(function*() {
    yield* logPhase(Initializing())

    const pattern = yield* resolvePattern(options.patternOpt)
    const detection = yield* detectExecutionMode(options)
    const context = buildHandlerContext(options, pattern)

    yield* showIntroWhen(shouldShowIntro(detection, options))

    yield* logPhase(SelectingMode())
    const interactiveResult = yield* tryInteractiveMode(detection, options, context)

    return yield* pipe(
      interactiveResult,
      O.match({
        onNone: () =>
          pipe(
            logPhase(Executing({ mode: detection.mode })),
            Effect.zipRight(handleExecutionMode(detection.mode, options, context)),
            Effect.flatMap(finalizeSession)
          ),
        onSome: (result) => finalizeSession(result)
      })
    )
  })

// ============================================================================
// Pattern Resolution
// ============================================================================

const resolvePattern = (patternOpt: O.Option<string>) =>
  pipe(
    patternOpt,
    O.match({
      onNone: () => Effect.flatMap(ConfigService, (config) => config.getPatternSource()),
      onSome: Effect.succeed
    })
  )

// ============================================================================
// Mode Detection
// ============================================================================

const detectExecutionMode = (options: GenerateOptions) =>
  pipe(
    ModeResolver,
    Effect.flatMap((resolver) =>
      resolver.detectMode({
        colorOpt: options.colorOpt,
        stopOpt: options.stopOpt,
        formatOpt: options.formatOpt,
        nameOpt: options.nameOpt,
        patternOpt: options.patternOpt,
        exportOpt: options.exportOpt,
        exportPath: options.exportPath
      })
    )
  )

// ============================================================================
// Intro Display Logic
// ============================================================================

const shouldShowIntro = (detection: ModeDetectionResult, options: GenerateOptions): boolean => {
  const { isInteractive, mode } = detection
  const hasMissingRequiredOptions = O.isNone(options.formatOpt) || O.isNone(options.nameOpt)
  const modeRequiresPrompt = getModePromptRequirement(mode, options.stopOpt)
  return isInteractive || hasMissingRequiredOptions || modeRequiresPrompt
}

// ============================================================================
// Interactive Transformation Mode
// ============================================================================

const shouldEnterInteractiveMode = (
  detection: ModeDetectionResult,
  options: GenerateOptions
): boolean =>
  detection.isInteractive &&
  detection.mode._tag === "SinglePalette" &&
  O.isNone(options.colorOpt)

const handleSelectedInputMode = (
  inputMode: "paste" | "transform" | "cycle",
  isInteractive: boolean,
  context: ModeHandlerContext
) =>
  pipe(
    Match.value(inputMode),
    Match.when("paste", () =>
      pipe(
        handlePasteMode(isInteractive, context),
        Effect.map(O.some<InteractiveResult>)
      )),
    Match.when("transform", () =>
      pipe(
        handleInteractiveTransformLoop(context),
        Effect.map(O.some<InteractiveResult>)
      )),
    Match.when("cycle", () => Effect.succeed(O.none<InteractiveResult>())),
    Match.exhaustive
  )

const tryInteractiveMode = (
  detection: ModeDetectionResult,
  options: GenerateOptions,
  context: ModeHandlerContext
) =>
  shouldEnterInteractiveMode(detection, options)
    ? pipe(
      promptForBatchInputMode(),
      Effect.flatMap((inputMode) => handleSelectedInputMode(inputMode, detection.isInteractive, context))
    )
    : Effect.succeed(O.none<InteractiveResult>())

const handlePasteMode = (isInteractive: boolean, context: ModeHandlerContext) =>
  pipe(
    promptForBatchPaste(),
    Effect.flatMap(parseBatchPairsInput),
    Effect.flatMap((parsedPairs) =>
      handleBatchMode({
        exportOpt: context.exportOpt,
        exportPath: context.exportPath,
        formatOpt: context.formatOpt,
        isInteractive,
        nameOpt: context.nameOpt,
        pairs: parsedPairs,
        pattern: context.pattern
      })
    )
  )

// ============================================================================
// Interactive Transformation Loop
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

const collectSingleTransformation = (): Effect.Effect<
  TransformationRequest | TransformationBatch,
  unknown,
  PromptService
> =>
  pipe(
    Effect.all({
      referenceColor: promptForReferenceColor(),
      targetColors: promptForTargetColors(),
      stop: promptForStop()
    }),
    Effect.map(({ referenceColor, stop, targetColors }) =>
      buildTransformationFromTargets(referenceColor, targetColors, stop)
    )
  )

/** Recursively collects transformations until user declines to add more */
const collectTransformationsRecursively = (
  accumulated: ReadonlyArray<TransformationRequest | TransformationBatch>
): Effect.Effect<ReadonlyArray<TransformationRequest | TransformationBatch>, unknown, PromptService> =>
  Effect.gen(function*() {
    const transformation = yield* collectSingleTransformation()
    const updatedList = Arr.append(accumulated, transformation)
    const shouldContinue = yield* promptForAnotherTransformation()
    return shouldContinue
      ? yield* collectTransformationsRecursively(updatedList)
      : updatedList
  })

const buildBatchTransformation = (
  reference: string,
  targets: Arr.NonEmptyReadonlyArray<string>,
  stop: StopPosition
): TransformationBatch => ({ reference, targets, stop })

const buildSingleTransformation = (
  reference: string,
  targets: ReadonlyArray<string>,
  stop: StopPosition
): TransformationRequest => ({
  reference,
  target: pipe(Arr.head(targets), O.getOrElse(() => reference)),
  stop
})

const buildTransformationFromTargets = (
  reference: string,
  targets: ReadonlyArray<string>,
  stop: StopPosition
): TransformationRequest | TransformationBatch =>
  Arr.match(targets, {
    onEmpty: () => buildSingleTransformation(reference, targets, stop),
    onNonEmpty: (nonEmptyTargets) =>
      nonEmptyTargets.length > 1
        ? buildBatchTransformation(reference, nonEmptyTargets, stop)
        : buildSingleTransformation(reference, nonEmptyTargets, stop)
  })

// ============================================================================
// Mode Execution Handlers
// ============================================================================

const handleExecutionMode = (
  mode: ExecutionMode,
  options: GenerateOptions,
  context: ModeHandlerContext
) =>
  pipe(
    Match.value(mode),
    Match.tag("SinglePalette", (m) => handleSinglePaletteMode(m, options, context)),
    Match.tag("BatchPalettes", (m) => handleBatchPalettesMode(m, context)),
    Match.tag("SingleTransform", (m) => handleSingleTransformMode(m, context)),
    Match.tag("ManyTransform", (m) => handleManyTransformMode(m, context)),
    Match.tag("BatchTransform", (m) => handleBatchTransformMode(m, context)),
    Match.exhaustive
  )

const handleSinglePaletteMode = (
  mode: Extract<ExecutionMode, { _tag: "SinglePalette" }>,
  options: GenerateOptions,
  context: ModeHandlerContext
) =>
  pipe(
    logPhase(GatheringInput({ mode })),
    Effect.zipRight(
      handleSingleMode({
        colorOpt: options.colorOpt,
        exportOpt: context.exportOpt,
        exportPath: context.exportPath,
        formatOpt: context.formatOpt,
        nameOpt: context.nameOpt,
        pattern: context.pattern,
        stopOpt: options.stopOpt
      })
    )
  )

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

interface ValidatedRefTarget {
  readonly reference: string
  readonly target: string
}

const validateRefTarget = (
  reference: string | undefined,
  target: string | undefined
): O.Option<ValidatedRefTarget> => O.all({ reference: O.fromNullable(reference), target: O.fromNullable(target) })

const resolveStopPosition = (
  stopOpt: O.Option<StopPosition>
): Effect.Effect<StopPosition, unknown, PromptService> =>
  O.match(stopOpt, {
    onNone: () => promptForStop(),
    onSome: Effect.succeed
  })

const buildTransformRequest = (
  validated: ValidatedRefTarget,
  stop: StopPosition
): TransformationRequest => ({
  reference: validated.reference,
  target: validated.target,
  stop
})

const resolveTransformationRequest = (
  input: {
    readonly reference?: string | undefined
    readonly target?: string | undefined
    readonly stop?: StopPosition | undefined
  }
): Effect.Effect<TransformationRequest, unknown, PromptService> =>
  pipe(
    validateRefTarget(input.reference, input.target),
    O.match({
      onNone: () => Effect.fail("Invalid transformation: missing reference or target"),
      onSome: (validated) =>
        pipe(
          resolveStopPosition(O.fromNullable(input.stop)),
          Effect.map((stop) => buildTransformRequest(validated, stop))
        )
    })
  )

const handleManyTransformMode = (
  mode: Extract<ExecutionMode, { _tag: "ManyTransform" }>,
  context: ModeHandlerContext
) =>
  pipe(
    resolveStopPosition(O.fromNullable(mode.stop)),
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
