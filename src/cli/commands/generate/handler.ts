/**
 * Main command handler for palette generation.
 *
 * Uses ModeResolver to detect execution mode and routes to appropriate handler.
 */

import { Array as Arr, Effect, Match, Option as O, pipe } from "effect"
import type { BatchResult, PaletteResult, StopPosition } from "../../../domain/palette/palette.schema.js"
import { ConfigService } from "../../../services/ConfigService.js"
import { ConsoleService } from "../../../services/ConsoleService/index.js"
import { PromptService } from "../../../services/PromptService/index.js"
import {
  promptForAnotherTransformation,
  promptForBatchInputMode,
  promptForBatchPaste,
  promptForReferenceColor,
  promptForStop,
  promptForTargetColors
} from "../../prompts.js"
import type { PartialTransformationItem } from "./inputSpecs/batchTransform.input.js"
import { executeBatchPalettes } from "./modes/batch/executor.js"
import { ModeResolver } from "./modes/resolver.js"
import type { ExecutionMode, ModeDetectionResult } from "./modes/resolver.schema.js"
import { executeSinglePalette } from "./modes/single/executor.js"
import { executeBatchTransform, executeManyTransform, executeSingleTransform } from "./modes/transform/executor.js"
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
import { buildBatchPartialFromPairs } from "./workflows/batch.workflow.js"
import { buildPartialFromOptions } from "./workflows/singlePalette.workflow.js"
import {
  buildBatchTransformPartial,
  buildManyTransformPartial,
  buildSingleTransformPartial
} from "./workflows/transform.workflow.js"
import { WorkflowCoordinator } from "./workflows/WorkflowCoordinator.js"

// ============================================================================
// Constants
// ============================================================================

const INTRO_MESSAGE = "Color Palette Generator"
const OUTRO_MESSAGE = "Done!"

/** Default fallback transformation item when none are provided */
const DEFAULT_FALLBACK_TRANSFORMATION: PartialTransformationItem = {
  reference: "#000000",
  target: "#000000",
  stop: 500
}

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
  Effect.if(condition, {
    onTrue: () => Effect.flatMap(ConsoleService, (c) => c.intro(INTRO_MESSAGE)),
    onFalse: () => Effect.void
  })

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
  Effect.if(shouldEnterInteractiveMode(detection, options), {
    onTrue: () =>
      pipe(
        promptForBatchInputMode(),
        Effect.flatMap((inputMode) => handleSelectedInputMode(inputMode, detection.isInteractive, context))
      ),
    onFalse: () => Effect.succeed(O.none<InteractiveResult>())
  })

const handlePasteMode = (isInteractive: boolean, context: ModeHandlerContext) =>
  pipe(
    Effect.all({
      parsedPairs: pipe(promptForBatchPaste(), Effect.flatMap(parseBatchPairsInput)),
      coordinator: WorkflowCoordinator,
      config: ConfigService
    }),
    Effect.flatMap(({ config, coordinator, parsedPairs }) =>
      pipe(
        config.getConfig(),
        Effect.flatMap((configData) => {
          const partial = buildBatchPartialFromPairs(
            Arr.map(parsedPairs, (p) => ({ color: p.color, stop: p.stop })),
            {
              formatOpt: context.formatOpt,
              nameOpt: context.nameOpt,
              patternOpt: O.some(context.pattern)
            }
          )
          return coordinator.completeBatchPalettes(partial, context.pattern, configData.defaultBatchName)
        })
      )
    ),
    Effect.flatMap((completeInput) =>
      executeBatchPalettes(completeInput, {
        exportOpt: context.exportOpt,
        exportPath: context.exportPath,
        isInteractive
      })
    )
  )

// ============================================================================
// Interactive Transformation Loop
// ============================================================================

