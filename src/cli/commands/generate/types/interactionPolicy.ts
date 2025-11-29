/**
 * Interaction policy determines when and how to prompt the user.
 * Centralizes the scattered prompt behavior logic from handler.ts.
 */

import { Match, Option as O, pipe } from "effect"
import type { ExecutionMode, ModeDetectionResult } from "../modes/resolver.schema.js"

// ============================================================================
// Types
// ============================================================================

/**
 * Policy determining user interaction behavior for a CLI session.
 */
export interface InteractionPolicy {
  /** Whether to show the intro banner. */
  readonly shouldShowIntro: boolean

  /** Whether to prompt for missing inputs (vs fail fast). */
  readonly shouldPromptForMissing: boolean

  /** Whether to show mode selection menu. */
  readonly shouldPromptForModeSelection: boolean

  /** Whether this is a fully interactive session (no flags provided). */
  readonly isFullyInteractive: boolean

  /** Whether this is a fully non-interactive session (all flags provided). */
  readonly isFullyNonInteractive: boolean
}

interface PolicyDerivationInput {
  readonly detection: ModeDetectionResult
  readonly colorOpt: O.Option<string>
  readonly stopOpt: O.Option<number>
  readonly formatOpt: O.Option<string>
  readonly nameOpt: O.Option<string>
}

interface OptionPresence {
  readonly hasColor: boolean
  readonly hasStop: boolean
  readonly hasFormat: boolean
  readonly hasName: boolean
}

// ============================================================================
// Option Presence Derivation
// ============================================================================

const deriveOptionPresence = (input: PolicyDerivationInput): OptionPresence => ({
  hasColor: O.isSome(input.colorOpt),
  hasStop: O.isSome(input.stopOpt),
  hasFormat: O.isSome(input.formatOpt),
  hasName: O.isSome(input.nameOpt)
})

// ============================================================================
// Policy Derivation
// ============================================================================

/**
 * Derive interaction policy from mode detection and CLI flags.
 *
 * This centralizes the logic previously scattered across:
 * - shouldShowIntro()
 * - getModePromptRequirement()
 * - tryInteractiveMode() condition checks
 */
export const deriveInteractionPolicy = (input: PolicyDerivationInput): InteractionPolicy => {
  const { detection, stopOpt } = input
  const { isInteractive, mode } = detection
  const presence = deriveOptionPresence(input)

  const modeRequiresPrompt = getModePromptRequirement(mode, stopOpt)
  const hasMissingRequiredOptions = !presence.hasFormat || !presence.hasName

  const isFullyInteractive = isInteractive && !presence.hasColor
  const isFullyNonInteractive = presence.hasColor &&
    presence.hasStop &&
    presence.hasFormat &&
    presence.hasName &&
    !modeRequiresPrompt
  const shouldShowIntro = isInteractive || hasMissingRequiredOptions || modeRequiresPrompt
  const shouldPromptForModeSelection = isFullyInteractive
  const shouldPromptForMissing = !isFullyNonInteractive

  return {
    isFullyInteractive,
    isFullyNonInteractive,
    shouldPromptForMissing,
    shouldPromptForModeSelection,
    shouldShowIntro
  }
}

// ============================================================================
// Mode-Specific Prompt Requirements
// ============================================================================

/** Determines if a mode requires prompting based on missing stop positions */
export const getModePromptRequirement = (mode: ExecutionMode, stopOpt: O.Option<number>): boolean =>
  pipe(
    Match.value(mode),
    Match.tag("SinglePalette", () => O.isNone(stopOpt)),
    Match.tag("SingleTransform", (m) => m.input.stop === undefined),
    Match.tag("ManyTransform", (m) => m.stop === undefined),
    Match.tag("BatchTransform", (m) => m.transformations.some((t) => t.stop === undefined)),
    Match.tag("BatchPalettes", () => false),
    Match.exhaustive
  )
