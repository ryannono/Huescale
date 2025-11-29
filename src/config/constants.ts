/**
 * Application-wide constants
 *
 * Single source of truth for magic strings and constant values used across the application.
 */

import { fileURLToPath } from "node:url"

// ============================================================================
// File Paths
// ============================================================================

/** Default pattern path resolved via package self-reference exports */
export const DEFAULT_PATTERN_PATH = fileURLToPath(
  import.meta.resolve(`oklch-palette-generator/patterns/default.json`)
)

/** Test fixture palette path */
export const TEST_FIXTURE_PALETTE = "test/fixtures/valid-palettes/example-orange.json" as const

/** Patterns directory name */
export const PATTERNS_DIR = "patterns" as const

// ============================================================================
// Default Names
// ============================================================================

/** Default palette name when not specified */
export const DEFAULT_PALETTE_NAME = "generated" as const

/** Default batch name when not specified */
export const DEFAULT_BATCH_NAME = "batch" as const

// ============================================================================
// Color Spaces
// ============================================================================

/** Hexadecimal color format */
export const COLOR_SPACE_HEX = "hex" as const

/** RGB color format */
export const COLOR_SPACE_RGB = "rgb" as const

/** OKLCH color format */
export const COLOR_SPACE_OKLCH = "oklch" as const

/** OKLAB color format */
export const COLOR_SPACE_OKLAB = "oklab" as const

// ============================================================================
// Environment Variable Names
// ============================================================================

/** Environment variable for pattern source path */
export const ENV_PATTERN_SOURCE = "PATTERN_SOURCE" as const

/** Environment variable for default output format */
export const ENV_DEFAULT_OUTPUT_FORMAT = "DEFAULT_OUTPUT_FORMAT" as const

/** Environment variable for default palette name */
export const ENV_DEFAULT_PALETTE_NAME = "DEFAULT_PALETTE_NAME" as const

/** Environment variable for default batch name */
export const ENV_DEFAULT_BATCH_NAME = "DEFAULT_BATCH_NAME" as const

// ============================================================================
// Default Values
// ============================================================================

/** Default output format (hex) */
export const DEFAULT_OUTPUT_FORMAT = COLOR_SPACE_HEX
