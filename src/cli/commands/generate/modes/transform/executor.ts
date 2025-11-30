/**
 * Transformation mode handler
 *
 * Applies optical appearance transformations and generates palettes.
 */

import { Array as Arr, Effect, Option as O, pipe } from "effect"
import { applyOpticalAppearance, oklchToHex, parseColorStringToOKLCH } from "../../../../../domain/color/color.js"
import type { ColorSpace as ColorSpaceType } from "../../../../../domain/color/color.schema.js"
import type { StopPosition } from "../../../../../domain/palette/palette.schema.js"
import { ConfigService } from "../../../../../services/ConfigService.js"
import { BatchResult, ISOTimestamp } from "../../../../../services/PaletteService/palette.schema.js"
import {
  buildExportConfig,
  displayPalette,
  executeBatchExport,
  executePaletteExport,
  generateAndDisplay
} from "../../formatter.js"
import type { BatchTransformComplete } from "../../inputSpecs/batchTransform.input.js"
import type { ManyTransformComplete } from "../../inputSpecs/manyTransform.input.js"
import type { SingleTransformComplete } from "../../inputSpecs/singleTransform.input.js"

// ============================================================================
// Types
// ============================================================================

type GeneratedPalette = Effect.Effect.Success<ReturnType<typeof generateAndDisplay>>

type TransformExecuteOptions = {
  readonly exportOpt: O.Option<string>
  readonly exportPath: O.Option<string>
}

// ============================================================================
// Workflow-Based Execute Functions
// ============================================================================

/**
 * Execute single transformation with complete, validated input.
 *
 * This is the new workflow-based API that receives fully validated input.
 * No prompting or validation happens here - just pure execution.
 */
export const executeSingleTransform = (
  input: SingleTransformComplete,
  options: TransformExecuteOptions
) =>
  Effect.gen(function*() {
    const result = yield* transformAndGenerate(
      input.reference,
      input.target,
      input.stop,
      input.name,
      input.format,
      input.pattern
    )

    yield* displayPalette(result)
    yield* handleSingleExport(result, options.exportOpt, options.exportPath)

    return result
  })

/**
 * Execute one-to-many transformation with complete, validated input.
 *
 * Applies a single reference color's optical appearance to multiple target hues.
 * Each target receives the same lightness and chroma, varying only by hue.
 */
export const executeManyTransform = (
  input: ManyTransformComplete,
  options: TransformExecuteOptions
) =>
  Effect.gen(function*() {
    const referenceColor = yield* parseColorStringToOKLCH(input.reference)

    const results = yield* Effect.forEach(
      input.targets,
      (target) =>
        Effect.gen(function*() {
          const targetColor = yield* parseColorStringToOKLCH(target)
          const transformedColor = yield* applyOpticalAppearance(referenceColor, targetColor)
          const transformedHex = yield* oklchToHex(transformedColor)

          return yield* generateAndDisplay({
            color: transformedHex,
            format: input.format,
            name: `${input.name}-${target}`,
            pattern: input.pattern,
            stop: input.stop
          })
        }),
      { concurrency: "unbounded" }
    )

    yield* Effect.forEach(results, displayPalette, { concurrency: 1 })
    yield* handleBatchExport(results, options.exportOpt, options.exportPath, "one-to-many-transformation")

    return results
  })

/**
 * Execute batch transformations with complete, validated input.
 *
 * Processes multiple transformation inputs, each potentially being a single
 * or one-to-many transformation. Results are flattened into a single array.
 */
export const executeBatchTransform = (
  input: BatchTransformComplete,
  options: TransformExecuteOptions
) =>
  Effect.gen(function*() {
    const nestedResults = yield* Effect.forEach(
      input.transformations,
      (transformation) =>
        "targets" in transformation
          ? generateOneToManyFromComplete(transformation, input.format, input.name, input.pattern)
          : Effect.map(
            generateSingleFromComplete(transformation, input.format, input.name, input.pattern),
            (result) => [result]
          ),
      { concurrency: "unbounded" }
    )

    const results = Arr.flatten(nestedResults)

    yield* Effect.forEach(results, displayPalette, { concurrency: 1 })
    yield* handleBatchExport(results, options.exportOpt, options.exportPath, input.name)

    return results
  })

