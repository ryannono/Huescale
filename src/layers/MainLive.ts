/**
 * Main application layer composition
 *
 * Composes all services with their production dependencies.
 * Each service gets its dependencies provided, then all are merged.
 */

import { NodeContext } from "@effect/platform-node"
import { Layer } from "effect"
import { ModeResolver } from "../cli/commands/generate/modes/resolver.js"
import { WorkflowCoordinator } from "../cli/commands/generate/workflows/WorkflowCoordinator.js"
import { ConfigService } from "../services/ConfigService.js"
import { ConsoleService } from "../services/ConsoleService/index.js"
import { PromptService } from "../services/PromptService/index.js"

/**
 * Main production layer with all services and platform dependencies
 *
 * Dependency graph (automatically resolved by Effect):
 *
 *   NodeContext (FileSystem, Path) - platform I/O for pattern loading and exports
 *
 *   ConfigService (configuration defaults, no deps)
 *   ConsoleService (CLI output, no deps)
 *   PromptService (CLI input, no deps)
 *   ModeResolver (CLI mode detection, no deps)
 *   WorkflowCoordinator (CLI workflow orchestration, no deps)
 */
export const MainLive = Layer.mergeAll(
  ConfigService.Default,
  ConsoleService.Default,
  ModeResolver.Default,
  PromptService.Default,
  WorkflowCoordinator.Default,
  NodeContext.layer
)
