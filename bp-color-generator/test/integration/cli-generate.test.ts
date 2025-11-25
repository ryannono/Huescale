/**
 * Integration tests for the generate CLI command
 */

import { Effect, Option as O } from "effect"
import { describe, expect, it } from "vitest"
import { handleBatchMode } from "../../src/cli/commands/generate/batch-handler.js"
import { handleGenerate } from "../../src/cli/commands/generate/handler.js"
import { handleSingleMode } from "../../src/cli/commands/generate/single-handler.js"
import { ConfigService } from "../../src/services/ConfigService.js"
import { PaletteService } from "../../src/services/PaletteService.js"

describe("CLI Generate Command Integration", () => {
  describe("Single Palette Mode", () => {
    it("should generate palette with all flags provided", () =>
      Effect.gen(function*() {
        const config = yield* ConfigService
        const appConfig = yield* config.getConfig()

        const result = yield* handleSingleMode({
          colorOpt: O.some("#2D72D2"),
          formatOpt: O.some("hex"),
          isInteractive: false,
          nameOpt: O.some("test-palette"),
          pattern: appConfig.patternSource,
          stopOpt: O.some(500)
        })

        expect(result.name).toBe("test-palette")
        expect(result.stops).toHaveLength(11)
        expect(result.outputFormat).toBe("hex")
      }).pipe(Effect.provide(PaletteService.Test)))

    it("should handle valid RGB color input", () =>
      Effect.gen(function*() {
        const config = yield* ConfigService
        const appConfig = yield* config.getConfig()

        const result = yield* handleSingleMode({
          colorOpt: O.some("rgb(45, 114, 210)"),
          formatOpt: O.some("oklch"),
          isInteractive: false,
          nameOpt: O.some("rgb-test"),
          pattern: appConfig.patternSource,
          stopOpt: O.some(600)
        })

        expect(result.name).toBe("rgb-test")
        expect(result.stops).toHaveLength(11)
        expect(result.outputFormat).toBe("oklch")
      }).pipe(Effect.provide(PaletteService.Test)))

    it("should handle OKLCH color input", () =>
      Effect.gen(function*() {
        const config = yield* ConfigService
        const appConfig = yield* config.getConfig()

        const result = yield* handleSingleMode({
          colorOpt: O.some("oklch(0.5 0.15 250)"),
          formatOpt: O.some("hex"),
          isInteractive: false,
          nameOpt: O.some("oklch-test"),
          pattern: appConfig.patternSource,
          stopOpt: O.some(400)
        })

        expect(result.name).toBe("oklch-test")
        expect(result.stops).toHaveLength(11)
      }).pipe(Effect.provide(PaletteService.Test)))
  })

  describe("Batch Palette Mode", () => {
    it("should generate multiple palettes from pairs with stops", () =>
      Effect.gen(function*() {
        const config = yield* ConfigService
        const appConfig = yield* config.getConfig()

        const result = yield* handleBatchMode({
          exportOpt: O.some("none"),
          exportPath: O.none(),
          formatOpt: O.some("hex"),
          isInteractive: false,
          nameOpt: O.some("batch-test"),
          pairs: [
            { color: "#2D72D2", stop: 500, raw: "#2D72D2::500" },
            { color: "#DB2C6F", stop: 600, raw: "#DB2C6F::600" }
          ],
          pattern: appConfig.patternSource
        })

        expect(result.palettes).toHaveLength(2)
        expect(result.partial).toBe(false)
        expect(result.palettes[0].name).toContain("batch-test")
        expect(result.palettes[1].name).toContain("batch-test")
      }).pipe(Effect.provide(PaletteService.Test)))

    it("should handle batch with different output formats", () =>
      Effect.gen(function*() {
        const config = yield* ConfigService
        const appConfig = yield* config.getConfig()

        const result = yield* handleBatchMode({
          exportOpt: O.some("none"),
          exportPath: O.none(),
          formatOpt: O.some("oklch"),
          isInteractive: false,
          nameOpt: O.some("oklch-batch"),
          pairs: [
            { color: "#2D72D2", stop: 500, raw: "#2D72D2::500" },
            { color: "rgb(219, 44, 111)", stop: 600, raw: "rgb(219, 44, 111)::600" }
          ],
          pattern: appConfig.patternSource
        })

        expect(result.palettes).toHaveLength(2)
        expect(result.palettes[0].outputFormat).toBe("oklch")
        expect(result.palettes[1].outputFormat).toBe("oklch")
      }).pipe(Effect.provide(PaletteService.Test)))
  })

  describe("Main Handler with Mode Detection", () => {
    it("should detect single mode from single color without separator", () =>
      Effect.gen(function*() {
        const config = yield* ConfigService
        const appConfig = yield* config.getConfig()

        const result = yield* handleGenerate({
          colorOpt: O.some("#2D72D2"),
          exportOpt: O.some("none"),
          exportPath: O.none(),
          formatOpt: O.some("hex"),
          nameOpt: O.some("single-detect"),
          pattern: appConfig.patternSource,
          stopOpt: O.some(500)
        })

        // Single mode returns GeneratedPaletteOutput
        expect("name" in result).toBe(true)
        expect((result as any).name).toBe("single-detect")
      }).pipe(Effect.provide(PaletteService.Test)))

    it("should detect batch mode from comma-separated input", () =>
      Effect.gen(function*() {
        const config = yield* ConfigService
        const appConfig = yield* config.getConfig()

        const result = yield* handleGenerate({
          colorOpt: O.some("#2D72D2::500,#DB2C6F::600"),
          exportOpt: O.some("none"),
          exportPath: O.none(),
          formatOpt: O.some("hex"),
          nameOpt: O.some("batch-detect"),
          pattern: appConfig.patternSource,
          stopOpt: O.none()
        })

        // Batch mode returns BatchGenerationResult
        expect("palettes" in result).toBe(true)
        expect((result as any).palettes).toHaveLength(2)
      }).pipe(Effect.provide(PaletteService.Test)))

    it("should detect batch mode from single color with :: separator", () =>
      Effect.gen(function*() {
        const config = yield* ConfigService
        const appConfig = yield* config.getConfig()

        const result = yield* handleGenerate({
          colorOpt: O.some("#2D72D2::500"),
          exportOpt: O.some("none"),
          exportPath: O.none(),
          formatOpt: O.some("hex"),
          nameOpt: O.some("batch-single"),
          pattern: appConfig.patternSource,
          stopOpt: O.none()
        })

        // Batch mode returns BatchGenerationResult
        expect("palettes" in result).toBe(true)
        expect((result as any).palettes).toHaveLength(1)
      }).pipe(Effect.provide(PaletteService.Test)))
  })
})
