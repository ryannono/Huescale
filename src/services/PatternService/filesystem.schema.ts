/**
 * Branded types for file system paths
 *
 * Provides type-safe file and directory path types with validation.
 */

import { Schema } from "effect"

/**
 * Absolute file path with validation
 *
 * Validates that:
 * - Path is non-empty
 * - Contains no null bytes
 * - Has no surrounding whitespace
 */
export const FilePathSchema = Schema.String.pipe(
  Schema.nonEmptyString(),
  Schema.filter((path) => {
    if (path.includes("\0")) return false // Null bytes not allowed
    if (path.trim() !== path) return false // No surrounding whitespace
    return true
  }, {
    message: () => "Invalid file path: contains invalid characters or whitespace"
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
 * JSON file path with .json extension validation
 *
 * Ensures the path ends with .json extension.
 */
export const JSONPathSchema = Schema.String.pipe(
  Schema.nonEmptyString(),
  Schema.filter((path) => path.endsWith(".json"), {
    message: () => "JSON path must end with .json extension"
  }),
  Schema.brand("JSONPath"),
  Schema.annotations({
    identifier: "JSONPath",
    description: "File path to JSON file"
  })
)

export type JSONPath = typeof JSONPathSchema.Type
export const JSONPath = Schema.decodeUnknown(JSONPathSchema)
