/**
 * Tests for ConfigService
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { ConfigService } from "../../../src/services/ConfigService.js"

describe("ConfigService", () => {
  it.effect("should provide default config", () =>
    Effect.gen(function*() {
      const service = yield* ConfigService
      const config = yield* service.getConfig()

      expect(config.patternSource).toBe("test/fixtures/valid-palettes/example-blue.json")
      expect(config.defaultOutputFormat).toBe("hex")
      expect(config.defaultPaletteName).toBe("generated")
    }).pipe(Effect.provide(ConfigService.Default)))

  it.effect("should provide pattern source", () =>
    Effect.gen(function*() {
      const service = yield* ConfigService
      const patternSource = yield* service.getPatternSource()

      expect(patternSource).toBe("test/fixtures/valid-palettes/example-blue.json")
    }).pipe(Effect.provide(ConfigService.Default)))

  it.effect("should respect PATTERN_SOURCE environment variable", () =>
    Effect.gen(function*() {
      // Set environment variable
      const originalValue = process.env.PATTERN_SOURCE
      process.env.PATTERN_SOURCE = "custom/path/to/pattern.json"

      const service = yield* ConfigService
      const config = yield* service.getConfig()

      expect(config.patternSource).toBe("custom/path/to/pattern.json")

      // Restore original value
      if (originalValue === undefined) {
        delete process.env.PATTERN_SOURCE
      } else {
        process.env.PATTERN_SOURCE = originalValue
      }
    }).pipe(Effect.provide(ConfigService.Default)))
})
