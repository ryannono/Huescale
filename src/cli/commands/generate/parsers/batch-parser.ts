/**
 * Batch input parsing utilities for color/stop pairs.
 */

import { Array as Arr, Effect, Option, Schema } from "effect"
import { ParseError } from "effect/ParseResult"
import { ColorStringSchema } from "../../../../domain/color/color.schema.js"
import { StopPositionSchema } from "../../../../domain/palette/palette.schema.js"

// ============================================================================
// Types
// ============================================================================

/** Parsed color/stop pair from user input. */
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

// ============================================================================
// Constants
// ============================================================================

const WHITESPACE_SEPARATOR = /\s+/
const NEWLINE_SEPARATOR = /\n/
const COMMA_SEPARATOR = /,/
const SEPARATOR_PATTERNS: ReadonlyArray<string | RegExp> = ["::", ":", WHITESPACE_SEPARATOR]
const EMPTY_INPUT_ERROR = "No valid pairs found in input"

type SeparatorPattern = string | RegExp

// ============================================================================
// Internal Helpers
// ============================================================================

const splitBySeparator = (
  input: string,
  separator: SeparatorPattern
): Option.Option<readonly [string, string]> => {
  if (typeof separator === "string") {
    if (!input.includes(separator)) return Option.none()
    const idx = input.indexOf(separator)
    return Option.some([
      input.slice(0, idx).trim(),
      input.slice(idx + separator.length).trim()
    ])
  }

  const parts = input.split(separator)
  return parts.length === 2
    ? Option.some([parts[0].trim(), parts[1].trim()])
    : Option.none()
}

const parseStop = (stopStr: string): number | undefined => {
  const parsed = parseInt(stopStr, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

const buildParsedPair = (
  color: string,
  stopStr: string | undefined,
  raw: string
): Effect.Effect<ParsedPair, ParseError> =>
  ParsedPair({
    color,
    stop: stopStr ? parseStop(stopStr) : undefined,
    raw
  })

const tryParseBySeparator = (
  input: string,
  separator: SeparatorPattern
): Option.Option<Effect.Effect<ParsedPair, ParseError>> =>
  Option.map(splitBySeparator(input, separator), ([color, stop]) => buildParsedPair(color, stop, input))

const hasMissingStop = (pair: ParsedPair): boolean => pair.stop === undefined

const hasStop = (pair: ParsedPair): boolean => pair.stop !== undefined

// ============================================================================
// Public API
// ============================================================================

/** Parse a single color/stop pair string (supports ::, :, and space separators). */
export const parseBatchPairString = (
  input: string
): Effect.Effect<ParsedPair, ParseError> => {
  const trimmed = input.trim()

  const parseAttempts = SEPARATOR_PATTERNS.map((sep) => tryParseBySeparator(trimmed, sep))

  const firstMatch = parseAttempts.reduce(
    (acc, attempt) => (Option.isSome(acc) ? acc : attempt),
    Option.none<Effect.Effect<ParsedPair, ParseError>>()
  )

  return Option.getOrElse(firstMatch, () => buildParsedPair(trimmed, undefined, trimmed))
}

/** Parse multiple color/stop pairs from newline or comma-separated input. */
export const parseBatchPairsInput = (
  input: string
): Effect.Effect<Arr.NonEmptyReadonlyArray<ParsedPair>, ParseError> => {
  const lines = input
    .split(NEWLINE_SEPARATOR)
    .flatMap((line) => line.split(COMMA_SEPARATOR))
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  return Effect.flatMap(
    Effect.all(lines.map(parseBatchPairString), { concurrency: "unbounded" }),
    (pairs) =>
      Arr.isNonEmptyReadonlyArray(pairs)
        ? Effect.succeed(pairs)
        : Effect.fail(
          new ParseError({
            issue: {
              _tag: "Type",
              ast: ParsedPairSchema.ast,
              actual: pairs,
              message: EMPTY_INPUT_ERROR
            }
          })
        )
  )
}

/** Get pairs that are missing stop positions. */
export const getPairsWithMissingStops = (
  pairs: ReadonlyArray<ParsedPair>
): ReadonlyArray<ParsedPair> => pairs.filter(hasMissingStop)

/** Get pairs that have stop positions. */
export const getPairsWithStops = (
  pairs: ReadonlyArray<ParsedPair>
): ReadonlyArray<ParsedPair> => pairs.filter(hasStop)

/** Create a new parsed pair with a specific stop position. */
export const setPairStop = (
  pair: ParsedPair,
  stop: number
): Effect.Effect<ParsedPair, ParseError> =>
  ParsedPair({
    ...pair,
    stop
  })
