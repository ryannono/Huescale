/**
 * Tagged enum representing the phases of a CLI session.
 * Provides explicit state tracking for debugging and observability.
 */

import { Data } from "effect"
import type { ExecutionMode } from "../modes/resolver.schema.js"

/**
 * CLI session phases for explicit state tracking.
 *
 * Flow: Initializing → SelectingMode → GatheringInput → Executing → DisplayingResult → Complete
 */
export type SessionPhase = Data.TaggedEnum<{
  /** Initial state before any processing. */
  readonly Initializing: object

  /** Prompting user to select execution mode (when not inferrable from flags). */
  readonly SelectingMode: object

  /** Gathering input for the selected mode (prompting for missing fields). */
  readonly GatheringInput: { readonly mode: ExecutionMode }

  /** Validating collected input before execution. */
  readonly ValidatingInput: { readonly mode: ExecutionMode }

  /** Executing the palette generation/transformation. */
  readonly Executing: { readonly mode: ExecutionMode }

  /** Displaying results to the user. */
  readonly DisplayingResult: object

  /** Session complete. */
  readonly Complete: object
}>

export const SessionPhase = Data.taggedEnum<SessionPhase>()

export const {
  Complete,
  DisplayingResult,
  Executing,
  GatheringInput,
  Initializing,
  SelectingMode,
  ValidatingInput
} = SessionPhase
