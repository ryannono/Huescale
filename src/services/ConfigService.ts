/**
 * Configuration service for application-wide settings
 *
 * Provides centralized configuration including:
 * - Pattern source paths
 * - Default output formats
 * - Default palette names
 *
 * Configuration can be overridden via environment variables:
 * - PATTERN_SOURCE: Custom pattern file path
 */

import { Effect } from "effect"
import type { ColorSpace } from "../schemas/color.js"

/**
 * Application configuration
 */
export interface AppConfig {
  readonly patternSource: string
  readonly defaultOutputFormat: ColorSpace
  readonly defaultPaletteName: string
}

/**
 * Configuration service using Effect.Service pattern
 *
 * @example
 * ```typescript
 * Effect.gen(function*() {
 *   const config = yield* ConfigService
 *   const appConfig = yield* config.getConfig()
 *   console.log(appConfig.patternSource)
 * }).pipe(Effect.provide(ConfigService.Default))
 * ```
 */
export class ConfigService extends Effect.Service<ConfigService>()("ConfigService", {
  effect: Effect.succeed({
    /**
     * Get complete application configuration
     */
    getConfig: (): Effect.Effect<AppConfig> =>
      Effect.succeed({
        patternSource: process.env.PATTERN_SOURCE ?? "test/fixtures/valid-palettes/example-orange.json",
        defaultOutputFormat: "hex" as const,
        defaultPaletteName: "generated"
      }),

    /**
     * Get pattern source path
     * Convenience method for accessing just the pattern source
     */
    getPatternSource: (): Effect.Effect<string> =>
      Effect.gen(function*() {
        const config = yield* Effect.succeed({
          patternSource: process.env.PATTERN_SOURCE ?? "test/fixtures/valid-palettes/example-orange.json",
          defaultOutputFormat: "hex" as const,
          defaultPaletteName: "generated"
        })
        return config.patternSource
      })
  })
}) {
  /**
   * Test layer with fixed configuration for testing
   *
   * Provides a predictable configuration without relying on environment variables.
   */
  static readonly Test = Effect.Service<ConfigService>()("ConfigService", {
    effect: Effect.succeed({
      getConfig: (): Effect.Effect<AppConfig> =>
        Effect.succeed({
          patternSource: "test/fixtures/valid-palettes/example-orange.json",
          defaultOutputFormat: "hex" as const,
          defaultPaletteName: "generated"
        }),
      getPatternSource: (): Effect.Effect<string> => Effect.succeed("test/fixtures/valid-palettes/example-orange.json")
    })
  }).Default
}
