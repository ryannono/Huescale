/**
 * Tests for PatternService
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Either } from "effect"
import {
  DirectoryPath,
  FilePath,
  PatternLoadError,
  PatternService
} from "../../../src/services/PatternService/index.js"

describe("PatternService", () => {
  it.effect("should load pattern from file", () =>
    Effect.gen(function*() {
      const service = yield* PatternService
      const filePath = yield* FilePath("test/fixtures/valid-palettes/example-orange.json")
      const pattern = yield* service.loadPattern(filePath)

      expect(pattern.referenceStop).toBe(500)
      expect(pattern.name).toContain("smoothed")
      expect(pattern.transforms.get(500)!.lightnessMultiplier).toBe(1.0)
      expect(pattern.metadata.sourceCount).toBe(1)
    }).pipe(Effect.provide(PatternService.Default)))

  it.effect("should load palette from file", () =>
    Effect.gen(function*() {
      const service = yield* PatternService
      const palette = yield* service.loadPalette(yield* FilePath("test/fixtures/valid-palettes/example-orange.json"))

      expect(palette.name).toBe("example-orange")
      expect(palette.stops).toHaveLength(10)
      expect(palette.stops[0].position).toBe(100)
      expect(palette.stops[0].color).toHaveProperty("l")
      expect(palette.stops[0].color).toHaveProperty("c")
      expect(palette.stops[0].color).toHaveProperty("h")
    }).pipe(Effect.provide(PatternService.Default)))

  it.effect("should fail with PatternLoadError for missing file", () =>
    Effect.gen(function*() {
      const service = yield* PatternService
      const result = yield* Effect.either(service.loadPattern(yield* FilePath("nonexistent.json")))

      expect(Either.isLeft(result)).toBe(true)
      if (Either.isLeft(result)) {
        expect(result.left).toBeInstanceOf(PatternLoadError)
        expect(result.left.message).toContain("Failed to read palette file")
      }
    }).pipe(Effect.provide(PatternService.Default)))

  it.effect("should fail with PatternLoadError for invalid JSON", () =>
    Effect.gen(function*() {
      const service = yield* PatternService
      const result = yield* Effect.either(service.loadPattern(yield* FilePath("test/fixtures/invalid.json")))

      expect(Either.isLeft(result)).toBe(true)
      if (Either.isLeft(result)) {
        expect(result.left).toBeInstanceOf(PatternLoadError)
      }
    }).pipe(Effect.provide(PatternService.Default)))

  it.effect("should smooth pattern transforms", () =>
    Effect.gen(function*() {
      const service = yield* PatternService
      const pattern = yield* service.loadPattern(yield* FilePath("test/fixtures/valid-palettes/example-orange.json"))

      // Check that lightness multipliers are linear
      const lightness = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map(
        (stop) =>
          pattern.transforms.get(stop as 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000)!
            .lightnessMultiplier
      )

      // Lightness should be descending (lighter at 100, darker at 1000)
      for (let i = 0; i < lightness.length - 1; i++) {
        expect(lightness[i]).toBeGreaterThan(lightness[i + 1])
      }

      // Reference stop (500) should be 1.0
      expect(pattern.transforms.get(500)!.lightnessMultiplier).toBe(1.0)
    }).pipe(Effect.provide(PatternService.Default)))

  describe("error handling", () => {
    it.effect("should fail with PatternLoadError for invalid schema", () =>
      Effect.gen(function*() {
        const service = yield* PatternService
        const result = yield* Effect.either(
          service.loadPalette(yield* FilePath("test/fixtures/invalid-palettes/invalid-schema.json"))
        )

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(PatternLoadError)
          expect(result.left.message).toContain("Invalid palette schema")
        }
      }).pipe(Effect.provide(PatternService.Default)))

    it.effect("should fail with PatternLoadError for invalid colors", () =>
      Effect.gen(function*() {
        const service = yield* PatternService
        const result = yield* Effect.either(
          service.loadPalette(yield* FilePath("test/fixtures/invalid-palettes/invalid-colors.json"))
        )

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(PatternLoadError)
          // Schema validation catches hex format errors
          expect(result.left.message).toContain("Invalid palette schema")
        }
      }).pipe(Effect.provide(PatternService.Default)))

    it.effect("should fail with PatternLoadError for incomplete palette (missing stops)", () =>
      Effect.gen(function*() {
        const service = yield* PatternService
        const result = yield* Effect.either(
          service.loadPattern(yield* FilePath("test/fixtures/invalid-palettes/incomplete-palette.json"))
        )

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(PatternLoadError)
          // Schema validation catches missing stops (requires exactly 10)
          expect(result.left.message).toContain("Invalid palette schema")
        }
      }).pipe(Effect.provide(PatternService.Default)))
  })

  describe("loadPatternsFromDirectory", () => {
    it.effect("should load multiple palettes from directory", () =>
      Effect.gen(function*() {
        const service = yield* PatternService
        const result = yield* service.loadPatternsFromDirectory(yield* DirectoryPath("test/fixtures/valid-palettes"))

        expect(result.palettes.length).toBe(3) // example-orange, example-blue, and example-red
        expect(result.pattern.referenceStop).toBe(500)
        expect(result.pattern.metadata.sourceCount).toBe(3)
        expect(result.pattern.name).toContain("smoothed")
      }).pipe(Effect.provide(PatternService.Default)))

    it.effect("should fail when directory does not exist", () =>
      Effect.gen(function*() {
        const service = yield* PatternService
        const result = yield* Effect.either(
          service.loadPatternsFromDirectory(yield* DirectoryPath("test/fixtures/nonexistent-dir"))
        )

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(PatternLoadError)
          expect(result.left.message).toContain("Failed to read directory")
        }
      }).pipe(Effect.provide(PatternService.Default)))

    it.effect("should fail when directory has no JSON files", () =>
      Effect.gen(function*() {
        const service = yield* PatternService
        // Create a directory with only .gitkeep file
        const result = yield* Effect.either(service.loadPatternsFromDirectory(yield* DirectoryPath("test/unit")))

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(PatternLoadError)
          expect(result.left.message).toContain("No JSON palette files found")
        }
      }).pipe(Effect.provide(PatternService.Default)))

    it.effect("should aggregate patterns from multiple palettes", () =>
      Effect.gen(function*() {
        const service = yield* PatternService
        const result = yield* service.loadPatternsFromDirectory(yield* DirectoryPath("test/fixtures/valid-palettes"))

        // Should have loaded example-orange.json, example-blue.json and example-red.json
        expect(result.palettes.length).toBe(3)

        // Pattern should be smoothed
        expect(result.pattern.name).toContain("smoothed")

        // Should have all 10 transforms
        expect(result.pattern.transforms.size).toBe(10)

        // Reference stop should be 1.0 (allow for floating point precision)
        expect(result.pattern.transforms.get(500)!.lightnessMultiplier).toBeCloseTo(1.0)
      }).pipe(Effect.provide(PatternService.Default)))
  })
})
