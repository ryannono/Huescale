/**
 * ModeResolver service
 *
 * Responsible for detecting and resolving the execution mode from CLI inputs.
 * Separates "what to do" (mode detection) from "how to do it" (execution).
 */

import { Effect, Option as O } from "effect"
import type { ParseError } from "effect/ParseResult"
import { TransformationParseError } from "../../../../domain/color/errors.js"
import { ColorString } from "../../../../schemas/color.js"
import { StopPosition } from "../../../../schemas/palette.js"
import { parseBatchPairsInput } from "../parsers/batch-parser.js"
import {
  isOneToManyTransformation,
  isTransformationSyntax,
  parseAnyTransformation,
  parseBatchTransformations
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
} from "./types.js"

/**
 * Input options for mode detection
 */
export interface ModeDetectionInput {
  readonly colorOpt: O.Option<string>
  readonly stopOpt: O.Option<number>
  readonly formatOpt: O.Option<string>
  readonly nameOpt: O.Option<string>
  readonly patternOpt: O.Option<string>
  readonly exportOpt: O.Option<string>
  readonly exportPath: O.Option<string>
}

/**
 * Check if input is interactive (missing required inputs)
 */
const isInteractive = (input: ModeDetectionInput): boolean => {
  return O.isNone(input.colorOpt)
}

/**
 * Detect transformation mode from color input
 */
const detectTransformationMode = (
  colorInput: string
): Effect.Effect<ExecutionMode, ParseError | TransformationParseError> =>
  Effect.gen(function*() {
    // Check for one-to-many transformation: ref>(t1,t2)::stop
    if (isOneToManyTransformation(colorInput)) {
      const batch = yield* parseAnyTransformation(colorInput)

      if ("targets" in batch) {
        // ManyTransformMode
        const mode = yield* ManyTransformMode({
          _tag: "ManyTransform",
          reference: batch.reference,
          targets: batch.targets,
          stop: batch.stop
        })
        return mode
      } else {
        // Single transformation parsed as batch
        const mode = yield* SingleTransformMode({
          _tag: "SingleTransform",
          input: batch
        })
        return mode
      }
    }

    // Check for batch transformations (comma or newline separated)
    if (colorInput.includes(",") || colorInput.includes("\n")) {
      const transformations = yield* parseBatchTransformations(colorInput)

      if (transformations.length === 1) {
        const single = transformations[0]!
        if ("targets" in single) {
          const mode = yield* ManyTransformMode({
            _tag: "ManyTransform",
            reference: single.reference,
            targets: single.targets,
            stop: single.stop
          })
          return mode
        } else {
          const mode = yield* SingleTransformMode({
            _tag: "SingleTransform",
            input: single
          })
          return mode
        }
      }

      // Multiple transformations
      const inputs = transformations.filter((t) => !("targets" in t))
      const mode = yield* BatchTransformMode({
        _tag: "BatchTransform",
        transformations: inputs
      })
      return mode
    }

    // Single transformation
    const transformation = yield* parseAnyTransformation(colorInput)
    if ("targets" in transformation) {
      const mode = yield* ManyTransformMode({
        _tag: "ManyTransform",
        reference: transformation.reference,
        targets: transformation.targets,
        stop: transformation.stop
      })
      return mode
    } else {
      const mode = yield* SingleTransformMode({
        _tag: "SingleTransform",
        input: transformation
      })
      return mode
    }
  })

/**
 * Detect batch palette mode from color input
 */
const detectBatchPaletteMode = (
  colorInput: string
): Effect.Effect<ExecutionMode, ParseError> =>
  Effect.gen(function*() {
    const pairs = yield* parseBatchPairsInput(colorInput)

    // Keep stops as-is (undefined allowed) - batch executor will prompt for missing ones
    const colorStopPairs = pairs.map((p) => ({
      color: p.color,
      stop: p.stop
    }))

    const mode = yield* BatchPalettesMode({
      _tag: "BatchPalettes",
      pairs: colorStopPairs
    })
    return mode
  })

/**
 * Detect single palette mode
 */
const detectSinglePaletteMode = (
  input: ModeDetectionInput
): Effect.Effect<ExecutionMode, ParseError> =>
  Effect.gen(function*() {
    const colorStr = O.getOrNull(input.colorOpt) ?? ""
    const color = yield* ColorString(colorStr)

    const stopNum = O.getOrNull(input.stopOpt)
    let stop: number | undefined

    if (stopNum !== null) {
      stop = yield* StopPosition(stopNum)
    }

    const mode = yield* SinglePaletteMode({
      _tag: "SinglePalette",
      color,
      stop
    })
    return mode
  })

/**
 * Main mode detection logic
 */
const detectModeImpl = (
  input: ModeDetectionInput
): Effect.Effect<ModeDetectionResult, ParseError | TransformationParseError> =>
  Effect.gen(function*() {
    const interactive = isInteractive(input)
    const colorInput = O.getOrNull(input.colorOpt)

    // If no color input, it's interactive single mode
    // Don't validate color in interactive mode - it will be prompted for
    if (!colorInput) {
      return {
        mode: {
          _tag: "SinglePalette" as const,
          color: "",
          stop: undefined
        },
        isInteractive: true
      }
    }

    // Check for transformation syntax
    if (isTransformationSyntax(colorInput)) {
      const mode = yield* detectTransformationMode(colorInput)
      const result = yield* ModeDetectionResultDecoder({
        mode,
        isInteractive: interactive
      })
      return result
    }

    // Check for batch palette mode (comma or :: separator)
    if (colorInput.includes(",") || colorInput.includes("::")) {
      const mode = yield* detectBatchPaletteMode(colorInput)
      const result = yield* ModeDetectionResultDecoder({
        mode,
        isInteractive: interactive
      })
      return result
    }

    // Default to single palette mode
    const mode = yield* detectSinglePaletteMode(input)
    const result = yield* ModeDetectionResultDecoder({
      mode,
      isInteractive: interactive
    })
    return result
  })

/**
 * ModeResolver service using Effect.Service pattern
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
export class ModeResolver extends Effect.Service<ModeResolver>()("ModeResolver", {
  effect: Effect.succeed({
    /**
     * Detect execution mode from CLI inputs
     */
    detectMode: detectModeImpl
  })
}) {
  /**
   * Test layer with same implementation as Default
   */
  static readonly Test = Effect.Service<ModeResolver>()("ModeResolver", {
    effect: Effect.succeed({
      detectMode: detectModeImpl
    })
  }).Default
}
