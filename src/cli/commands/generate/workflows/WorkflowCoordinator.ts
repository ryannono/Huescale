/**
 * WorkflowCoordinator - Effect.Service for orchestrating CLI workflows.
 *
 * Provides a centralized service for workflow operations like completing partial inputs,
 * validating inputs, and routing to executors.
 */

import { Effect } from "effect"
import { PromptService } from "../../../../services/PromptService/index.js"
import type { BatchPalettesComplete, BatchPalettesPartial } from "../inputSpecs/batchPalettes.input.js"
import type { BatchTransformComplete, BatchTransformPartial } from "../inputSpecs/batchTransform.input.js"
import type { ManyTransformComplete, ManyTransformPartial } from "../inputSpecs/manyTransform.input.js"
import type { SinglePaletteComplete, SinglePalettePartial } from "../inputSpecs/singlePalette.input.js"
import type { SingleTransformComplete, SingleTransformPartial } from "../inputSpecs/singleTransform.input.js"
import { completeBatchPalettesInput } from "./batch.workflow.js"
import { WorkflowCompletionError } from "./shared/error.js"
import { completeSinglePaletteInput } from "./singlePalette.workflow.js"
import {
  completeBatchTransformInput,
  completeManyTransformInput,
  completeSingleTransformInput
} from "./transform.workflow.js"

// ============================================================================
// Service
// ============================================================================

/**
 * WorkflowCoordinator service using Effect.Service pattern.
 *
 * Responsible for completing partial inputs into validated complete inputs.
 * Each mode has a corresponding completion method.
 */
export class WorkflowCoordinator extends Effect.Service<WorkflowCoordinator>()(
  "@oklch-palette-generator/cli/commands/generate/workflows/WorkflowCoordinator",
  {
    effect: Effect.succeed({
      /**
       * Complete a partial SinglePalette input by prompting for missing fields.
       */
      completeSinglePalette: (
        partial: SinglePalettePartial,
        pattern: string
      ): Effect.Effect<SinglePaletteComplete, WorkflowCompletionError, PromptService> =>
        completeSinglePaletteInput(partial, pattern),

      /**
       * Complete a partial BatchPalettes input by prompting for missing fields.
       */
      completeBatchPalettes: (
        partial: BatchPalettesPartial,
        pattern: string,
        defaultName: string
      ): Effect.Effect<BatchPalettesComplete, WorkflowCompletionError, PromptService> =>
        completeBatchPalettesInput(partial, pattern, defaultName),

      /**
       * Complete a partial SingleTransform input by prompting for missing fields.
       */
      completeSingleTransform: (
        partial: SingleTransformPartial,
        pattern: string
      ): Effect.Effect<SingleTransformComplete, WorkflowCompletionError, PromptService> =>
        completeSingleTransformInput(partial, pattern),

      /**
       * Complete a partial ManyTransform input by prompting for missing fields.
       */
      completeManyTransform: (
        partial: ManyTransformPartial,
        pattern: string
      ): Effect.Effect<ManyTransformComplete, WorkflowCompletionError, PromptService> =>
        completeManyTransformInput(partial, pattern),

      /**
       * Complete a partial BatchTransform input by prompting for missing fields.
       */
      completeBatchTransform: (
        partial: BatchTransformPartial,
        pattern: string
      ): Effect.Effect<BatchTransformComplete, WorkflowCompletionError, PromptService> =>
        completeBatchTransformInput(partial, pattern)
    })
  }
) {
  /**
   * Test layer - same as Default since WorkflowCoordinator has no environment-specific behavior
   */
  static readonly Test = WorkflowCoordinator.Default
}
