/**
 * Tests for ConfigService
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { CONFIG_DEFAULTS } from "../../../src/config/defaults.js"
import { MainTest } from "../../../src/layers/MainTest.js"
import { ConfigService } from "../../../src/services/ConfigService.js"

describe("ConfigService", () => {
  it.effect("should provide test config from CONFIG_DEFAULTS.test", () =>
    Effect.gen(function*() {
      const service = yield* ConfigService
      const config = yield* service.getConfig()

      // Should use test defaults
      expect(config.patternSource).toBe(CONFIG_DEFAULTS.test.patternSource)
      expect(config.defaultOutputFormat).toBe(
        CONFIG_DEFAULTS.test.defaultOutputFormat
      )
      expect(config.defaultPaletteName).toBe(
        CONFIG_DEFAULTS.test.defaultPaletteName
      )
    }).pipe(Effect.provide(MainTest)))

  it.effect("should provide pattern source convenience method", () =>
    Effect.gen(function*() {
      const service = yield* ConfigService
      const patternSource = yield* service.getPatternSource()

      expect(patternSource).toBe(CONFIG_DEFAULTS.test.patternSource)
    }).pipe(Effect.provide(MainTest)))
})
