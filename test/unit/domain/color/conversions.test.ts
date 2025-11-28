import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { OKLCHColor } from "../../../../src/domain/color/color.schema.js"
import { oklchToHex, oklchToOKLAB, oklchToRGB } from "../../../../src/domain/color/conversions.js"

describe("Color Conversions", () => {
  describe("oklchToHex", () => {
    it.effect("should convert OKLCH to hex correctly", () =>
      Effect.gen(function*() {
        const oklch = yield* OKLCHColor({ l: 0.5723, c: 0.154, h: 258.7 })
        const result = yield* oklchToHex(oklch)

        // Should produce a valid hex color
        expect(result).toMatch(/^#[0-9a-f]{6}$/i)
        // Should be a blue color (close to #2d72d2 but allow for rounding)
        expect(result.toLowerCase()).toMatch(/^#[2-4][0-9a-f][6-8][0-9a-f]d[0-9a-f]$/i)
      }))

    it.effect("should handle pure white", () =>
      Effect.gen(function*() {
        const white = yield* OKLCHColor({ l: 1.0, c: 0, h: 0 })
        const result = yield* oklchToHex(white)

        expect(result.toLowerCase()).toBe("#ffffff")
      }))

    it.effect("should handle pure black", () =>
      Effect.gen(function*() {
        const black = yield* OKLCHColor({ l: 0, c: 0, h: 0 })
        const result = yield* oklchToHex(black)

        expect(result.toLowerCase()).toBe("#000000")
      }))

    it.effect("should clamp out-of-gamut colors", () =>
      Effect.gen(function*() {
        // Very high chroma that's out of sRGB gamut
        const outOfGamut = yield* OKLCHColor({ l: 0.5, c: 0.5, h: 180 })
        const result = yield* oklchToHex(outOfGamut)

        // Should still produce a valid hex color (clamped to gamut)
        expect(result).toMatch(/^#[0-9a-f]{6}$/i)
      }))
  })

  describe("oklchToRGB", () => {
    it.effect("should convert OKLCH to RGB correctly", () =>
      Effect.gen(function*() {
        const oklch = yield* OKLCHColor({ l: 0.5723, c: 0.154, h: 258.7 })
        const result = yield* oklchToRGB(oklch)

        // RGB values should be in 0-255 range for a blue color
        expect(result.r).toBeGreaterThan(40)
        expect(result.r).toBeLessThan(70)
        expect(result.g).toBeGreaterThan(100)
        expect(result.g).toBeLessThan(130)
        expect(result.b).toBeGreaterThan(200)
        expect(result.b).toBeLessThan(220)
      }))

    it.effect("should handle grayscale colors (zero chroma)", () =>
      Effect.gen(function*() {
        const gray = yield* OKLCHColor({ l: 0.5, c: 0, h: 0 })
        const result = yield* oklchToRGB(gray)

        // All RGB channels should be equal for grayscale
        expect(result.r).toBeCloseTo(result.g, 2)
        expect(result.g).toBeCloseTo(result.b, 2)
      }))
  })

  describe("oklchToOKLAB", () => {
    it.effect("should convert OKLCH to OKLAB correctly", () =>
      Effect.gen(function*() {
        const oklch = yield* OKLCHColor({ l: 0.5723, c: 0.154, h: 258.7 })
        const result = yield* oklchToOKLAB(oklch)

        expect(result.l).toBeCloseTo(0.5723, 3)
        // a and b should be derived from c and h
        expect(Math.sqrt(result.a * result.a + result.b * result.b)).toBeCloseTo(0.154, 2)
      }))

    it.effect("should preserve lightness exactly", () =>
      Effect.gen(function*() {
        const oklch = yield* OKLCHColor({ l: 0.75, c: 0.1, h: 120 })
        const result = yield* oklchToOKLAB(oklch)

        expect(result.l).toBe(0.75)
      }))
  })

  describe("Round-trip conversions", () => {
    it.effect("should convert OKLCH to hex consistently", () =>
      Effect.gen(function*() {
        const oklch = yield* OKLCHColor({ l: 0.5723, c: 0.154, h: 258.7 })
        const hex1 = yield* oklchToHex(oklch)
        const hex2 = yield* oklchToHex(oklch)

        // Same OKLCH values should always produce the same hex output
        expect(hex1).toBe(hex2)
        // Should produce a valid hex color
        expect(hex1).toMatch(/^#[0-9a-f]{6}$/i)
      }))
  })
})
