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
import { ColorError } from "../../../../domain/color/color.js"
import type {
  PartialTransformationBatch,
  PartialTransformationRequest,
  TransformationBatch,
  TransformationRequest
} from "../../../schemas/transformation.schema.js"
import {
  PartialTransformationBatch as PartialTransformationBatchDecoder,
  PartialTransformationRequest as PartialTransformationRequestDecoder,
  TransformationBatch as TransformationBatchDecoder,
  TransformationRequest as TransformationRequestDecoder
} from "../../../schemas/transformation.schema.js"

/**
 * Parse a single transformation string: ref>target::stop
 *
 * Supports formats:
 * - ref>target::stop → "2D72D2>238551::500"
 * - ref>target:stop  → "2D72D2>238551:500"
 * - ref>target stop  → "2D72D2>238551 500"
 * - ref>target       → "2D72D2>238551" (partial, stop will be prompted for)
 *
 * @param input - Raw transformation string
 * @returns Effect with parsed transformation or parse error
 */
export const parseTransformationString = (
  input: string
): Effect.Effect<
  TransformationRequest | PartialTransformationRequest,
  ColorError | ParseError
> =>
  Effect.gen(function*() {
    const trimmed = input.trim()

    // Check for > operator
    if (!trimmed.includes(">")) {
      return yield* Effect.fail(
        new ColorError({
          message: `Transformation syntax requires '>' operator (e.g., 'ref>target::stop'): ${trimmed}`
        })
      )
    }

    // Split by > to get reference and target+stop
    const [refPart, targetPart] = trimmed.split(">")
    const reference = refPart?.trim() ?? ""

    if (!reference || !targetPart) {
      return yield* Effect.fail(
        new ColorError({
          message: `Invalid transformation syntax: both reference and target are required: ${trimmed}`
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
        new ColorError({
          message: `Invalid transformation syntax: target color is required: ${trimmed}`
        })
      )
    }

    if (!stopStr) {
      // Return partial transformation (stop will be prompted for)
      return yield* PartialTransformationRequestDecoder({
        reference,
        target
      })
    }

    const stop = parseInt(stopStr, 10)

    // Validate with schema
    return yield* TransformationRequestDecoder({
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
): Effect.Effect<
  TransformationBatch | PartialTransformationBatch,
  ColorError | ParseError
> =>
  Effect.gen(function*() {
    const trimmed = input.trim()

    // Check for > operator and parentheses
    if (
      !trimmed.includes(">") ||
      !trimmed.includes("(") ||
      !trimmed.includes(")")
    ) {
      return yield* Effect.fail(
        new ColorError({
          message: `One-to-many syntax requires '>(...)'  (e.g., 'ref>(t1,t2)::stop'): ${trimmed}`
        })
      )
    }

    // Split by > to get reference and targets+stop
    const [refPart, rest] = trimmed.split(">")
    const reference = refPart?.trim() ?? ""

    if (!reference || !rest) {
      return yield* Effect.fail(
        new ColorError({
          message: `Invalid transformation syntax: reference is required: ${trimmed}`
        })
      )
    }

    // Extract targets from parentheses
    const parenStart = rest.indexOf("(")
    const parenEnd = rest.indexOf(")")

    if (parenStart === -1 || parenEnd === -1 || parenEnd <= parenStart) {
      return yield* Effect.fail(
        new ColorError({
          message: `Invalid parentheses in one-to-many syntax: ${trimmed}`
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
        new ColorError({
          message: `At least one target color is required in parentheses: ${trimmed}`
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
      // Return partial transformation batch (stop will be prompted for)
      return yield* PartialTransformationBatchDecoder({
        reference,
        targets
      })
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
  return (
    trimmed.includes(">") && trimmed.includes("(") && trimmed.includes(")")
  )
}

/**
 * Parse any transformation input (auto-detects format)
 *
 * @param input - Raw transformation string
 * @returns Effect with parsed transformation (single or batch)
 */
export const parseAnyTransformation = (
  input: string
): Effect.Effect<
  | TransformationRequest
  | TransformationBatch
  | PartialTransformationRequest
  | PartialTransformationBatch,
  ColorError | ParseError
> =>
  Effect.gen(function*() {
    if (isOneToManyTransformation(input)) {
      return yield* parseOneToManyTransformation(input)
    } else {
      return yield* parseTransformationString(input)
    }
  })

/**
 * Split by commas that are outside of parentheses
 */
const splitByCommaOutsideParens = (input: string): Array<string> => {
  const results: Array<string> = []
  let current = ""
  let parenDepth = 0

  for (const char of input) {
    if (char === "(") {
      parenDepth++
      current += char
    } else if (char === ")") {
      parenDepth--
      current += char
    } else if (char === "," && parenDepth === 0) {
      // Comma outside parentheses - split here
      if (current.trim().length > 0) {
        results.push(current.trim())
      }
      current = ""
    } else {
      current += char
    }
  }

  // Add the last segment
  if (current.trim().length > 0) {
    results.push(current.trim())
  }

  return results
}

/**
 * Parse multiple transformation inputs (batch mode)
 *
 * Supports:
 * - Newline-separated transformations
 * - Comma-separated transformations (respecting parentheses)
 * - Mixed single and one-to-many transformations
 *
 * @param input - Raw multi-line input
 * @returns Effect with array of parsed transformations
 */
export const parseBatchTransformations = (
  input: string
): Effect.Effect<
  Array<TransformationRequest | TransformationBatch | PartialTransformationRequest | PartialTransformationBatch>,
  ColorError | ParseError
> => {
  // Split by newlines first
  const lines = input
    .split(/\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  // For each line, split by commas that are outside parentheses
  const allInputs = lines.flatMap((line) => splitByCommaOutsideParens(line))

  // Parse each input
  return Effect.all(allInputs.map(parseAnyTransformation), {
    concurrency: "unbounded"
  })
}
