/**
 * Transformation mode handler
 *
 * Applies optical appearance transformations and generates palettes
 */

import * as clack from "@clack/prompts"
import { Effect, Option as O } from "effect"
import { oklchToHex } from "../../../domain/color/conversions.js"
import { applyOpticalAppearance } from "../../../domain/color/transformation.js"
import { ColorSpace, parseColorStringToOKLCH } from "../../../schemas/color.js"
import type { TransformationBatch, TransformationInput } from "../../../schemas/transformation.js"
import { displayPaletteInteractive, displayPaletteSimple, generateAndDisplay } from "../shared.js"

/**
 * Handle single transformation: ref>target::stop
 */
export const handleSingleTransformation = ({
  formatOpt,
  input,
  isInteractive,
  nameOpt,
  pattern
}: {
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

    // Display with appropriate formatting
    if (isInteractive) {
      yield* displayPaletteInteractive(result)
    } else {
      yield* displayPaletteSimple(result)
    }

    return result
  })

/**
 * Handle one-to-many transformation: ref>(t1,t2,t3)::stop
 */
export const handleOneToManyTransformation = ({
  formatOpt,
  input,
  isInteractive,
  nameOpt,
  pattern
}: {
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

    const results = []

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
      if (isInteractive) {
        yield* displayPaletteInteractive(result)
      } else {
        yield* displayPaletteSimple(result)
      }
    }

    return results
  })

/**
 * Handle batch transformations (multiple lines)
 */
export const handleBatchTransformations = ({
  formatOpt,
  inputs,
  isInteractive,
  nameOpt,
  pattern
}: {
  formatOpt: O.Option<string>
  inputs: Array<TransformationInput | TransformationBatch>
  isInteractive: boolean
  nameOpt: O.Option<string>
  pattern: string
}) =>
  Effect.gen(function*() {
    const results = []

    for (const input of inputs) {
      if ("targets" in input) {
        // One-to-many transformation
        const batchResults = yield* handleOneToManyTransformation({
          formatOpt,
          input,
          isInteractive,
          nameOpt,
          pattern
        })
        results.push(...batchResults)
      } else {
        // Single transformation
        const result = yield* handleSingleTransformation({
          formatOpt,
          input,
          isInteractive,
          nameOpt,
          pattern
        })
        results.push(result)
      }
    }

    if (isInteractive) {
      clack.outro(`✅ Generated ${results.length} palette(s)`)
    }

    return results
  })
