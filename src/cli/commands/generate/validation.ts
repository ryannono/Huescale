/**
 * Reusable validation logic with error recovery
 *
 * These helpers add retry logic to schema validations.
 * They are used AFTER mode detection, within each handler.
 */

import { Effect, Option as O, pipe } from "effect"
import type { ParseError } from "effect/ParseResult"
import { ExportTarget, type ExportTarget as ExportTargetType } from "../../../io/io.schema.js"
import { ConsoleService } from "../../../services/ConsoleService/index.js"
import { CancelledError, PromptService } from "../../../services/PromptService/index.js"
import { promptForExportTarget } from "../../prompts.js"

// ============================================================================
// Generic Validator
// ============================================================================

/**
 * Configuration for creating a validator with retry logic
 * TRawInput is the type accepted by the validator (e.g., string, number)
 * TPromptOutput is the type returned by the prompt (may be same as TRawInput)
 * TOutput is the validated output type
 */
type ValidatorConfig<TRawInput, TPromptOutput, TOutput> = {
  readonly validate: (value: TRawInput) => Effect.Effect<TOutput, ParseError>
  readonly prompt: () => Effect.Effect<TPromptOutput, ParseError | CancelledError, PromptService>
  readonly errorMessage: string
}

/**
 * Create a validator that retries on failure using recursive Effect composition.
 * Replaces imperative while(true) loops with FP-style recursion.
 *
 * CancelledError is not caught and propagates up - this is intentional as
 * cancellation should exit the entire flow, not trigger a retry.
 */
const createValidator = <TRawInput, TPromptOutput extends TRawInput, TOutput>(
  config: ValidatorConfig<TRawInput, TPromptOutput, TOutput>
) => {
  const logErrorAndRetry: Effect.Effect<TOutput, CancelledError, ConsoleService | PromptService> = pipe(
    Effect.flatMap(ConsoleService, (console) => console.log.error(config.errorMessage)),
    Effect.flatMap(() => config.prompt()),
    Effect.flatMap(config.validate),
    Effect.catchTag("ParseError", () => logErrorAndRetry)
  )

  return (opt: O.Option<TRawInput>): Effect.Effect<TOutput, CancelledError, ConsoleService | PromptService> =>
    pipe(
      O.match(opt, {
        onNone: () => pipe(config.prompt(), Effect.flatMap(config.validate)),
        onSome: (value) =>
          pipe(
            config.validate(value),
            Effect.mapError((e): ParseError | CancelledError => e)
          )
      }),
      Effect.catchTag("ParseError", () => logErrorAndRetry)
    )
}

// ============================================================================
// Specific Validators
// ============================================================================

/**
 * Validate export target with retry on error
 */
export const validateExportTarget = (
  exportOpt: O.Option<string>
): Effect.Effect<ExportTargetType, CancelledError, ConsoleService | PromptService> =>
  createValidator<string, ExportTargetType, ExportTargetType>({
    validate: ExportTarget,
    prompt: promptForExportTarget,
    errorMessage: "Invalid export target. Please try again."
  })(exportOpt)