const handleInteractiveTransformLoop = (context: ModeHandlerContext) =>
  pipe(
    Effect.all({
      transformations: collectTransformationsRecursively([]),
      coordinator: WorkflowCoordinator
    }),
    Effect.flatMap(({ coordinator, transformations }) => {
      const partialItems = toCompleteTransformationItems(transformations)
      const partial = buildBatchTransformPartial({
        transformations: partialItems,
        formatOpt: context.formatOpt,
        nameOpt: context.nameOpt,
        patternOpt: O.some(context.pattern)
      })
      return coordinator.completeBatchTransform(partial, context.pattern)
    }),
    Effect.flatMap((completeInput) =>
      executeBatchTransform(completeInput, {
        exportOpt: context.exportOpt,
        exportPath: context.exportPath
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

const isMultiTarget = (
  targets: Arr.NonEmptyReadonlyArray<string>
): boolean => Arr.length(targets) > 1

const buildTransformationFromTargets = (
  reference: string,
  targets: ReadonlyArray<string>,
  stop: StopPosition
): TransformationRequest | TransformationBatch =>
  Arr.match(targets, {
    onEmpty: () => buildSingleTransformation(reference, targets, stop),
    onNonEmpty: (nonEmptyTargets) =>
      isMultiTarget(nonEmptyTargets)
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
    Effect.zipRight(WorkflowCoordinator),
    Effect.flatMap((coordinator) => {
      const partial = buildPartialFromOptions({
        colorOpt: options.colorOpt,
        formatOpt: context.formatOpt,
        nameOpt: context.nameOpt,
        patternOpt: O.some(context.pattern),
        stopOpt: options.stopOpt
      })
      return coordinator.completeSinglePalette(partial, context.pattern)
    }),
    Effect.flatMap((completeInput) =>
      executeSinglePalette(completeInput, {
        exportOpt: context.exportOpt,
        exportPath: context.exportPath
      })
    )
  )

const handleBatchPalettesMode = (
  mode: Extract<ExecutionMode, { _tag: "BatchPalettes" }>,
  context: ModeHandlerContext
) =>
  pipe(
    logPhase(GatheringInput({ mode })),
    Effect.zipRight(Effect.all({
      coordinator: WorkflowCoordinator,
      config: ConfigService
    })),
    Effect.flatMap(({ config, coordinator }) =>
      pipe(
        config.getConfig(),
        Effect.flatMap((configData) => {
          const partial = buildBatchPartialFromPairs(
            Arr.map(mode.pairs, (p) => ({ color: p.color, stop: p.stop })),
            {
              formatOpt: context.formatOpt,
              nameOpt: context.nameOpt,
              patternOpt: O.some(context.pattern)
            }
          )
          return coordinator.completeBatchPalettes(partial, context.pattern, configData.defaultBatchName)
        })
      )
    ),
    Effect.flatMap((completeInput) =>
      executeBatchPalettes(completeInput, {
        exportOpt: context.exportOpt,
        exportPath: context.exportPath,
        isInteractive: false
      })
    )
  )

const handleSingleTransformMode = (
  mode: Extract<ExecutionMode, { _tag: "SingleTransform" }>,
  context: ModeHandlerContext
) =>
  pipe(
    logPhase(GatheringInput({ mode })),
    Effect.zipRight(WorkflowCoordinator),
    Effect.flatMap((coordinator) => {
      const partial = buildSingleTransformPartial({
        reference: mode.input.reference,
        target: mode.input.target,
        stopOpt: O.fromNullable(mode.input.stop),
        formatOpt: context.formatOpt,
        nameOpt: context.nameOpt,
        patternOpt: O.some(context.pattern)
      })
      return coordinator.completeSingleTransform(partial, context.pattern)
    }),
    Effect.flatMap((completeInput) =>
      executeSingleTransform(completeInput, {
        exportOpt: context.exportOpt,
        exportPath: context.exportPath
      })
    )
  )

const handleManyTransformMode = (
  mode: Extract<ExecutionMode, { _tag: "ManyTransform" }>,
  context: ModeHandlerContext
) =>
  pipe(
    logPhase(GatheringInput({ mode })),
    Effect.zipRight(WorkflowCoordinator),
    Effect.flatMap((coordinator) => {
      const partial = buildManyTransformPartial({
        reference: mode.reference,
        targets: mode.targets,
        stopOpt: O.fromNullable(mode.stop),
        formatOpt: context.formatOpt,
        nameOpt: context.nameOpt,
        patternOpt: O.some(context.pattern)
      })
      return coordinator.completeManyTransform(partial, context.pattern)
    }),
    Effect.flatMap((completeInput) =>
      executeManyTransform(completeInput, {
        exportOpt: context.exportOpt,
        exportPath: context.exportPath
      })
    )
  )

const handleBatchTransformMode = (
  mode: Extract<ExecutionMode, { _tag: "BatchTransform" }>,
  context: ModeHandlerContext
) =>
  pipe(
    logPhase(GatheringInput({ mode })),
    Effect.zipRight(WorkflowCoordinator),
    Effect.flatMap((coordinator) => {
      const partial = buildBatchTransformPartial({
        transformations: toPartialTransformationItems(mode.transformations),
        formatOpt: context.formatOpt,
        nameOpt: context.nameOpt,
        patternOpt: O.some(context.pattern)
      })
      return coordinator.completeBatchTransform(partial, context.pattern)
    }),
    Effect.flatMap((completeInput) =>
      executeBatchTransform(completeInput, {
        exportOpt: context.exportOpt,
        exportPath: context.exportPath
      })
    )
  )

// ============================================================================
// Transformation Conversion Helpers
// ============================================================================

/**
 * Resolver's AnyTransformationRequest includes partial types where
 * reference/target may be undefined. We define this broader type to
 * accept the resolver's output, then filter to valid entries.
 *
 * Note: With exactOptionalPropertyTypes, we must use `| undefined` for
 * properties that can be explicitly undefined in the source type.
 */
type ResolverTransformationRequest =
  | TransformationRequest
  | TransformationBatch
  | {
    readonly reference?: string | undefined
    readonly target?: string | undefined
    readonly stop?: StopPosition | undefined
  }
  | {
    readonly reference?: string | undefined
    readonly targets?: Arr.NonEmptyReadonlyArray<string> | undefined
    readonly stop?: StopPosition | undefined
  }

/**
 * Convert resolver's transformation requests to PartialTransformationItem for workflow.
 * Filters out any entries missing required reference/target fields.
 */
const toPartialTransformationItems = (
  transformations: Arr.NonEmptyReadonlyArray<ResolverTransformationRequest>
): Arr.NonEmptyReadonlyArray<PartialTransformationItem> =>
  pipe(
    transformations,
    Arr.filterMap(toPartialTransformationItemOption),
    Arr.match({
      onEmpty: () =>
        pipe(
          toPartialTransformationItemOption(Arr.headNonEmpty(transformations)),
          O.match({
            onNone: () => Arr.of(createFallbackPartialItem(Arr.headNonEmpty(transformations))),
            onSome: Arr.of
          })
        ),
      onNonEmpty: (items) => items
    })
  )

/** Create a fallback partial item when conversion fails - uses reference as target */
const createFallbackPartialItem = (
  t: ResolverTransformationRequest
): PartialTransformationItem => ({
  reference: "reference" in t && t.reference !== undefined ? t.reference : "#000000",
  target: "target" in t && t.target !== undefined ? t.target : "#000000",
  stop: "stop" in t ? t.stop : undefined
})

const toPartialTransformationItemOption = (
  t: ResolverTransformationRequest
): O.Option<PartialTransformationItem> => {
  if ("targets" in t && t.targets !== undefined && t.reference !== undefined) {
    return O.some({ reference: t.reference, targets: t.targets, stop: t.stop })
  }
  if ("target" in t && t.target !== undefined && t.reference !== undefined) {
    return O.some({ reference: t.reference, target: t.target, stop: t.stop })
  }
  return O.none()
}

/**
 * Convert complete transformations from interactive loop to PartialTransformationItems.
 * These already have stops since users are prompted during collection.
 * Uses Arr.match with Arr.of to avoid type casting when handling empty arrays.
 */
const toCompleteTransformationItems = (
  transformations: ReadonlyArray<TransformationRequest | TransformationBatch>
): Arr.NonEmptyReadonlyArray<PartialTransformationItem> =>
  pipe(
    transformations,
    Arr.map((t): PartialTransformationItem =>
      "targets" in t
        ? { reference: t.reference, targets: t.targets, stop: t.stop }
        : { reference: t.reference, target: t.target, stop: t.stop }
    ),
    Arr.match({
      onEmpty: () => Arr.of(DEFAULT_FALLBACK_TRANSFORMATION),
      onNonEmpty: (items) => items
    })
  )
