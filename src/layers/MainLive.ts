/**
 * Main application layer composition
 *
 * Composes all services with their production dependencies.
 * Each service gets its dependencies provided, then all are merged.
 */

import { NodeContext } from "@effect/platform-node"
import { Layer } from "effect"
import { ConfigService } from "../services/ConfigService.js"
import { ExportService } from "../services/ExportService/index.js"
import { PaletteService } from "../services/PaletteService/index.js"
import { PatternService } from "../services/PatternService/index.js"

/**
 * Main production layer with all services and platform dependencies
 *
 * Layer composition:
 * 1. ConfigService - no dependencies
 * 2. PatternService - needs NodeContext (FileSystem, Path)
 * 3. ExportService - needs NodeContext (FileSystem, Path)
 * 4. PaletteService - needs PatternService, ConfigService
 */
export const MainLive = Layer.mergeAll(
  ConfigService.Default,
  PatternService.Default,
  ExportService.Default,
  PaletteService.Default,
  NodeContext.layer
)
