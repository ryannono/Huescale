/**
 * Tests for batch input parsing
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  getPairsWithMissingStops,
  getPairsWithStops,
  parseBatchPairsInput,
  parseBatchPairString,
  setPairStop
} from "../../../src/cli/commands/generate/parsers/batch-parser.js"

describe("parseBatchPairString", () => {
  it.effect("should parse color with double colon separator", () =>
    Effect.gen(function*() {
      const result = yield* parseBatchPairString("#2D72D2::500")

      expect(result.color).toBe("#2D72D2")
      expect(result.stop).toBe(500)
      expect(result.raw).toBe("#2D72D2::500")
    }))

  it.effect("should parse color with single colon separator", () =>
    Effect.gen(function*() {
      const result = yield* parseBatchPairString("#2D72D2:500")

      expect(result.color).toBe("#2D72D2")
      expect(result.stop).toBe(500)
      expect(result.raw).toBe("#2D72D2:500")
    }))

  it.effect("should parse color with space separator", () =>
    Effect.gen(function*() {
      const result = yield* parseBatchPairString("#2D72D2 500")

      expect(result.color).toBe("#2D72D2")
      expect(result.stop).toBe(500)
      expect(result.raw).toBe("#2D72D2 500")
    }))

  it.effect("should parse color without stop", () =>
    Effect.gen(function*() {
      const result = yield* parseBatchPairString("#2D72D2")

      expect(result.color).toBe("#2D72D2")
      expect(result.stop).toBeUndefined()
      expect(result.raw).toBe("#2D72D2")
    }))

  it.effect("should handle whitespace", () =>
    Effect.gen(function*() {
      const result = yield* parseBatchPairString("  #2D72D2::500  ")

      expect(result.color).toBe("#2D72D2")
      expect(result.stop).toBe(500)
    }))

  it.effect("should parse color without # prefix", () =>
    Effect.gen(function*() {
      const result = yield* parseBatchPairString("2D72D2::500")

      expect(result.color).toBe("2D72D2")
      expect(result.stop).toBe(500)
    }))
})

describe("parseBatchPairsInput", () => {
  it.effect("should parse newline-separated pairs", () =>
    Effect.gen(function*() {
      const input = "#2D72D2::500\n#DB2C6F::600\n#5C7CFA::400"
      const results = yield* parseBatchPairsInput(input)

      expect(results).toHaveLength(3)
      expect(results[0].color).toBe("#2D72D2")
      expect(results[0].stop).toBe(500)
      expect(results[1].color).toBe("#DB2C6F")
      expect(results[1].stop).toBe(600)
      expect(results[2].color).toBe("#5C7CFA")
      expect(results[2].stop).toBe(400)
    }))

  it.effect("should parse comma-separated pairs", () =>
    Effect.gen(function*() {
      const input = "#2D72D2::500, #DB2C6F::600, #5C7CFA::400"
      const results = yield* parseBatchPairsInput(input)

      expect(results).toHaveLength(3)
      expect(results[0].color).toBe("#2D72D2")
      expect(results[1].color).toBe("#DB2C6F")
      expect(results[2].color).toBe("#5C7CFA")
    }))

  it.effect("should handle mixed separators", () =>
    Effect.gen(function*() {
      const input = "#2D72D2::500\n#DB2C6F::600, #5C7CFA::400"
      const results = yield* parseBatchPairsInput(input)

      expect(results).toHaveLength(3)
    }))

  it.effect("should handle colors with missing stops", () =>
    Effect.gen(function*() {
      const input = "#2D72D2::500\n#DB2C6F\n#5C7CFA::400"
      const results = yield* parseBatchPairsInput(input)

      expect(results).toHaveLength(3)
      expect(results[0].stop).toBe(500)
      expect(results[1].stop).toBeUndefined()
      expect(results[2].stop).toBe(400)
    }))

  it.effect("should filter empty lines", () =>
    Effect.gen(function*() {
      const input = "#2D72D2::500\n\n#DB2C6F::600\n  \n#5C7CFA::400"
      const results = yield* parseBatchPairsInput(input)

      expect(results).toHaveLength(3)
    }))
})

describe("getPairsWithMissingStops", () => {
  it.effect("should filter pairs without stops", () =>
    Effect.gen(function*() {
      const input = "#2D72D2::500\n#DB2C6F\n#5C7CFA::400\n#FF0000"
      const pairs = yield* parseBatchPairsInput(input)
      const missing = getPairsWithMissingStops(pairs)

      expect(missing).toHaveLength(2)
      expect(missing[0].color).toBe("#DB2C6F")
      expect(missing[1].color).toBe("#FF0000")
    }))

  it.effect("should return empty array if all have stops", () =>
    Effect.gen(function*() {
      const input = "#2D72D2::500\n#DB2C6F::600"
      const pairs = yield* parseBatchPairsInput(input)
      const missing = getPairsWithMissingStops(pairs)

      expect(missing).toHaveLength(0)
    }))
})

describe("getPairsWithStops", () => {
  it.effect("should filter pairs with stops", () =>
    Effect.gen(function*() {
      const input = "#2D72D2::500\n#DB2C6F\n#5C7CFA::400"
      const pairs = yield* parseBatchPairsInput(input)
      const withStops = getPairsWithStops(pairs)

      expect(withStops).toHaveLength(2)
      expect(withStops[0].color).toBe("#2D72D2")
      expect(withStops[0].stop).toBe(500)
      expect(withStops[1].color).toBe("#5C7CFA")
      expect(withStops[1].stop).toBe(400)
    }))
})

describe("setPairStop", () => {
  it.effect("should update pair with stop position", () =>
    Effect.gen(function*() {
      const pair = yield* parseBatchPairString("#2D72D2")
      const updated = yield* setPairStop(pair, 500)

      expect(updated.color).toBe("#2D72D2")
      expect(updated.stop).toBe(500)
      expect(updated.raw).toBe("#2D72D2")
    }))

  it.effect("should replace existing stop", () =>
    Effect.gen(function*() {
      const pair = yield* parseBatchPairString("#2D72D2::300")
      const updated = yield* setPairStop(pair, 500)

      expect(updated.color).toBe("#2D72D2")
      expect(updated.stop).toBe(500)
    }))
})
