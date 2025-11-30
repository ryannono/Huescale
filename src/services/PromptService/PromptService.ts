/**
 * Prompt service for CLI user input operations
 *
 * Abstracts user prompts to enable testing with scripted responses
 * and maintain explicit effect tracking for all IO operations.
 */

import * as clack from "@clack/prompts"
import type { SelectOptions as ClackSelectOptions } from "@clack/prompts"
import { Data, Effect, Ref } from "effect"

// ============================================================================
// Errors
// ============================================================================

/**
 * Error thrown when user cancels an operation (e.g., Ctrl+C in prompts)
 *
 * This error should be caught at the CLI entry point and result in a
 * graceful exit with code 0 (not an error condition).
 */
export class CancelledError extends Data.TaggedError("CancelledError")<{
  readonly message: string
}> {}

// ============================================================================
// Types
// ============================================================================

/** Text prompt options */
export type TextOptions = {
  readonly message: string
  readonly placeholder?: string | undefined
  readonly defaultValue?: string | undefined
  readonly validate?: ((value: string) => string | undefined) | undefined
}

/** Re-export clack's SelectOptions for select prompts */
export type SelectOptions<T> = ClackSelectOptions<T>

/** Confirm prompt options */
export type ConfirmOptions = {
  readonly message: string
  readonly initialValue?: boolean | undefined
}

/** Scripted responses for test mode */
export type ScriptedResponses<TSelect = unknown> = {
  readonly textResponses: ReadonlyArray<string>
  readonly selectResponses: ReadonlyArray<TSelect>
  readonly confirmResponses: ReadonlyArray<boolean>
}

/** Service API interface for documentation and extension */
export interface PromptServiceApi {
  readonly text: (
    options: TextOptions
  ) => Effect.Effect<string, CancelledError>
  readonly select: <T>(
    options: SelectOptions<T>
  ) => Effect.Effect<T, CancelledError>
  readonly confirm: (
    options: ConfirmOptions
  ) => Effect.Effect<boolean, CancelledError>
}

// ============================================================================
// Helpers
// ============================================================================

/** Handle cancellation by returning a CancelledError */
const handleCancel = <T>(value: T | symbol): Effect.Effect<T, CancelledError> =>
  clack.isCancel(value)
    ? Effect.fail(new CancelledError({ message: "Operation cancelled" }))
    : Effect.succeed(value)

/** Extract first element from array, failing if empty */
const takeFirst = <T>(
  ref: Ref.Ref<ReadonlyArray<T>>,
  errorMessage: string
): Effect.Effect<T, CancelledError> =>
  Ref.modify(ref, (arr) => {
    const [first, ...rest] = arr
    return [first, rest]
  }).pipe(
    Effect.flatMap((value) =>
      value === undefined
        ? Effect.fail(new CancelledError({ message: errorMessage }))
        : Effect.succeed(value)
    )
  )

// ============================================================================
// Service Definition
// ============================================================================

/**
 * Service for handling interactive command-line prompts.
 *
 * Provides methods for text input, selection, and confirmation prompts using the clack library.
 * All prompts return Effects that may fail with CancelledError if the user cancels the prompt.
 */
export class PromptService extends Effect.Service<PromptService>()(
  "@oklch-palette-generator/services/PromptService",
  {
    effect: Effect.succeed(
      {
        /** Text input prompt */
        text: (options: TextOptions): Effect.Effect<string, CancelledError> =>
          Effect.promise(() =>
            clack.text({
              message: options.message,
              ...(options.placeholder !== undefined && {
                placeholder: options.placeholder
              }),
              ...(options.defaultValue !== undefined && {
                defaultValue: options.defaultValue
              }),
              ...(options.validate !== undefined && {
                validate: options.validate
              })
            })
          ).pipe(Effect.flatMap(handleCancel)),

        /** Select from options prompt */
        select: <T>(
          options: SelectOptions<T>
        ): Effect.Effect<T, CancelledError> =>
          Effect.promise(() => clack.select(options)).pipe(
            Effect.flatMap(handleCancel)
          ),

        /** Yes/no confirmation prompt */
        confirm: (
          options: ConfirmOptions
        ): Effect.Effect<boolean, CancelledError> =>
          Effect.promise(() =>
            clack.confirm({
              message: options.message,
              ...(options.initialValue !== undefined && {
                initialValue: options.initialValue
              })
            })
          ).pipe(Effect.flatMap(handleCancel))
      } satisfies PromptServiceApi
    )
  }
) {
  /**
   * Create a test layer with scripted responses
   *
   * Responses are consumed in order. If responses run out, fails with CancelledError.
   * This ensures tests explicitly provide all expected responses.
   *
   * Note: Select responses use `unknown` internally. Test callers must ensure
   * provided values match the expected select types at runtime.
   */
  static readonly makeTest = <TSelect>(responses: ScriptedResponses<TSelect>) =>
    Effect.Service<PromptService>()("@oklch-palette-generator/services/PromptService", {
      effect: Effect.gen(function*() {
        const textRef = yield* Ref.make<ReadonlyArray<string>>([
          ...responses.textResponses
        ])
        // Widen to unknown to support generic select<T> method
        const selectRef = yield* Ref.make<ReadonlyArray<unknown>>(
          responses.selectResponses.map((v): unknown => v)
        )
        const confirmRef = yield* Ref.make<ReadonlyArray<boolean>>([
          ...responses.confirmResponses
        ])

        // Internal helper for select that returns unknown and lets call site determine type
        const takeFirstSelect = Ref.modify(selectRef, (arr) => {
          const [first, ...rest] = arr
          return [first, rest]
        }).pipe(
          Effect.flatMap((value) =>
            value === undefined
              ? Effect.fail(
                new CancelledError({
                  message: "No more scripted select responses"
                })
              )
              : Effect.succeed(value)
          )
        )

        return {
          text: (
            _options: TextOptions
          ): Effect.Effect<string, CancelledError> => takeFirst(textRef, "No more scripted text responses"),

          // EXCEPTION: Type assertion required here because:
          // - The select<T> method signature requires returning Effect<T>
          // - Test responses are stored as unknown (cannot know T at storage time)
          // - TypeScript cannot safely narrow unknown → T without assertion
          // Test callers must ensure provided values match expected types.
          select: <T>(
            _options: SelectOptions<T>
          ): Effect.Effect<T, CancelledError> => takeFirstSelect as Effect.Effect<T, CancelledError>,

          confirm: (
            _options: ConfirmOptions
          ): Effect.Effect<boolean, CancelledError> => takeFirst(confirmRef, "No more scripted confirm responses")
        } satisfies PromptServiceApi
      })
    }).Default

  /**
   * Default test layer with empty responses (fails immediately on any prompt)
   */
  static readonly Test = PromptService.makeTest({
    textResponses: [],
    selectResponses: [],
    confirmResponses: []
  })
}
