/**
 * Branded types for file system paths
 *
 * Provides type-safe file and directory path types with validation.
 */

import { Schema } from "effect"

// ============================================================================
// Validation Helpers
// ============================================================================

/** Check if path contains null bytes (invalid in file systems) */
const hasNullBytes = (path: string): boolean => path.includes("\0")

/** Check if path has surrounding whitespace */
const hasSurroundingWhitespace = (path: string): boolean => path.trim() !== path

/** Validate file path does not contain invalid characters */
const isValidFilePath = (path: string): boolean => !hasNullBytes(path) && !hasSurroundingWhitespace(path)

// ============================================================================
// Schemas
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
