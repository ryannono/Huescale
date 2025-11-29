/**
 * Single source of truth for all configuration defaults
 *
 * This file contains both production and test defaults in one place,
 * making it easy to see and modify configuration for any environment.
 *
 * To change production config: edit CONFIG_DEFAULTS.production
 * To change test config: edit CONFIG_DEFAULTS.test
 */

import type { ColorSpace } from "../domain/color/color.schema.js"
import {
  DEFAULT_BATCH_NAME,
  DEFAULT_OUTPUT_FORMAT,
  DEFAULT_PALETTE_NAME,
  DEFAULT_PATTERN_PATH,
  TEST_FIXTURE_PALETTE
} from "./constants.js"

// ============================================================================
// Types
// ============================================================================

export interface ConfigDefaults {
  readonly defaultBatchName: string
  readonly defaultOutputFormat: ColorSpace
  readonly defaultPaletteName: string
  readonly patternSource: string
}

// ============================================================================
// Public API
// ============================================================================

/**
 * All configuration defaults for production and test environments
 *
 * This is the single source of truth for all config values.
 * Production config is used when running the CLI normally.
 * Test config provides predictable, isolated testing.
 */
export const CONFIG_DEFAULTS = {
  production: {
    defaultBatchName: DEFAULT_BATCH_NAME,
    defaultOutputFormat: DEFAULT_OUTPUT_FORMAT,
    defaultPaletteName: DEFAULT_PALETTE_NAME,
    patternSource: DEFAULT_PATTERN_PATH
  } as const,

  test: {
    defaultBatchName: DEFAULT_BATCH_NAME,
    defaultOutputFormat: DEFAULT_OUTPUT_FORMAT,
    defaultPaletteName: DEFAULT_PALETTE_NAME,
    patternSource: TEST_FIXTURE_PALETTE
  } as const
} as const satisfies {
  readonly production: ConfigDefaults
  readonly test: ConfigDefaults
}
