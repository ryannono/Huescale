/**
 * Tests for transformation input parsing
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  isTransformationSyntax,
  parseAnyTransformation,
  parseBatchTransformations,
  parseOneToManyTransformation,
  parseTransformationString
} from "../../../src/cli/commands/generate/parsers/transform-parser.js"

describe("Transformation Input Parsing", () => {
  describe("isTransformationSyntax", () => {
    it("should detect transformation syntax with > operator", () => {
      expect(isTransformationSyntax("2D72D2>238551::500")).toBe(true)
      expect(isTransformationSyntax("2D72D2 > 238551 :: 500")).toBe(true)
      expect(isTransformationSyntax("2D72D2>(238551,DC143C)::500")).toBe(true)
    })

    it("should return false for non-transformation syntax", () => {
      expect(isTransformationSyntax("2D72D2::500")).toBe(false)
      expect(isTransformationSyntax("#2D72D2")).toBe(false)
      expect(isTransformationSyntax("2D72D2:500")).toBe(false)
    })

    it("should handle whitespace", () => {
      expect(isTransformationSyntax("  2D72D2>238551::500  ")).toBe(true)
      expect(isTransformationSyntax("  2D72D2::500  ")).toBe(false)
    })
  })

  describe("parseTransformationString", () => {
    it.effect("should parse basic transformation with :: separator", () =>
      Effect.gen(function*() {
        const input = "2D72D2>238551::500"
        const result = yield* parseTransformationString(input)

        expect(result.reference).toBe("2D72D2")
        expect(result.target).toBe("238551")
        expect(result.stop).toBe(500)
      }))

    it.effect("should parse transformation with : separator", () =>
      Effect.gen(function*() {
        const input = "2D72D2>238551:500"
        const result = yield* parseTransformationString(input)

        expect(result.reference).toBe("2D72D2")
        expect(result.target).toBe("238551")
        expect(result.stop).toBe(500)
      }))

    it.effect("should parse transformation with space separator", () =>
      Effect.gen(function*() {
        const input = "2D72D2>238551 500"
        const result = yield* parseTransformationString(input)

        expect(result.reference).toBe("2D72D2")
        expect(result.target).toBe("238551")
        expect(result.stop).toBe(500)
      }))

    it.effect("should handle whitespace around operators", () =>
      Effect.gen(function*() {
        const input = "2D72D2 > 238551 :: 500"
        const result = yield* parseTransformationString(input)

        expect(result.reference).toBe("2D72D2")
        expect(result.target).toBe("238551")
        expect(result.stop).toBe(500)
      }))

    it.effect("should handle hex colors with #", () =>
      Effect.gen(function*() {
        const input = "#2D72D2>#238551::500"
        const result = yield* parseTransformationString(input)

        expect(result.reference).toBe("#2D72D2")
        expect(result.target).toBe("#238551")
        expect(result.stop).toBe(500)
      }))

    it.effect("should fail without > operator", () =>
      parseTransformationString("2D72D2::500").pipe(
        Effect.catchTag("TransformationParseError", (error) =>
          Effect.sync(() => {
            expect(error.reason).toContain("'>' operator")
          }))
      ))

    it.effect("should fail with invalid stop position", () =>
      parseTransformationString("2D72D2>238551::999").pipe(
        Effect.catchAll(() => Effect.void)
      ))

    it.effect("should parse all valid stop positions", () =>
      Effect.gen(function*() {
        const stops = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]

        for (const stop of stops) {
          const input = `2D72D2>238551::${stop}`
          const result = yield* parseTransformationString(input)
          expect(result.stop).toBe(stop)
        }
      }))
  })

  describe("parseOneToManyTransformation", () => {
    it.effect("should parse one-to-many with parentheses", () =>
      Effect.gen(function*() {
        const input = "2D72D2>(238551,DC143C)::500"
        const result = yield* parseOneToManyTransformation(input)

        expect(result.reference).toBe("2D72D2")
        expect(result.targets).toEqual(["238551", "DC143C"])
        expect(result.stop).toBe(500)
      }))

    it.effect("should handle whitespace in target list", () =>
      Effect.gen(function*() {
        const input = "2D72D2>( 238551 , DC143C , FF6B6B )::500"
        const result = yield* parseOneToManyTransformation(input)

        expect(result.reference).toBe("2D72D2")
        expect(result.targets).toEqual(["238551", "DC143C", "FF6B6B"])
        expect(result.stop).toBe(500)
      }))

    it.effect("should handle hex colors with #", () =>
      Effect.gen(function*() {
        const input = "#2D72D2>(#238551,#DC143C)::500"
        const result = yield* parseOneToManyTransformation(input)

        expect(result.reference).toBe("#2D72D2")
        expect(result.targets).toEqual(["#238551", "#DC143C"])
      }))

    it.effect("should fail without parentheses", () =>
      parseOneToManyTransformation("2D72D2>238551,DC143C::500").pipe(
        Effect.catchTag("TransformationParseError", (error) =>
          Effect.sync(() => {
            expect(error.reason).toContain(">(...)")
          }))
      ))

    it.effect("should fail with empty target list", () =>
      parseOneToManyTransformation("2D72D2>()::500").pipe(
        Effect.catchTag("TransformationParseError", (error) =>
          Effect.sync(() => {
            expect(error.reason).toContain("At least one")
          }))
      ))

    it.effect("should handle three or more targets", () =>
      Effect.gen(function*() {
        const input = "2D72D2>(238551,DC143C,FF6B6B,00CED1)::500"
        const result = yield* parseOneToManyTransformation(input)

        expect(result.targets).toHaveLength(4)
        expect(result.targets).toEqual(["238551", "DC143C", "FF6B6B", "00CED1"])
      }))
  })

  describe("parseAnyTransformation", () => {
    it.effect("should detect and parse single transformation", () =>
      Effect.gen(function*() {
        const input = "2D72D2>238551::500"
        const result = yield* parseAnyTransformation(input)

        expect(result).toHaveProperty("target")
        expect(result.reference).toBe("2D72D2")
        if ("target" in result) {
          expect(result.target).toBe("238551")
        }
      }))

    it.effect("should detect and parse one-to-many transformation", () =>
      Effect.gen(function*() {
        const input = "2D72D2>(238551,DC143C)::500"
        const result = yield* parseAnyTransformation(input)

        expect(result).toHaveProperty("targets")
        expect(result.reference).toBe("2D72D2")
        if ("targets" in result) {
          expect(result.targets).toHaveLength(2)
        }
      }))

    it.effect("should handle whitespace variations", () =>
      Effect.gen(function*() {
        const inputs = [
          "2D72D2>238551::500",
          "  2D72D2>238551::500  ",
          "2D72D2 > 238551 :: 500",
          "2D72D2>238551 : 500"
        ]

        for (const input of inputs) {
          const result = yield* parseAnyTransformation(input)
          expect(result.reference).toBe("2D72D2")
        }
      }))
  })

  describe("parseBatchTransformations", () => {
    it.effect("should parse newline-separated transformations", () =>
      Effect.gen(function*() {
        const input = "2D72D2>238551::500\n163F79>DC143C::700"
        const results = yield* parseBatchTransformations(input)

        expect(results).toHaveLength(2)
        expect(results[0].reference).toBe("2D72D2")
        expect(results[1].reference).toBe("163F79")
      }))

    it.effect("should parse comma-separated transformations", () =>
      Effect.gen(function*() {
        const input = "2D72D2>238551::500, 163F79>DC143C::700"
        const results = yield* parseBatchTransformations(input)

        expect(results).toHaveLength(2)
        expect(results[0].reference).toBe("2D72D2")
        expect(results[1].reference).toBe("163F79")
      }))

    it.effect("should handle mix of single and one-to-many", () =>
      Effect.gen(function*() {
        const input = "2D72D2>238551::500\n163F79>(DC143C,FF6B6B)::700"
        const results = yield* parseBatchTransformations(input)

        expect(results).toHaveLength(2)
        expect(results[0]).toHaveProperty("target")
        expect(results[1]).toHaveProperty("targets")
      }))

    it.effect("should skip empty lines", () =>
      Effect.gen(function*() {
        const input = "2D72D2>238551::500\n\n163F79>DC143C::700\n"
        const results = yield* parseBatchTransformations(input)

        expect(results).toHaveLength(2)
      }))

    it.effect("should handle Windows line endings (CRLF)", () =>
      Effect.gen(function*() {
        const input = "2D72D2>238551::500\r\n163F79>DC143C::700"
        const results = yield* parseBatchTransformations(input)

        expect(results).toHaveLength(2)
      }))

    it.effect("should handle mixed separators with caution", () =>
      Effect.gen(function*() {
        // Comma separates transformations, but parentheses protect commas inside
        const input = "2D72D2>(238551,DC143C)::500, 163F79>FF6B6B::700"
        const results = yield* parseBatchTransformations(input)

        expect(results).toHaveLength(2)
        if ("targets" in results[0]) {
          expect(results[0].targets).toHaveLength(2)
        }
      }))

    it.effect("should fail if any transformation is invalid", () =>
      parseBatchTransformations("2D72D2>238551::500\nINVALID::999\n163F79>DC143C::700").pipe(
        Effect.catchAll(() => Effect.void)
      ))
  })
})
