/**
 * Tests for CLI output formatter
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Option as O, Schema } from "effect"
import {
  buildExportConfig,
  displayBatch,
  displayPalette,
  generateAndDisplay
} from "../../../src/cli/commands/generate/formatter.js"
import { MainTest } from "../../../src/layers/MainTest.js"
import {
  type BatchResult,
  ISOTimestampSchema,
  type PaletteResult
} from "../../../src/services/PaletteService/palette.schema.js"

// ============================================================================
// Test Fixtures
// ============================================================================

const createPaletteResult = (
  overrides?: Partial<PaletteResult>
): PaletteResult => ({
  name: "test-palette",
  inputColor: "#2D72D2",
  anchorStop: 500,
  outputFormat: "hex",
  stops: [
    {
      position: 100,
      color: { l: 0.95, c: 0.02, h: 258, alpha: 1 },
      value: "#f0f4ff"
    },
    {
      position: 200,
      color: { l: 0.85, c: 0.05, h: 258, alpha: 1 },
      value: "#c4d5f7"
    },
    {
      position: 300,
      color: { l: 0.75, c: 0.08, h: 258, alpha: 1 },
      value: "#98b6ef"
    },
    {
      position: 400,
      color: { l: 0.65, c: 0.12, h: 258, alpha: 1 },
      value: "#6c97e7"
    },
    {
      position: 500,
      color: { l: 0.57, c: 0.15, h: 258, alpha: 1 },
      value: "#2d72d2"
    },
    {
      position: 600,
      color: { l: 0.48, c: 0.13, h: 258, alpha: 1 },
      value: "#2458a8"
    },
    {
      position: 700,
      color: { l: 0.38, c: 0.1, h: 258, alpha: 1 },
      value: "#1b3f7e"
    },
    {
      position: 800,
      color: { l: 0.28, c: 0.07, h: 258, alpha: 1 },
      value: "#122754"
    },
    {
      position: 900,
      color: { l: 0.18, c: 0.04, h: 258, alpha: 1 },
      value: "#09102a"
    },
    {
      position: 1000,
      color: { l: 0.08, c: 0.01, h: 258, alpha: 1 },
      value: "#020408"
    }
  ],
  ...overrides
})

const createBatchResult = (overrides?: Partial<BatchResult>): BatchResult => ({
  groupName: "test-batch",
  outputFormat: "hex",
  generatedAt: Schema.decodeSync(ISOTimestampSchema)(new Date().toISOString()),
  palettes: [createPaletteResult()],
  failures: [],
  ...overrides
})

// ============================================================================
// Tests
// ============================================================================

describe("formatter", () => {
  describe("generateAndDisplay", () => {
    it.effect("should generate a palette with valid inputs", () =>
      Effect.gen(function*() {
        const result = yield* generateAndDisplay({
          color: "#2D72D2",
          format: "hex",
          name: "test-gen",
          pattern: "test/fixtures/valid-palettes/example-orange.json",
          stop: 500
        })

        expect(result.name).toBe("test-gen")
        expect(result.inputColor).toBe("#2D72D2")
        expect(result.anchorStop).toBe(500)
        expect(result.outputFormat).toBe("hex")
        expect(result.stops).toHaveLength(10)
      }).pipe(Effect.provide(MainTest)))

    it.effect("should fail for invalid color", () =>
      Effect.gen(function*() {
        const error = yield* generateAndDisplay({
          color: "not-a-color",
          format: "hex",
          name: "test-invalid",
          pattern: "test/fixtures/valid-palettes/example-orange.json",
          stop: 500
        }).pipe(Effect.flip)

        expect(error).toBeDefined()
      }).pipe(Effect.provide(MainTest)))

    it.effect("should support different output formats", () =>
      Effect.gen(function*() {
        const hexResult = yield* generateAndDisplay({
          color: "#2D72D2",
          format: "hex",
          name: "test-hex",
          pattern: "test/fixtures/valid-palettes/example-orange.json",
          stop: 500
        })
        expect(hexResult.outputFormat).toBe("hex")

        const rgbResult = yield* generateAndDisplay({
          color: "#2D72D2",
          format: "rgb",
          name: "test-rgb",
          pattern: "test/fixtures/valid-palettes/example-orange.json",
          stop: 500
        })
        expect(rgbResult.outputFormat).toBe("rgb")

        const oklchResult = yield* generateAndDisplay({
          color: "#2D72D2",
          format: "oklch",
          name: "test-oklch",
          pattern: "test/fixtures/valid-palettes/example-orange.json",
          stop: 500
        })
        expect(oklchResult.outputFormat).toBe("oklch")
      }).pipe(Effect.provide(MainTest)))
  })

  describe("displayPalette", () => {
    it.effect("should execute without error", () =>
      Effect.gen(function*() {
        const palette = createPaletteResult()
        // displayPalette calls clack.note which outputs to console
        // We just verify it completes without error
        yield* displayPalette(palette)
      }).pipe(Effect.provide(MainTest)))

    it.effect("should display palette with different formats", () =>
      Effect.gen(function*() {
        const rgbPalette = createPaletteResult({ outputFormat: "rgb" })
        yield* displayPalette(rgbPalette)

        const oklchPalette = createPaletteResult({ outputFormat: "oklch" })
        yield* displayPalette(oklchPalette)
      }).pipe(Effect.provide(MainTest)))
  })

  describe("displayBatch", () => {
    it.effect("should display batch without failures", () =>
      Effect.gen(function*() {
        const batch = createBatchResult({ failures: [] })
        yield* displayBatch(batch)
      }).pipe(Effect.provide(MainTest)))

    it.effect("should display batch with failures", () =>
      Effect.gen(function*() {
        const batch = createBatchResult({
          failures: [
            { color: "invalid-1", stop: 500, error: "Parse error" },
            { color: "invalid-2", stop: 700, error: "Another error" }
          ]
        })
        yield* displayBatch(batch)
      }).pipe(Effect.provide(MainTest)))

    it.effect("should display batch with multiple palettes", () =>
      Effect.gen(function*() {
        const batch = createBatchResult({
          palettes: [
            createPaletteResult({ name: "palette-1" }),
            createPaletteResult({ name: "palette-2" }),
            createPaletteResult({ name: "palette-3" })
          ]
        })
        yield* displayBatch(batch)
      }).pipe(Effect.provide(MainTest)))
  })

  describe("buildExportConfig", () => {
    it.effect("should return None for 'none' export target", () =>
      Effect.gen(function*() {
        const config = yield* buildExportConfig(O.some("none"), O.none())

        expect(O.isNone(config)).toBe(true)
      }).pipe(Effect.provide(MainTest)))

    it.effect("should return clipboard config", () =>
      Effect.gen(function*() {
        const config = yield* buildExportConfig(O.some("clipboard"), O.none())

        expect(O.isSome(config)).toBe(true)
        if (O.isSome(config)) {
          expect(config.value.target).toBe("clipboard")
          expect(config.value.jsonPath).toBeUndefined()
        }
      }).pipe(Effect.provide(MainTest)))

    it.effect("should return json config with provided path", () =>
      Effect.gen(function*() {
        const config = yield* buildExportConfig(
          O.some("json"),
          O.some("output/test.json")
        )

        expect(O.isSome(config)).toBe(true)
        if (O.isSome(config)) {
          expect(config.value.target).toBe("json")
          expect(config.value.jsonPath).toBe("output/test.json")
        }
      }).pipe(Effect.provide(MainTest)))

    it.effect("should handle clipboard with ignored path", () =>
      Effect.gen(function*() {
        // When target is clipboard, path should be ignored
        const config = yield* buildExportConfig(
          O.some("clipboard"),
          O.some("ignored/path.json")
        )

        expect(O.isSome(config)).toBe(true)
        if (O.isSome(config)) {
          expect(config.value.target).toBe("clipboard")
          expect(config.value.jsonPath).toBeUndefined()
        }
      }).pipe(Effect.provide(MainTest)))
  })
})
