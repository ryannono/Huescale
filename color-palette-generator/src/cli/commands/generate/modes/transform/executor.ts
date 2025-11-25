/**
 * Transformation mode handler
 *
 * Applies optical appearance transformations and generates palettes
 */

import { Effect, Option as O } from "effect"
import { oklchToHex } from "../../../../../domain/color/conversions.js"
import { applyOpticalAppearance } from "../../../../../domain/color/transformation.js"
import { ColorSpace, parseColorStringToOKLCH } from "../../../../../schemas/color.js"
import type { TransformationBatch, TransformationInput } from "../../../../../schemas/transformation.js"
import {
  buildExportConfig,
  displayPalette,
  executePaletteExport,
  executePalettesExport,
  generateAndDisplay
} from "../../output/formatter.js"

/**
 * Handle single transformation: ref>target::stop
 */
export const handleSingleTransformation = ({
  exportOpt,
  exportPath,
  formatOpt,
  input,
  nameOpt,
  pattern
}: {
  exportOpt: O.Option<string>
  exportPath: O.Option<string>
  formatOpt: O.Option<string>
  input: TransformationInput
  isInteractive: boolean
  nameOpt: O.Option<string>
  pattern: string
}) =>
  Effect.gen(function*() {
    // Parse colors to OKLCH
    const referenceColor = yield* parseColorStringToOKLCH(input.reference)
    const targetColor = yield* parseColorStringToOKLCH(input.target)

    // Apply transformation
    const transformedColor = yield* applyOpticalAppearance(referenceColor, targetColor)

    // Convert back to hex for display
    const transformedHex = yield* oklchToHex(transformedColor)

    // Generate palette with transformed color
    const name = O.isSome(nameOpt) ? O.getOrThrow(nameOpt) : "transformed"
    const formatStr = O.getOrNull(formatOpt) ?? "hex"
    const format = yield* ColorSpace(formatStr)

    const result = yield* generateAndDisplay({
      color: transformedHex,
      format,
      name,
      pattern,
      stop: input.stop
    })

    // Display palette
    yield* displayPalette(result)

    // Handle export
    const exportConfig = yield* buildExportConfig(exportOpt, exportPath)

    yield* O.match(exportConfig, {
      onNone: () => Effect.void,
      onSome: (config) => executePaletteExport(result, config)
    })

    return result
  })

/**
 * Handle one-to-many transformation: ref>(t1,t2,t3)::stop
 */
export const handleOneToManyTransformation = ({
  exportOpt,
  exportPath,
  formatOpt,
  input,
  nameOpt,
  pattern
}: {
  exportOpt: O.Option<string>
  exportPath: O.Option<string>
  formatOpt: O.Option<string>
  input: TransformationBatch
  isInteractive: boolean
  nameOpt: O.Option<string>
  pattern: string
}) =>
  Effect.gen(function*() {
    // Parse reference color
    const referenceColor = yield* parseColorStringToOKLCH(input.reference)

    const formatStr = O.getOrNull(formatOpt) ?? "hex"
    const format = yield* ColorSpace(formatStr)

    const results: Array<Effect.Effect.Success<ReturnType<typeof generateAndDisplay>>> = []

    // Process each target
    for (const target of input.targets) {
      const targetColor = yield* parseColorStringToOKLCH(target)
      const transformedColor = yield* applyOpticalAppearance(referenceColor, targetColor)
      const transformedHex = yield* oklchToHex(transformedColor)

      // Generate palette
      const name = O.isSome(nameOpt) ? `${O.getOrThrow(nameOpt)}-${target}` : `transformed-${target}`

      const result = yield* generateAndDisplay({
        color: transformedHex,
        format,
        name,
        pattern,
        stop: input.stop
      })

      results.push(result)

      // Display each palette
      yield* displayPalette(result)
    }

    // Handle export
    const exportConfig = yield* buildExportConfig(exportOpt, exportPath)

    yield* O.match(exportConfig, {
      onNone: () => Effect.void,
      onSome: (config) => executePalettesExport(results, config)
    })

    return results
  })

/**
 * Handle batch transformations (multiple lines)
 */
export const handleBatchTransformations = ({
  exportOpt,
  exportPath,
  formatOpt,
  inputs,
  isInteractive,
  nameOpt,
  pattern
}: {
  exportOpt: O.Option<string>
  exportPath: O.Option<string>
  formatOpt: O.Option<string>
  inputs: Array<TransformationInput | TransformationBatch>
  isInteractive: boolean
  nameOpt: O.Option<string>
  pattern: string
}) =>
  Effect.gen(function*() {
    const results: Array<Effect.Effect.Success<ReturnType<typeof generateAndDisplay>>> = []

    for (const input of inputs) {
      if ("targets" in input) {
        // One-to-many transformation (skip export - batch handles it)
        const batchResults = yield* handleOneToManyTransformation({
          exportOpt: O.none(),
          exportPath: O.none(),
          formatOpt,
          input,
          isInteractive,
          nameOpt,
          pattern
        })
        results.push(...batchResults)
      } else {
        // Single transformation (skip export - batch handles it)
        const result = yield* handleSingleTransformation({
          exportOpt: O.none(),
          exportPath: O.none(),
          formatOpt,
          input,
          isInteractive,
          nameOpt,
          pattern
        })
        results.push(result)
      }
    }

    // Handle export
    const exportConfig = yield* buildExportConfig(exportOpt, exportPath)

    yield* O.match(exportConfig, {
      onNone: () => Effect.void,
      onSome: (config) => executePalettesExport(results, config)
    })

    return results
  })
