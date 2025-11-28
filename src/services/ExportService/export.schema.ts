/**
 * Export service schemas
 *
 * Defines validated types for export operations including:
 * - Export targets (none, clipboard, json)
 * - Batch input modes (paste, cycle, transform)
 * - JSON file paths with .json extension validation
 * - Batch paste input parsing
 */

import { Either, Schema } from "effect"

// ============================================================================
// Export Target
// ============================================================================

/**
 * Export target schema - where to export palette results
 */
export const ExportTargetSchema = Schema.Literal("none", "clipboard", "json")

export type ExportTarget = typeof ExportTargetSchema.Type

export const ExportTarget = Schema.decodeUnknown(ExportTargetSchema)

// ============================================================================
// Batch Input Mode
// ============================================================================

/**
 * Batch input mode schema - how to generate multiple palettes
 */
export const BatchInputModeSchema = Schema.Literal("paste", "cycle", "transform")

export type BatchInputMode = typeof BatchInputModeSchema.Type

export const BatchInputMode = Schema.decodeUnknown(BatchInputModeSchema)

// ============================================================================
// JSON Path
// ============================================================================

/**
 * JSON file path schema with validation
 *
 * Validates:
 * - Non-empty string
 * - No null bytes
 * - No leading/trailing whitespace
 * - Must end with .json or .JSON extension
 */
export const JSONPathSchema = Schema.String.pipe(
  Schema.nonEmptyString(),
  Schema.filter((path) => {
    if (path.includes("\0")) return false
    if (path.trim() !== path) return false
    return true
  }, {
    message: () => "Invalid file path"
  }),
  Schema.filter(
    (s) => [".json", ".JSON"].some((ext) => s.endsWith(ext)),
    { message: () => "File extension must be .json" }
  ),
  Schema.brand("JSONPath"),
  Schema.annotations({
    identifier: "JSONPath",
    description: "File path for JSON export"
  })
)

export const JSONPathSync = Schema.decodeSync(JSONPathSchema)
export const JSONPath = Schema.decodeUnknown(JSONPathSchema)
export type JSONPath = typeof JSONPathSchema.Type

/**
 * Type guard for JSONPath
 */
export function isValidJSONPath(path: string): path is JSONPath {
  return Either.match(Schema.decodeUnknownEither(JSONPathSchema)(path), {
    onLeft: () => false,
    onRight: () => true
  })
}

// ============================================================================
// Batch Paste Input
// ============================================================================

/**
 * Batch paste input schema
 *
 * Validates multi-line or comma-separated color/stop pairs input
 */
export const BatchPasteInputSchema = Schema.String.pipe(
  Schema.nonEmptyString(),
  Schema.filter((input) => input.trim().length > 0, {
    message: () => "Batch input cannot be empty"
  }),
  Schema.brand("BatchPasteInput"),
  Schema.annotations({
    identifier: "BatchPasteInput",
    description: "Multi-line or comma-separated color/stop pairs"
  })
)

export type BatchPasteInput = typeof BatchPasteInputSchema.Type

export const BatchPasteInput = Schema.decodeUnknown(BatchPasteInputSchema)

// ============================================================================
// Export Config
// ============================================================================

/**
 * Export configuration schema
 */
export const ExportConfigSchema = Schema.Struct({
  target: ExportTargetSchema,
  jsonPath: Schema.optional(JSONPathSchema)
})

export type ExportConfig = typeof ExportConfigSchema.Type

export const ExportConfig = Schema.decodeUnknown(ExportConfigSchema)
