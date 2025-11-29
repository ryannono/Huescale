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
// Validation Helpers
// ============================================================================

/** Check if path contains null bytes (invalid in file systems) */
const hasNullBytes = (path: string): boolean => path.includes("\0")

/** Check if path has surrounding whitespace */
const hasSurroundingWhitespace = (path: string): boolean => path.trim() !== path

/** Validate file path does not contain invalid characters */
const isValidFilePath = (path: string): boolean => !hasNullBytes(path) && !hasSurroundingWhitespace(path)

/** Check if path ends with .json or .JSON extension */
const hasJsonExtension = (path: string): boolean => [".json", ".JSON"].some((ext) => path.endsWith(ext))

/** Check if input is not whitespace-only */
const isNotWhitespaceOnly = (input: string): boolean => input.trim().length > 0

// ============================================================================
// Component Schemas
// ============================================================================

/**
 * Export target schema - where to export palette results
 */
export const ExportTargetSchema = Schema.Literal("none", "clipboard", "json").pipe(
  Schema.annotations({
    identifier: "ExportTarget",
    description: "Export destination for palette results"
  })
)

export type ExportTarget = typeof ExportTargetSchema.Type

export const ExportTarget = Schema.decodeUnknown(ExportTargetSchema)

/**
 * Batch input mode schema - how to generate multiple palettes
 */
export const BatchInputModeSchema = Schema.Literal("paste", "cycle", "transform").pipe(
  Schema.annotations({
    identifier: "BatchInputMode",
    description: "Method for generating multiple palettes"
  })
)

export type BatchInputMode = typeof BatchInputModeSchema.Type

export const BatchInputMode = Schema.decodeUnknown(BatchInputModeSchema)

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
  Schema.nonEmptyString({ message: () => "JSON file path cannot be empty" }),
  Schema.filter(isValidFilePath, {
    message: () => "Invalid file path: must not contain null bytes or leading/trailing whitespace"
  }),
  Schema.filter(hasJsonExtension, {
    message: () => "File must have .json extension"
  }),
  Schema.brand("JSONPath"),
  Schema.annotations({
    identifier: "JSONPath",
    description: "File path for JSON export with .json extension"
  })
)

export const JSONPathSync = Schema.decodeSync(JSONPathSchema)
export const JSONPath = Schema.decodeUnknown(JSONPathSchema)
export type JSONPath = typeof JSONPathSchema.Type

/**
 * Batch paste input schema
 *
 * Validates multi-line or comma-separated color/stop pairs input
 */
export const BatchPasteInputSchema = Schema.String.pipe(
  Schema.nonEmptyString({ message: () => "Batch input cannot be empty" }),
  Schema.filter(isNotWhitespaceOnly, {
    message: () => "Batch input cannot be whitespace only"
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
// Type Guards
// ============================================================================

/** Type guard for JSONPath */
export const isValidJSONPath = (path: string): path is JSONPath =>
  Either.isRight(Schema.decodeUnknownEither(JSONPathSchema)(path))

// ============================================================================
// Schemas
// ============================================================================

/**
 * Export configuration schema
 */
export const ExportConfigSchema = Schema.Struct({
  target: ExportTargetSchema,
  jsonPath: Schema.optional(JSONPathSchema)
}).pipe(
  Schema.annotations({
    identifier: "ExportConfig",
    description: "Configuration for exporting palette results"
  })
)

export type ExportConfig = typeof ExportConfigSchema.Type

export const ExportConfig = Schema.decodeUnknown(ExportConfigSchema)
