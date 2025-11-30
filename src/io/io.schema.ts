/**
 * I/O schemas
 *
 * Provides type-safe schemas for I/O operations:
 * - File system path types with validation
 * - Export targets and configuration
 * - Batch input modes and parsing
 */

import { Array as Arr, Either, Schema } from "effect"

// ============================================================================
// Constants
// ============================================================================

/** Valid extensions for JSON export files */
const JSON_EXTENSIONS = [".json", ".JSON"] as const

// ============================================================================
// Validation Helpers
// ============================================================================

/** Check if path contains null bytes (invalid in file systems) */
const hasNullBytes = (path: string): boolean => path.includes("\0")

/** Check if path has surrounding whitespace */
const hasSurroundingWhitespace = (path: string): boolean => path.trim() !== path

/** Validate file path does not contain invalid characters */
export const isValidFilePath = (path: string): boolean => !hasNullBytes(path) && !hasSurroundingWhitespace(path)

/** Check if path ends with a valid JSON extension */
const hasJsonExtension = (path: string): boolean => Arr.some(JSON_EXTENSIONS, (ext) => path.endsWith(ext))

/** Check if input is not whitespace-only */
const isNotWhitespaceOnly = (input: string): boolean => input.trim().length > 0

// ============================================================================
// File Path Schemas
// ============================================================================

/**
 * Absolute file path with validation
 *
 * Validates that:
 * - Path is non-empty
 * - Contains no null bytes
 * - Has no surrounding whitespace
 */
export const FilePathSchema = Schema.String.pipe(
  Schema.nonEmptyString({ message: () => "File path cannot be empty" }),
  Schema.filter(isValidFilePath, {
    message: () => "Invalid file path: must not contain null bytes or leading/trailing whitespace"
  }),
  Schema.brand("FilePath"),
  Schema.annotations({
    identifier: "FilePath",
    description: "Absolute file path"
  })
)

export type FilePath = typeof FilePathSchema.Type
export const FilePath = Schema.decodeUnknown(FilePathSchema)

/**
 * Directory path (branded FilePath)
 *
 * Same validation as FilePath but semantically indicates a directory.
 */
export const DirectoryPathSchema = FilePathSchema.pipe(
  Schema.brand("DirectoryPath"),
  Schema.annotations({
    identifier: "DirectoryPath",
    description: "Absolute directory path"
  })
)

export type DirectoryPath = typeof DirectoryPathSchema.Type
export const DirectoryPath = Schema.decodeUnknown(DirectoryPathSchema)

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

export type JSONPath = typeof JSONPathSchema.Type
export const JSONPath = Schema.decodeUnknown(JSONPathSchema)
export const JSONPathSync = Schema.decodeSync(JSONPathSchema)

// ============================================================================
// Type Guards
// ============================================================================

/** Type guard for JSONPath */
export const isValidJSONPath = (path: string): path is JSONPath =>
  Either.isRight(Schema.decodeUnknownEither(JSONPathSchema)(path))

// ============================================================================
// Export Schemas
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

// ============================================================================
// Batch Input Schemas
// ============================================================================

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
