/**
 * Reusable validation logic with error recovery
 *
 * These helpers add retry logic to schema validations.
 * They are used AFTER mode detection, within each handler.
 */

import * as clack from "@clack/prompts"
import { Effect, Either, Option as O } from "effect"
import { ColorSpace, ColorString } from "../../../domain/color/color.schema.js"
import { StopPosition } from "../../../domain/palette/palette.schema.js"
import { ExportTarget } from "../../../services/ExportService/export.schema.js"
import { promptForColor, promptForExportTarget, promptForOutputFormat, promptForStop } from "../../prompts.js"

/**
 * Validate color input with retry on error (for single mode)
 */
export const validateColor = (colorOpt: O.Option<string>) =>
  Effect.gen(function*() {
    while (true) {
      const colorResult = yield* Effect.either(
        O.match(colorOpt, {
          onNone: () => promptForColor(),
          onSome: (value) => ColorString(value)
        })
      )
      if (Either.isRight(colorResult)) {
        return colorResult.right
      }
      // On error, always prompt interactively
      clack.log.error("Invalid color format. Please try again.")
      const retryColor = yield* promptForColor()
      const retryResult = yield* Effect.either(ColorString(retryColor))
      if (Either.isRight(retryResult)) {
        return retryResult.right
      }
    }
  })

/**
 * Validate stop position with retry on error
 */
export const validateStop = (stopOpt: O.Option<number>) =>
  Effect.gen(function*() {
    while (true) {
      const stopResult = yield* Effect.either(
        O.match(stopOpt, {
          onNone: () => promptForStop(),
          onSome: (value) => StopPosition(value)
        })
      )
      if (Either.isRight(stopResult)) {
        return yield* StopPosition(stopResult.right)
      }
      // On error, always prompt interactively
      clack.log.error("Invalid stop position. Please try again.")
      const retryStop = yield* promptForStop()
      const retryResult = yield* Effect.either(StopPosition(retryStop))
      if (Either.isRight(retryResult)) {
        return yield* StopPosition(retryResult.right)
      }
    }
  })

/**
 * Validate output format with retry on error
 */
export const validateFormat = (formatOpt: O.Option<string>) =>
  Effect.gen(function*() {
    while (true) {
      const formatResult = yield* Effect.either(
        O.match(formatOpt, {
          onNone: () => promptForOutputFormat(),
          onSome: (value) => ColorSpace(value)
        })
      )
      if (Either.isRight(formatResult)) {
        return formatResult.right
      }
      // On error, always prompt interactively
      clack.log.error("Invalid format. Please try again.")
      const retryFormat = yield* promptForOutputFormat()
      const retryResult = yield* Effect.either(ColorSpace(retryFormat))
      if (Either.isRight(retryResult)) {
        return retryResult.right
      }
    }
  })

/**
 * Validate export target with retry on error
 */
export const validateExportTarget = (exportOpt: O.Option<string>) =>
  Effect.gen(function*() {
    while (true) {
      const exportResult = yield* Effect.either(
        O.match(exportOpt, {
          onNone: () => promptForExportTarget(),
          onSome: (value) => ExportTarget(value)
        })
      )
      if (Either.isRight(exportResult)) {
        return yield* ExportTarget(exportResult.right)
      }
      // On error, always prompt interactively
      clack.log.error("Invalid export target. Please try again.")
      const retryExport = yield* promptForExportTarget()
      const retryResult = yield* Effect.either(ExportTarget(retryExport))
      if (Either.isRight(retryResult)) {
        return yield* ExportTarget(retryResult.right)
      }
    }
  })