// ============================================================================
// Generation Helpers
// ============================================================================

/** Generate palette for a single transformation from Complete type (no display) */
const generateSingleFromComplete = (
  input: { readonly reference: string; readonly target: string; readonly stop: StopPosition },
  format: ColorSpaceType,
  name: string,
  pattern: string
) =>
  Effect.gen(function*() {
    const referenceColor = yield* parseColorStringToOKLCH(input.reference)
    const targetColor = yield* parseColorStringToOKLCH(input.target)
    const transformedColor = yield* applyOpticalAppearance(referenceColor, targetColor)
    const transformedHex = yield* oklchToHex(transformedColor)

    return yield* generateAndDisplay({
      color: transformedHex,
      format,
      name,
      pattern,
      stop: input.stop
    })
  })

/** Generate palettes for one-to-many transformation from Complete type (no display) */
const generateOneToManyFromComplete = (
  input: { readonly reference: string; readonly targets: ReadonlyArray<string>; readonly stop: StopPosition },
  format: ColorSpaceType,
  baseName: string,
  pattern: string
) =>
  Effect.gen(function*() {
    const referenceColor = yield* parseColorStringToOKLCH(input.reference)

    return yield* Effect.forEach(
      input.targets,
      (target) =>
        Effect.gen(function*() {
          const targetColor = yield* parseColorStringToOKLCH(target)
          const transformedColor = yield* applyOpticalAppearance(referenceColor, targetColor)
          const transformedHex = yield* oklchToHex(transformedColor)

          return yield* generateAndDisplay({
            color: transformedHex,
            format,
            name: `${baseName}-${target}`,
            pattern,
            stop: input.stop
          })
        }),
      { concurrency: "unbounded" }
    )
  })

// ============================================================================
// Transformation
// ============================================================================

/** Transform a single color and generate palette */
const transformAndGenerate = (
  reference: string,
  target: string,
  stop: StopPosition,
  name: string,
  format: ColorSpaceType,
  pattern: string
) =>
  Effect.gen(function*() {
    const referenceColor = yield* parseColorStringToOKLCH(reference)
    const targetColor = yield* parseColorStringToOKLCH(target)
    const transformedColor = yield* applyOpticalAppearance(referenceColor, targetColor)
    const transformedHex = yield* oklchToHex(transformedColor)

    return yield* generateAndDisplay({
      color: transformedHex,
      format,
      name,
      pattern,
      stop
    })
  })

// ============================================================================
// Export Handling
// ============================================================================

/** Handle export for a single palette */
const handleSingleExport = (
  result: GeneratedPalette,
  exportOpt: O.Option<string>,
  exportPath: O.Option<string>
) =>
  Effect.gen(function*() {
    const exportConfig = yield* buildExportConfig(exportOpt, exportPath)

    yield* O.match(exportConfig, {
      onNone: () => Effect.void,
      onSome: (config) => executePaletteExport(result, config)
    })
  })

/** Handle export for batch palettes */
const handleBatchExport = (
  results: ReadonlyArray<GeneratedPalette>,
  exportOpt: O.Option<string>,
  exportPath: O.Option<string>,
  groupName: string
) =>
  Effect.gen(function*() {
    const exportConfig = yield* buildExportConfig(exportOpt, exportPath)

    yield* O.match(exportConfig, {
      onNone: () => Effect.void,
      onSome: (config) =>
        Effect.gen(function*() {
          const generatedAt = yield* Effect.clockWith((clock) =>
            clock.currentTimeMillis.pipe(
              Effect.flatMap((millis) => ISOTimestamp(new Date(millis).toISOString()))
            )
          )

          const configService = yield* ConfigService
          const configData = yield* configService.getConfig()
          const outputFormat = pipe(
            Arr.head(results),
            O.map((r) => r.outputFormat),
            O.getOrElse(() => configData.defaultOutputFormat)
          )

          const batch = yield* Arr.match(results, {
            onEmpty: () => Effect.die(new Error("Cannot export empty batch results")),
            onNonEmpty: (nonEmptyResults) =>
              BatchResult({
                generatedAt,
                groupName,
                outputFormat,
                palettes: nonEmptyResults,
                partial: false
              })
          })

          return yield* executeBatchExport(batch, config)
        })
    })
  })
