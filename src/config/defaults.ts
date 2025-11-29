/**
 * Single source of truth for all configuration defaults
 *
 * This file contains both production and test defaults in one place,
 * making it easy to see and modify configuration for any environment.
 *
 * To change production config: edit CONFIG_DEFAULTS.production
 * To change test config: edit CONFIG_DEFAULTS.test
 */

import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { ColorSpace } from "../domain/color/color.schema.js"
import {
  DEFAULT_BATCH_NAME,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_OUTPUT_FORMAT,
  DEFAULT_PALETTE_NAME,
  DEFAULT_PATTERN_FILE,
  PATTERNS_DIR,
  TEST_FIXTURE_PALETTE
} from "./constants.js"

// ============================================================================
// Types
// ============================================================================

export interface ConfigDefaults {
  readonly defaultBatchName: string
  readonly defaultOutputFormat: ColorSpace
  readonly defaultPaletteName: string
  readonly maxConcurrency: number
  readonly patternSource: string
}

// ============================================================================
// Internal Helpers
// ============================================================================

/** Find package root by recursively checking for patterns/ directory */
const findPackageRoot = (startPath: string, maxLevels = 5): string => {
  if (maxLevels === 0) return startPath

  const testPath = join(startPath, PATTERNS_DIR, DEFAULT_PATTERN_FILE)
  return existsSync(testPath) ? startPath : findPackageRoot(dirname(startPath), maxLevels - 1)
}

/** Package root directory (works for both src/ and build/esm/) */
const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)))

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
    maxConcurrency: DEFAULT_MAX_CONCURRENCY,
    patternSource: join(packageRoot, PATTERNS_DIR, DEFAULT_PATTERN_FILE)
  } as const,

  test: {
    defaultBatchName: DEFAULT_BATCH_NAME,
    defaultOutputFormat: DEFAULT_OUTPUT_FORMAT,
    defaultPaletteName: DEFAULT_PALETTE_NAME,
    maxConcurrency: DEFAULT_MAX_CONCURRENCY,
    patternSource: TEST_FIXTURE_PALETTE
  } as const
} as const satisfies {
  readonly production: ConfigDefaults
  readonly test: ConfigDefaults
}
