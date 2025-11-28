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

/**
 * Find package root by checking for patterns/ directory
 *
 * Recursively searches up to maxLevels to find the package root
 */
const findPackageRoot = (startPath: string, maxLevels = 5): string => {
  if (maxLevels === 0) return startPath

  const testPath = join(startPath, "patterns", "default.json")
  return existsSync(testPath) ? startPath : findPackageRoot(dirname(startPath), maxLevels - 1)
}

// Get the package root directory
// This works for both development (src/) and production (build/esm/)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = findPackageRoot(__dirname)

/**
 * Configuration structure
 */
export interface ConfigDefaults {
  readonly patternSource: string
  readonly defaultOutputFormat: ColorSpace
  readonly defaultPaletteName: string
  readonly maxConcurrency: number
}

/**
 * All configuration defaults for production and test environments
 *
 * This is the single source of truth for all config values.
 */
export const CONFIG_DEFAULTS = {
  /**
   * Production configuration
   *
   * Used when running the CLI in production/normal mode
   */
  production: {
    patternSource: join(packageRoot, "patterns", "default.json"),
    defaultOutputFormat: "hex" as const,
    defaultPaletteName: "generated",
    maxConcurrency: 3
  } as const,

  /**
   * Test configuration
   *
   * Used in test environments for predictable, isolated testing
   */
  test: {
    patternSource: "test/fixtures/valid-palettes/example-orange.json",
    defaultOutputFormat: "hex" as const,
    defaultPaletteName: "generated",
    maxConcurrency: 3
  } as const
} as const satisfies {
  readonly production: ConfigDefaults
  readonly test: ConfigDefaults
}
