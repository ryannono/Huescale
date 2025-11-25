/**
 * Tests for ExportService
 */

import { FileSystem, Path } from "@effect/platform"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Either, Layer } from "effect"
import { vi } from "vitest"
import type { BatchGeneratedPaletteOutput } from "../../../src/schemas/batch.js"
import type { GeneratedPaletteOutput } from "../../../src/schemas/generate-palette.js"
import { ExportError, ExportService } from "../../../src/services/ExportService.js"

import clipboardy from "clipboardy"

// Mock clipboardy
vi.mock("clipboardy", () => ({
  default: {
    write: vi.fn().mockResolvedValue(undefined),
    read: vi.fn().mockResolvedValue("")
  }
}))

// Test layer that provides all dependencies
const TestLayer = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer
).pipe(Layer.provideMerge(ExportService.Default))

describe("ExportService", () => {
  // Sample palette for testing
  const samplePalette: GeneratedPaletteOutput = {
    name: "test-palette",
    outputFormat: "hex",
    inputColor: "#2D72D2",
    anchorStop: 500,
    stops: [
      {
        position: 100,
        color: { l: 0.9, c: 0.1, h: 250, alpha: 1 },
        value: "#d4e7ff"
      },
      {
        position: 500,
        color: { l: 0.5, c: 0.15, h: 250, alpha: 1 },
        value: "#2D72D2"
      },
      {
        position: 1000,
        color: { l: 0.2, c: 0.08, h: 250, alpha: 1 },
        value: "#0e2844"
      }
    ]
  }

  // Sample batch for testing
  const sampleBatch: BatchGeneratedPaletteOutput = {
    groupName: "test-batch",
    outputFormat: "hex",
    palettes: [samplePalette],
    partial: false,
    generatedAt: new Date().toISOString()
  }

  describe("exportPalette", () => {
    it.effect("should export palette to JSON file", () =>
      Effect.gen(function*() {
        const service = yield* ExportService
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path

        const testPath = path.join("test", "output", "test-export.json")

        // Export to file
        yield* service.exportPalette(samplePalette, {
          target: "json",
          jsonPath: testPath,
          includeOKLCH: true
        })

        // Verify file was created
        const fileExists = yield* fs.exists(testPath)
        expect(fileExists).toBe(true)

        // Verify content
        const content = yield* fs.readFileString(testPath)
        const parsed = JSON.parse(content)
        expect(parsed.name).toBe("test-palette")
        expect(parsed.stops).toHaveLength(3)

        // Clean up
        yield* fs.remove(testPath, { recursive: true })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should export palette to clipboard", () =>
      Effect.gen(function*() {
        const service = yield* ExportService

        // Export to clipboard
        yield* service.exportPalette(samplePalette, {
          target: "clipboard",
          includeOKLCH: true
        })

        // Verify clipboard was called
        expect(clipboardy.write).toHaveBeenCalled()
        const writeCall = vi.mocked(clipboardy.write)
        const lastCall = writeCall.mock.calls[writeCall.mock.calls.length - 1]
        const json = lastCall[0] as string
        const parsed = JSON.parse(json)
        expect(parsed.name).toBe("test-palette")
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should do nothing when target is 'none'", () =>
      Effect.gen(function*() {
        const service = yield* ExportService

        // Should not throw
        yield* service.exportPalette(samplePalette, {
          target: "none",
          includeOKLCH: true
        })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should fail with ExportError when jsonPath is missing for json target", () =>
      Effect.gen(function*() {
        const service = yield* ExportService
        const result = yield* Effect.either(
          service.exportPalette(samplePalette, {
            target: "json",
            includeOKLCH: true
          })
        )

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(ExportError)
          expect(result.left.message).toContain("JSON export requires a file path")
        }
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should fail with ExportError for invalid file path", () =>
      Effect.gen(function*() {
        const service = yield* ExportService
        const result = yield* Effect.either(
          service.exportPalette(samplePalette, {
            target: "json",
            jsonPath: "/invalid/\0/path.json",
            includeOKLCH: true
          })
        )

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(ExportError)
        }
      }).pipe(Effect.provide(TestLayer)))
  })

  describe("exportBatch", () => {
    it.effect("should export batch to JSON file", () =>
      Effect.gen(function*() {
        const service = yield* ExportService
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path

        const testPath = path.join("test", "output", "test-batch-export.json")

        // Export to file
        yield* service.exportBatch(sampleBatch, {
          target: "json",
          jsonPath: testPath,
          includeOKLCH: true
        })

        // Verify file was created
        const fileExists = yield* fs.exists(testPath)
        expect(fileExists).toBe(true)

        // Verify content
        const content = yield* fs.readFileString(testPath)
        const parsed = JSON.parse(content)
        expect(parsed.groupName).toBe("test-batch")
        expect(parsed.palettes).toHaveLength(1)

        // Clean up
        yield* fs.remove(testPath, { recursive: true })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should export batch to clipboard", () =>
      Effect.gen(function*() {
        const service = yield* ExportService

        // Export to clipboard
        yield* service.exportBatch(sampleBatch, {
          target: "clipboard",
          includeOKLCH: true
        })

        // Verify clipboard was called
        expect(clipboardy.write).toHaveBeenCalled()
        const writeCall = vi.mocked(clipboardy.write)
        const lastCall = writeCall.mock.calls[writeCall.mock.calls.length - 1]
        const json = lastCall[0] as string
        const parsed = JSON.parse(json)
        expect(parsed.groupName).toBe("test-batch")
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should do nothing when target is 'none'", () =>
      Effect.gen(function*() {
        const service = yield* ExportService

        // Should not throw
        yield* service.exportBatch(sampleBatch, {
          target: "none",
          includeOKLCH: true
        })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should fail with ExportError when jsonPath is missing for json target", () =>
      Effect.gen(function*() {
        const service = yield* ExportService
        const result = yield* Effect.either(
          service.exportBatch(sampleBatch, {
            target: "json",
            includeOKLCH: true
          })
        )

        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(ExportError)
          expect(result.left.message).toContain("JSON export requires a file path")
        }
      }).pipe(Effect.provide(TestLayer)))
  })
})
