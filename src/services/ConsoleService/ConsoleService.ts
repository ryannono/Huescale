/**
 * Console output service for CLI display operations
 *
 * Abstracts console output to enable testing and maintain
 * explicit effect tracking for all IO operations.
 */

import * as clack from "@clack/prompts"
import { Effect, Ref } from "effect"

// ============================================================================
// Types
// ============================================================================

/** Spinner control handle with effectful operations */
export type SpinnerHandle = {
  readonly start: (message?: string) => Effect.Effect<void>
  readonly stop: (message?: string) => Effect.Effect<void>
  readonly message: (message: string) => Effect.Effect<void>
}

/** Captured output for testing */
export type CapturedOutput = {
  readonly intros: ReadonlyArray<string>
  readonly outros: ReadonlyArray<string>
  readonly cancels: ReadonlyArray<string>
  readonly notes: ReadonlyArray<{ readonly content: string; readonly title: string | undefined }>
  readonly logs: {
    readonly success: ReadonlyArray<string>
    readonly error: ReadonlyArray<string>
    readonly warning: ReadonlyArray<string>
    readonly info: ReadonlyArray<string>
    readonly message: ReadonlyArray<string>
    readonly step: ReadonlyArray<string>
  }
  readonly spinnerMessages: ReadonlyArray<string>
}

/** Service API interface for documentation and extension */
export interface ConsoleServiceApi {
  readonly intro: (message: string) => Effect.Effect<void>
  readonly outro: (message: string) => Effect.Effect<void>
  readonly cancel: (message: string) => Effect.Effect<void>
  readonly note: (content: string, title?: string) => Effect.Effect<void>
  readonly log: {
    readonly success: (message: string) => Effect.Effect<void>
    readonly error: (message: string) => Effect.Effect<void>
    readonly warning: (message: string) => Effect.Effect<void>
    readonly info: (message: string) => Effect.Effect<void>
    readonly message: (message: string) => Effect.Effect<void>
    readonly step: (message: string) => Effect.Effect<void>
  }
  readonly spinner: () => Effect.Effect<SpinnerHandle>
  readonly getCaptured: () => Effect.Effect<CapturedOutput>
}

// ============================================================================
// Test State
// ============================================================================

/** Initial empty state for test captures */
const initialTestState: CapturedOutput = {
  intros: [],
  outros: [],
  cancels: [],
  notes: [],
  logs: { success: [], error: [], warning: [], info: [], message: [], step: [] },
  spinnerMessages: []
}

// ============================================================================
// Service Definition
// ============================================================================

/**
 * A service for handling console output operations with support for both real and test implementations.
 *
 * This service provides a functional interface for console operations using the Effect library
 * and clack UI primitives. It includes methods for displaying messages, managing spinners,
 * and logging at various levels.
 *
 * The service has two implementations:
 * - **Default**: Uses clack to display actual console output
 * - **Test**: Captures all output in memory for testing purposes
 */
export class ConsoleService
  extends Effect.Service<ConsoleService>()("@oklch-palette-generator/services/ConsoleService", {
    effect: Effect.succeed(
      {
        /** Display intro banner */
        intro: (message: string) => Effect.sync(() => clack.intro(message)),
        /** Display outro message */
        outro: (message: string) => Effect.sync(() => clack.outro(message)),
        /** Display cancellation message */
        cancel: (message: string) => Effect.sync(() => clack.cancel(message)),
        /** Display a note with optional title */
        note: (content: string, title?: string) => Effect.sync(() => clack.note(content, title)),
        /** Log operations by level */
        log: {
          success: (message: string) => Effect.sync(() => clack.log.success(message)),
          error: (message: string) => Effect.sync(() => clack.log.error(message)),
          warning: (message: string) => Effect.sync(() => clack.log.warn(message)),
          info: (message: string) => Effect.sync(() => clack.log.info(message)),
          message: (message: string) => Effect.sync(() => clack.log.message(message)),
          step: (message: string) => Effect.sync(() => clack.log.step(message))
        },
        /** Create a spinner with effectful operations */
        spinner: () =>
          Effect.sync(() => {
            const s = clack.spinner()
            return {
              start: (msg) => Effect.sync(() => s.start(msg)),
              stop: (msg) => Effect.sync(() => s.stop(msg)),
              message: (msg) => Effect.sync(() => s.message(msg))
            } satisfies SpinnerHandle
          }),
        /** Get captured output (only available in Test layer) */
        getCaptured: (): Effect.Effect<CapturedOutput> => Effect.succeed(initialTestState)
      } satisfies ConsoleServiceApi
    )
  })
{
  /**
   * Test layer that captures all output for assertions
   */
  static readonly Test = Effect.Service<ConsoleService>()("@oklch-palette-generator/services/ConsoleService", {
    effect: Effect.gen(function*() {
      const stateRef = yield* Ref.make<CapturedOutput>(initialTestState)

      const appendTo = <K extends keyof Omit<CapturedOutput, "logs">>(key: K) => (value: CapturedOutput[K][number]) =>
        Ref.update(stateRef, (state) => ({
          ...state,
          [key]: [...state[key], value]
        }))

      const appendToLog = <K extends keyof CapturedOutput["logs"]>(key: K) => (message: string) =>
        Ref.update(stateRef, (state) => ({
          ...state,
          logs: { ...state.logs, [key]: [...state.logs[key], message] }
        }))

      return {
        intro: (message: string) => appendTo("intros")(message),
        outro: (message: string) => appendTo("outros")(message),
        cancel: (message: string) => appendTo("cancels")(message),
        note: (content: string, title?: string) => appendTo("notes")({ content, title }),
        log: {
          success: appendToLog("success"),
          error: appendToLog("error"),
          warning: appendToLog("warning"),
          info: appendToLog("info"),
          message: appendToLog("message"),
          step: appendToLog("step")
        },
        spinner: () =>
          Effect.sync(() => ({
            start: (msg) =>
              msg !== undefined
                ? appendTo("spinnerMessages")(`start: ${msg}`)
                : Effect.void,
            stop: (msg) =>
              msg !== undefined
                ? appendTo("spinnerMessages")(`stop: ${msg}`)
                : Effect.void,
            message: (msg) => appendTo("spinnerMessages")(msg)
          } satisfies SpinnerHandle)),
        getCaptured: () => Ref.get(stateRef)
      } satisfies ConsoleServiceApi
    })
  }).Default
}
