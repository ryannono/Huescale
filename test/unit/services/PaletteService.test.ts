/**
 * Tests for PaletteService
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Either, Layer } from "effect"
import { ConfigService } from "../../../src/services/ConfigService.js"
import { PaletteGenerationError, PaletteService } from "../../../src/services/PaletteService.js"

// Test layer with all test dependencies
// We need to provide ConfigService separately since tests access it directly
const TestLayer = Layer.mergeAll(
  ConfigService.Test,
  PaletteService.Test
)

describe("PaletteService", () => {
  describe("generate", () => {
    it.effect("should generate a palette with hex output", () =>
      Effect.gen(function*() {
        const service = yield* PaletteService
        const config = yield* ConfigService
        const patternSource = yield* config.getPatternSource()

        const result = yield* service.generate({
          inputColor: "#2D72D2",
          anchorStop: 500,
          outputFormat: "hex",
          paletteName: "test-blue",
          patternSource
        })

        // Verify basic structure
        expect(result.name).toBe("test-blue")
        expect(result.inputColor).toBe("#2D72D2")
        expect(result.anchorStop).toBe(500)
        expect(result.outputFormat).toBe("hex")
        expect(result.stops).toHaveLength(10)

        // Verify all stops have required properties
        result.stops.forEach((stop) => {
          expect(stop.position).toBeGreaterThanOrEqual(100)
          expect(stop.position).toBeLessThanOrEqual(1000)
          expect(stop.value).toMatch(/^#[0-9a-f]{6}$/i)
          expect(stop.color).toHaveProperty("l")
          expect(stop.color).toHaveProperty("c")
          expect(stop.color).toHaveProperty("h")
        })

        // Verify stops are sorted by position
        for (let i = 0; i < result.stops.length - 1; i++) {
          expect(result.stops[i].position).toBeLessThan(result.stops[i + 1].position)
        }
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should generate a palette with rgb output", () =>
      Effect.gen(function*() {
        const service = yield* PaletteService
        const config = yield* ConfigService
        const patternSource = yield* config.getPatternSource()

        const result = yield* service.generate({
          inputColor: "#FF5733",
          anchorStop: 500,
          outputFormat: "rgb",
          paletteName: "test-orange",
          patternSource
        })

        expect(result.outputFormat).toBe("rgb")
        expect(result.stops).toHaveLength(10)

        // Verify RGB format
        result.stops.forEach((stop) => {
          expect(stop.value).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
        })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should generate a palette with oklch output", () =>
      Effect.gen(function*() {
        const service = yield* PaletteService
        const config = yield* ConfigService
        const patternSource = yield* config.getPatternSource()

        const result = yield* service.generate({
          inputColor: "#10B981",
          anchorStop: 500,
          outputFormat: "oklch",
          paletteName: "test-green",
          patternSource
        })

        expect(result.outputFormat).toBe("oklch")
        expect(result.stops).toHaveLength(10)

        // Verify OKLCH format
        result.stops.forEach((stop) => {
          expect(stop.value).toMatch(/^oklch\([\d.]+% [\d.]+ [\d.]+\)$/)
        })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should generate a palette with oklab output", () =>
      Effect.gen(function*() {
        const service = yield* PaletteService
        const config = yield* ConfigService
        const patternSource = yield* config.getPatternSource()

        const result = yield* service.generate({
          inputColor: "#8B5CF6",
          anchorStop: 500,
          outputFormat: "oklab",
          paletteName: "test-purple",
          patternSource
        })

        expect(result.outputFormat).toBe("oklab")
        expect(result.stops).toHaveLength(10)

        // Verify OKLAB format
        result.stops.forEach((stop) => {
          expect(stop.value).toMatch(/^oklab\([\d.]+% -?[\d.]+ -?[\d.]+\)$/)
        })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should support different anchor stops", () =>
      Effect.gen(function*() {
        const service = yield* PaletteService
        const config = yield* ConfigService
        const patternSource = yield* config.getPatternSource()

        // Test with anchor at 300
        const result300 = yield* service.generate({
          inputColor: "#2D72D2",
          anchorStop: 300,
          outputFormat: "hex",
          paletteName: "test-300",
          patternSource
        })

        // Test with anchor at 700
        const result700 = yield* service.generate({
          inputColor: "#2D72D2",
          anchorStop: 700,
          outputFormat: "hex",
          paletteName: "test-700",
          patternSource
        })

        expect(result300.anchorStop).toBe(300)
        expect(result700.anchorStop).toBe(700)

        // Both should have 10 stops
        expect(result300.stops).toHaveLength(10)
        expect(result700.stops).toHaveLength(10)

        // The anchor stop should exist in both
        expect(result300.stops.some((s) => s.position === 300)).toBe(true)
        expect(result700.stops.some((s) => s.position === 700)).toBe(true)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should use config default pattern source when not specified", () =>
      Effect.gen(function*() {
        const service = yield* PaletteService
        const config = yield* ConfigService
        const patternSource = yield* config.getPatternSource()

        // Don't specify patternSource - should use config default
        const result = yield* service.generate({
          inputColor: "#2D72D2",
          anchorStop: 500,
          outputFormat: "hex",
          paletteName: "test-default-pattern",
          patternSource
        })

        expect(result.stops).toHaveLength(10)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should fail with PaletteGenerationError for invalid color", () =>
      Effect.gen(function*() {
        const service = yield* PaletteService
        const config = yield* ConfigService
        const patternSource = yield* config.getPatternSource()

        const result = yield* Effect.either(
          service.generate({
            inputColor: "not-a-color",
            anchorStop: 500,
            outputFormat: "hex",
            paletteName: "test-invalid",
            patternSource
          })
        )

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(PaletteGenerationError)
          expect(result.left.message).toContain("Failed to generate palette")
        }
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should fail with PaletteGenerationError for invalid pattern source", () =>
      Effect.gen(function*() {
        const service = yield* PaletteService

        const result = yield* Effect.either(
          service.generate({
            inputColor: "#2D72D2",
            anchorStop: 500,
            outputFormat: "hex",
            paletteName: "test-invalid-pattern",
            patternSource: "nonexistent-pattern.json"
          })
        )

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(PaletteGenerationError)
        }
      }).pipe(Effect.provide(TestLayer)))
  })

  describe("generateBatch", () => {
    it.effect("should generate multiple palettes in batch", () =>
      Effect.gen(function*() {
        const service = yield* PaletteService
        const config = yield* ConfigService
        const patternSource = yield* config.getPatternSource()

        const result = yield* service.generateBatch({
          paletteGroupName: "test-batch",
          outputFormat: "hex",
          pairs: [
            { color: "#2D72D2", stop: 500 },
            { color: "#FF5733", stop: 500 },
            { color: "#10B981", stop: 500 }
          ],
          patternSource
        })

        expect(result.groupName).toBe("test-batch")
        expect(result.outputFormat).toBe("hex")
        expect(result.palettes).toHaveLength(3)
        expect(result.partial).toBe(false)
        expect(result.generatedAt).toBeTruthy()

        // Verify each palette
        result.palettes.forEach((palette) => {
          expect(palette.stops).toHaveLength(10)
          expect(palette.outputFormat).toBe("hex")
        })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should handle partial failures in batch", () =>
      Effect.gen(function*() {
        const service = yield* PaletteService
        const config = yield* ConfigService
        const patternSource = yield* config.getPatternSource()

        const result = yield* service.generateBatch({
          paletteGroupName: "test-partial",
          outputFormat: "hex",
          pairs: [
            { color: "#2D72D2", stop: 500 },
            { color: "invalid-color", stop: 500 }, // This will fail
            { color: "#10B981", stop: 500 }
          ],
          patternSource
        })

        expect(result.groupName).toBe("test-partial")
        expect(result.palettes.length).toBeLessThan(3) // Not all succeeded
        expect(result.partial).toBe(true) // Marked as partial
        expect(result.palettes.length).toBeGreaterThan(0) // At least some succeeded
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should generate empty array when all batch items fail", () =>
      Effect.gen(function*() {
        const service = yield* PaletteService
        const config = yield* ConfigService
        const patternSource = yield* config.getPatternSource()

        const result = yield* service.generateBatch({
          paletteGroupName: "test-all-fail",
          outputFormat: "hex",
          pairs: [
            { color: "invalid-1", stop: 500 },
            { color: "invalid-2", stop: 500 },
            { color: "invalid-3", stop: 500 }
          ],
          patternSource
        })

        expect(result.groupName).toBe("test-all-fail")
        expect(result.palettes).toHaveLength(0)
        expect(result.partial).toBe(true)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should support different output formats in batch", () =>
      Effect.gen(function*() {
        const service = yield* PaletteService
        const config = yield* ConfigService
        const patternSource = yield* config.getPatternSource()

        const resultRgb = yield* service.generateBatch({
          paletteGroupName: "test-rgb-batch",
          outputFormat: "rgb",
          pairs: [
            { color: "#2D72D2", stop: 500 },
            { color: "#FF5733", stop: 600 }
          ],
          patternSource
        })

        expect(resultRgb.outputFormat).toBe("rgb")
        resultRgb.palettes.forEach((palette) => {
          expect(palette.outputFormat).toBe("rgb")
          palette.stops.forEach((stop) => {
            expect(stop.value).toMatch(/^rgb\(/)
          })
        })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should use custom pattern source in batch", () =>
      Effect.gen(function*() {
        const service = yield* PaletteService

        const result = yield* service.generateBatch({
          paletteGroupName: "test-custom-pattern",
          outputFormat: "hex",
          pairs: [
            { color: "#2D72D2", stop: 500 },
            { color: "#FF5733", stop: 500 }
          ],
          patternSource: "test/fixtures/valid-palettes/example-orange.json"
        })

        expect(result.palettes).toHaveLength(2)
        expect(result.partial).toBe(false)
      }).pipe(Effect.provide(TestLayer)))
  })
})
