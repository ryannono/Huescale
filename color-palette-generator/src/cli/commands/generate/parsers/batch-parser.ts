/**
 * Batch input parsing utilities
 */

import { Effect, Schema } from "effect"
import { ParseError } from "effect/ParseResult"
import { ColorStringSchema } from "../../../../schemas/color.js"
import { StopPositionSchema } from "../../../../schemas/palette.js"

/**
 * Parsed color/stop pair from user input
 */
export const ParsedPairSchema = Schema.Struct({
  color: ColorStringSchema,
  stop: Schema.optional(StopPositionSchema),
  raw: Schema.String
}).pipe(
  Schema.annotations({
    identifier: "ParsedPair",
    description: "Parsed color/stop pair from user input"
  })
)

export const ParsedPair = Schema.decodeUnknown(ParsedPairSchema)
export type ParsedPair = typeof ParsedPairSchema.Type

/**
 * Parse a single color/stop pair string
 *
 * Supports formats:
 * - color::stop  → "#2D72D2::500"
 * - color:stop   → "#2D72D2:500"
 * - color stop   → "#2D72D2 500"
 * - color        → "#2D72D2" (stop is undefined)
 *
 * @param input - Raw input string for a single pair
 * @returns Effect with parsed pair or parse error
 */
export const parseBatchPairString = (
  input: string
): Effect.Effect<ParsedPair, ParseError> => {
  const trimmed = input.trim()

  // Try double colon separator first
  if (trimmed.includes("::")) {
    const [colorStr, stopStr] = trimmed.split("::")
    const color = colorStr?.trim() ?? ""
    const stopNum = stopStr ? parseInt(stopStr.trim(), 10) : undefined

    return ParsedPair({
      color,
      stop: stopNum,
      raw: trimmed
    })
  }

  // Try single colon separator
  if (trimmed.includes(":")) {
    const [colorStr, stopStr] = trimmed.split(":")
    const color = colorStr?.trim() ?? ""
    const stopNum = stopStr ? parseInt(stopStr.trim(), 10) : undefined

    return ParsedPair({
      color,
      stop: stopNum,
      raw: trimmed
    })
  }

  // Try space separator
  const parts = trimmed.split(/\s+/)
  if (parts.length === 2) {
    const [colorStr, stopStr] = parts
    const color = colorStr?.trim() ?? ""
    const stopNum = stopStr ? parseInt(stopStr.trim(), 10) : undefined

    return ParsedPair({
      color,
      stop: stopNum,
      raw: trimmed
    })
  }

  // No separator - just color
  return ParsedPair({
    color: trimmed,
    stop: undefined,
    raw: trimmed
  })
}

/**
 * Parse multiple color/stop pairs from user input
 *
 * Supports:
 * - Newline-separated pairs
 * - Comma-separated pairs
 * - Mixed separators
 *
 * @param input - Raw multi-line or comma-separated input
 * @returns Effect with array of parsed pairs or parse error
 */
export const parseBatchPairsInput = (
  input: string
): Effect.Effect<Array<ParsedPair>, ParseError> => {
  // Split by newlines first, then by commas
  const lines = input
    .split(/\n/)
    .flatMap((line) => line.split(/,/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  // Parse each line
  return Effect.all(
    lines.map(parseBatchPairString),
    { concurrency: "unbounded" }
  )
}

/**
 * Get pairs that are missing stop positions
 */
export const getPairsWithMissingStops = (
  pairs: Array<ParsedPair>
): Array<ParsedPair> => {
  return pairs.filter((p) => p.stop === undefined)
}

/**
 * Get pairs that have stop positions
 */
export const getPairsWithStops = (
  pairs: Array<ParsedPair>
): Array<ParsedPair> => {
  return pairs.filter((p) => p.stop !== undefined)
}

/**
 * Update a parsed pair with a stop position
 */
export const setPairStop = (
  pair: ParsedPair,
  stop: number
): Effect.Effect<ParsedPair, ParseError> => {
  return ParsedPair({
    ...pair,
    stop
  })
}
