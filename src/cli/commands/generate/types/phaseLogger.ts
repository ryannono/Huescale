/**
 * Phase logging utility for CLI session observability.
 * Provides non-invasive phase tracking without modifying core logic.
 */

import { Effect, pipe } from "effect"
import { ConsoleService } from "../../../../services/ConsoleService/index.js"
import { SessionPhase } from "./sessionPhase.js"

// ============================================================================
// Configuration
// ============================================================================

/**
 * Whether phase logging is enabled.
 * Set to false in production, true for debugging.
 */
const PHASE_LOGGING_ENABLED = false

// ============================================================================
// Formatting
// ============================================================================

const PHASE_PREFIX = "[Phase]"

const formatSimplePhase = (label: string): string => `${PHASE_PREFIX} ${label}`

const formatModePhase = (action: string, modeTag: string): string => `${PHASE_PREFIX} ${action} ${modeTag}`

const formatPhaseMessage = (phase: SessionPhase): string =>
  SessionPhase.$match(phase, {
    Initializing: () => formatSimplePhase("Initializing"),
    SelectingMode: () => formatSimplePhase("Selecting mode"),
    GatheringInput: ({ mode }) => formatModePhase("Gathering input for", mode._tag),
    ValidatingInput: ({ mode }) => formatModePhase("Validating input for", mode._tag),
    Executing: ({ mode }) => formatModePhase("Executing", mode._tag),
    DisplayingResult: () => formatSimplePhase("Displaying result"),
    Complete: () => formatSimplePhase("Complete")
  })

// ============================================================================
// Logging Effects
// ============================================================================

const logMessage = (message: string): Effect.Effect<void, never, ConsoleService> =>
  pipe(
    ConsoleService,
    Effect.flatMap((console) => console.log.step(message))
  )

/** Logs a phase transition. No-op when PHASE_LOGGING_ENABLED is false. */
export const logPhase = (phase: SessionPhase): Effect.Effect<void, never, ConsoleService> =>
  PHASE_LOGGING_ENABLED
    ? pipe(phase, formatPhaseMessage, logMessage)
    : Effect.void

/** Wraps an effect with phase entry logging. No-op when disabled. */
export const withPhase = <A, E, R>(
  phase: SessionPhase,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R | ConsoleService> =>
  PHASE_LOGGING_ENABLED
    ? pipe(
      logPhase(phase),
      Effect.zipRight(effect)
    )
    : effect
