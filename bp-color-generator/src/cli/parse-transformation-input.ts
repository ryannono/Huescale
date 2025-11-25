/**
 * Transformation input parsing utilities
 *
 * Parses transformation syntax like:
 * - Single: "2D72D2>238551::500"
 * - One-to-many: "2D72D2>(238551,DC143C)::500"
 * - Batch: Multiple lines or comma-separated transformations
 */

import { Effect } from "effect"
import { ParseError } from "effect/ParseResult"
import { TransformationParseError } from "../domain/color/errors.js"
import type { TransformationBatch, TransformationInput } from "../schemas/transformation.js"
import {
  TransformationBatch as TransformationBatchDecoder,
  TransformationInput as TransformationInputDecoder
} from "../schemas/transformation.js"

/**
 * Parse a single transformation string: ref>target::stop
 *
 * Supports formats:
 * - ref>target::stop → "2D72D2>238551::500"
 * - ref>target:stop  → "2D72D2>238551:500"
 * - ref>target stop  → "2D72D2>238551 500"
 *
 * @param input - Raw transformation string
 * @returns Effect with parsed transformation or parse error
 */
export const parseTransformationString = (
  input: string
): Effect.Effect<TransformationInput, TransformationParseError | ParseError> =>
  Effect.gen(function*() {
    const trimmed = input.trim()

    // Check for > operator
    if (!trimmed.includes(">")) {
      return yield* Effect.fail(
        new TransformationParseError({
          input: trimmed,
          reason: "Transformation syntax requires '>' operator (e.g., 'ref>target::stop')"
        })
      )
    }

    // Split by > to get reference and target+stop
    const [refPart, targetPart] = trimmed.split(">")
    const reference = refPart?.trim() ?? ""

    if (!reference || !targetPart) {
      return yield* Effect.fail(
        new TransformationParseError({
          input: trimmed,
          reason: "Invalid transformation syntax: both reference and target are required"
        })
      )
    }

    // Parse target and stop
    // Try double colon separator first
    let target: string
    let stopStr: string | undefined

    if (targetPart.includes("::")) {
      const parts = targetPart.split("::")
      target = parts[0]?.trim() ?? ""
      stopStr = parts[1]?.trim()
    } else if (targetPart.includes(":")) {
      // Try single colon
      const parts = targetPart.split(":")
      target = parts[0]?.trim() ?? ""
      stopStr = parts[1]?.trim()
    } else {
      // Try space separator
      const parts = targetPart.trim().split(/\s+/)
      if (parts.length >= 2) {
        target = parts[0]?.trim() ?? ""
        stopStr = parts[1]?.trim()
      } else {
        target = targetPart.trim()
        stopStr = undefined
      }
    }

    if (!target) {
      return yield* Effect.fail(
        new TransformationParseError({
          input: trimmed,
          reason: "Invalid transformation syntax: target color is required"
        })
      )
    }

    if (!stopStr) {
      return yield* Effect.fail(
        new TransformationParseError({
          input: trimmed,
          reason: "Invalid transformation syntax: stop position is required"
        })
      )
    }

    const stop = parseInt(stopStr, 10)

    // Validate with schema
    return yield* TransformationInputDecoder({
      reference,
      target,
      stop
    })
  })

/**
 * Parse a one-to-many transformation string: ref>(t1,t2,t3)::stop
 *
 * Supports formats:
 * - ref>(t1,t2)::stop → "2D72D2>(238551,DC143C)::500"
 * - ref>(t1,t2):stop  → "2D72D2>(238551,DC143C):500"
 *
 * @param input - Raw transformation string
 * @returns Effect with parsed batch transformation or parse error
 */
