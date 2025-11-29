/**
 * Configuration service for application-wide settings
 *
 * Loads config from environment variables with validation.
 * Defaults defined in src/config/defaults.ts
 */

import { Config, Effect, Either, Schema } from "effect"
import {
  ENV_DEFAULT_BATCH_NAME,
  ENV_DEFAULT_OUTPUT_FORMAT,
  ENV_DEFAULT_PALETTE_NAME,
  ENV_PATTERN_SOURCE
} from "../config/constants.js"
import { CONFIG_DEFAULTS } from "../config/defaults.js"
import type { ColorSpace } from "../domain/color/color.schema.js"
import { ColorSpaceSchema } from "../domain/color/color.schema.js"
import { FilePathSchema } from "./PatternService/filesystem.schema.js"
import type { FilePath as FilePathType } from "./PatternService/filesystem.schema.js"

// ============================================================================
// Types
// ============================================================================

/**
 * Application configuration
 */
export interface AppConfig {
  readonly patternSource: FilePathType
  readonly defaultOutputFormat: ColorSpace
  readonly defaultPaletteName: string
  readonly defaultBatchName: string
}

// ============================================================================
// Config Definitions
// ============================================================================

const createSchemaValidator = <A, I>(schema: Schema.Schema<A, I>) => (value: unknown): value is A =>
  Either.isRight(Schema.decodeUnknownEither(schema)(value))

/**
 * Pattern source file path with validation
 */
const patternSourceConfig: Config.Config<FilePathType> = Config.string(
  ENV_PATTERN_SOURCE
).pipe(
  Config.withDefault(CONFIG_DEFAULTS.production.patternSource),
  Config.validate({
    message: "Invalid file path: contains invalid characters or whitespace",
    validation: createSchemaValidator(FilePathSchema)
  })
)

/**
 * Default output format with color space validation
 */
const defaultOutputFormatConfig: Config.Config<ColorSpace> = Config.string(
  ENV_DEFAULT_OUTPUT_FORMAT
).pipe(
  Config.withDefault(CONFIG_DEFAULTS.production.defaultOutputFormat),
  Config.validate({
    message: "Invalid color space. Must be one of: hex, rgb, oklch, oklab",
    validation: createSchemaValidator(ColorSpaceSchema)
  })
)

/**
 * Default palette name
 */
const defaultPaletteNameConfig: Config.Config<string> = Config.string(
  ENV_DEFAULT_PALETTE_NAME
).pipe(Config.withDefault(CONFIG_DEFAULTS.production.defaultPaletteName))

/**
 * Default batch name
 */
const defaultBatchNameConfig: Config.Config<string> = Config.string(
  ENV_DEFAULT_BATCH_NAME
).pipe(Config.withDefault(CONFIG_DEFAULTS.production.defaultBatchName))

/**
 * Combined application config
 */
const appConfigConfig: Config.Config<AppConfig> = Config.all({
  patternSource: patternSourceConfig,
  defaultOutputFormat: defaultOutputFormatConfig,
  defaultPaletteName: defaultPaletteNameConfig,
  defaultBatchName: defaultBatchNameConfig
})

// ============================================================================
// Service
// ============================================================================

/**
 * Configuration service using Effect.Service pattern
 *
 * Loads and validates config from environment variables at initialization.
 */
export class ConfigService extends Effect.Service<ConfigService>()(
  "ConfigService",
  {
    effect: Effect.gen(function*() {
      const config = yield* appConfigConfig

      return {
        getConfig: (): Effect.Effect<AppConfig> => Effect.succeed(config),
        getPatternSource: (): Effect.Effect<FilePathType> => Effect.succeed(config.patternSource)
      }
    })
  }
) {
  /**
   * Test layer with fixed configuration
   *
   * Note: .Default provides a Layer that is lazily evaluated when provided,
   * so Schema.decode errors only surface when the layer is actually used in tests.
   */
  static readonly Test = Effect.Service<ConfigService>()("ConfigService", {
    effect: Effect.gen(function*() {
      const patternSource = yield* Schema.decode(FilePathSchema)(
        CONFIG_DEFAULTS.test.patternSource
      )
      const testConfig: AppConfig = {
        patternSource,
        defaultOutputFormat: CONFIG_DEFAULTS.test.defaultOutputFormat,
        defaultPaletteName: CONFIG_DEFAULTS.test.defaultPaletteName,
        defaultBatchName: CONFIG_DEFAULTS.test.defaultBatchName
      }
      return {
        getConfig: (): Effect.Effect<AppConfig> => Effect.succeed(testConfig),
        getPatternSource: (): Effect.Effect<FilePathType> => Effect.succeed(patternSource)
      }
    })
  }).Default
}