export const parseOneToManyTransformation = (
  input: string
): Effect.Effect<TransformationBatch, TransformationParseError | ParseError> =>
  Effect.gen(function*() {
    const trimmed = input.trim()

    // Check for > operator and parentheses
    if (!trimmed.includes(">") || !trimmed.includes("(") || !trimmed.includes(")")) {
      return yield* Effect.fail(
        new TransformationParseError({
          input: trimmed,
          reason: "One-to-many syntax requires '>(...)'  (e.g., 'ref>(t1,t2)::stop')"
        })
      )
    }

    // Split by > to get reference and targets+stop
    const [refPart, rest] = trimmed.split(">")
    const reference = refPart?.trim() ?? ""

    if (!reference || !rest) {
      return yield* Effect.fail(
        new TransformationParseError({
          input: trimmed,
          reason: "Invalid transformation syntax: reference is required"
        })
      )
    }

    // Extract targets from parentheses
    const parenStart = rest.indexOf("(")
    const parenEnd = rest.indexOf(")")

    if (parenStart === -1 || parenEnd === -1 || parenEnd <= parenStart) {
      return yield* Effect.fail(
        new TransformationParseError({
          input: trimmed,
          reason: "Invalid parentheses in one-to-many syntax"
        })
      )
    }

    const targetsStr = rest.substring(parenStart + 1, parenEnd)
    const afterParen = rest.substring(parenEnd + 1)

    // Parse targets (comma-separated)
    const targets = targetsStr
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    if (targets.length === 0) {
      return yield* Effect.fail(
        new TransformationParseError({
          input: trimmed,
          reason: "At least one target color is required in parentheses"
        })
      )
    }

    // Parse stop from what comes after parentheses
    let stopStr: string | undefined

    if (afterParen.includes("::")) {
      stopStr = afterParen.split("::")[1]?.trim()
    } else if (afterParen.includes(":")) {
      stopStr = afterParen.split(":")[1]?.trim()
    } else {
      // Try space separator
      const parts = afterParen.trim().split(/\s+/)
      stopStr = parts.find((p) => /^\d+$/.test(p))
    }

    if (!stopStr) {
      return yield* Effect.fail(
        new TransformationParseError({
          input: trimmed,
          reason: "Stop position is required after targets"
        })
      )
    }

    const stop = parseInt(stopStr, 10)

    // Validate with schema
    return yield* TransformationBatchDecoder({
      reference,
      targets,
      stop
    })
  })

/**
 * Detect if input string is a transformation (contains >)
 */
export const isTransformationSyntax = (input: string): boolean => {
  return input.trim().includes(">")
}

/**
 * Detect if input is one-to-many transformation (has parentheses)
 */
export const isOneToManyTransformation = (input: string): boolean => {
  const trimmed = input.trim()
  return trimmed.includes(">") && trimmed.includes("(") && trimmed.includes(")")
}

/**
 * Parse any transformation input (auto-detects format)
 *
 * @param input - Raw transformation string
 * @returns Effect with parsed transformation (single or batch)
 */
export const parseAnyTransformation = (
  input: string
): Effect.Effect<TransformationInput | TransformationBatch, TransformationParseError | ParseError> =>
  Effect.gen(function*() {
    if (isOneToManyTransformation(input)) {
      return yield* parseOneToManyTransformation(input)
    } else {
      return yield* parseTransformationString(input)
    }
  })

/**
 * Parse multiple transformation inputs (batch mode)
 *
 * Supports:
 * - Newline-separated transformations
 * - Comma-separated transformations (only if no parentheses present)
 * - Mixed single and one-to-many transformations
 *
 * @param input - Raw multi-line input
 * @returns Effect with array of parsed transformations
 */
export const parseBatchTransformations = (
  input: string
): Effect.Effect<Array<TransformationInput | TransformationBatch>, TransformationParseError | ParseError> => {
  // Split by newlines first
  const lines = input
    .split(/\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  // For each line, check if it contains parentheses
  // If not, try splitting by comma (in case multiple transformations on one line)
  const allInputs = lines.flatMap((line) => {
    if (line.includes("(") && line.includes(")")) {
      // One-to-many transformation - don't split by comma
      return [line]
    } else {
      // Could be multiple single transformations separated by comma
      return line.split(/,/).map((s) => s.trim()).filter((s) => s.length > 0)
    }
  })

  // Parse each input
  return Effect.all(
    allInputs.map(parseAnyTransformation),
    { concurrency: "unbounded" }
  )
}
