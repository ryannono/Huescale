import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  D65_WHITE_POINT,
  forward,
  inverse,
  makeViewingConditions,
  type XYZ
} from "../../../../src/domain/color/ciecam02.js"

/**
 * CIE 159:2004 test color (approximate).
 * A mid-range color for verifying forward/inverse round-trip accuracy.
 */
const TEST_COLOR_XYZ: XYZ = { X: 19.31, Y: 23.93, Z: 10.14 }

/**
 * D65 white point used throughout.
 * Xw=95.047, Yw=100, Zw=108.883
 */
const WHITE = D65_WHITE_POINT

/** Adapting luminance for typical screen viewing */
const LA = 64

describe("CIECAM02", () => {
  describe("makeViewingConditions", () => {
    it.effect("should compute conditions for white background (Yb=100)", () =>
      Effect.gen(function* () {
        const conditions = yield* makeViewingConditions(LA, 100, WHITE)

        // n = Yb / Yw = 100/100 = 1
        expect(conditions.n).toBeCloseTo(1.0, 5)
        // z = 1.48 + sqrt(n) = 1.48 + 1 = 2.48
        expect(conditions.z).toBeCloseTo(2.48, 2)
        // Aw should be positive and meaningful
        expect(conditions.Aw).toBeGreaterThan(0)
        // D should be between 0 and 1
        expect(conditions.D).toBeGreaterThanOrEqual(0)
        expect(conditions.D).toBeLessThanOrEqual(1)
      })
    )

    it.effect("should compute conditions for dark background (Yb=10)", () =>
      Effect.gen(function* () {
        const conditions = yield* makeViewingConditions(LA, 10, WHITE)

        // n = 10/100 = 0.1
        expect(conditions.n).toBeCloseTo(0.1, 5)
        expect(conditions.Aw).toBeGreaterThan(0)
      })
    )

    it.effect("should produce different Aw for different Yb values", () =>
      Effect.gen(function* () {
        const condWhite = yield* makeViewingConditions(LA, 100, WHITE)
        const condDark = yield* makeViewingConditions(LA, 10, WHITE)

        // Different background luminance → different achromatic response to white
        expect(condWhite.Aw).not.toBeCloseTo(condDark.Aw, 1)
      })
    )
  })

  describe("forward", () => {
    it.effect("should produce positive J for a typical color", () =>
      Effect.gen(function* () {
        const conditions = yield* makeViewingConditions(LA, 20, WHITE)
        const appearance = yield* forward(TEST_COLOR_XYZ, WHITE, conditions)

        expect(appearance.J).toBeGreaterThan(0)
        expect(appearance.J).toBeLessThan(100)
        expect(appearance.C).toBeGreaterThan(0)
        expect(appearance.h).toBeGreaterThanOrEqual(0)
        expect(appearance.h).toBeLessThan(360)
      })
    )

    it.effect("should produce J≈100 for white point under any Yb", () =>
      Effect.gen(function* () {
        const conditions = yield* makeViewingConditions(LA, 20, WHITE)
        const appearance = yield* forward(WHITE, WHITE, conditions)

        // White point should have lightness close to 100
        expect(appearance.J).toBeCloseTo(100, 0)
        // White point should have very low chroma (small residual from D65 adaptation)
        expect(appearance.C).toBeLessThan(3)
      })
    )

    it.effect("should produce different J for same XYZ under different Yb", () =>
      Effect.gen(function* () {
        const condWhiteBg = yield* makeViewingConditions(LA, 100, WHITE)
        const condDarkBg = yield* makeViewingConditions(LA, 10, WHITE)

        const appearanceWhite = yield* forward(TEST_COLOR_XYZ, WHITE, condWhiteBg)
        const appearanceDark = yield* forward(TEST_COLOR_XYZ, WHITE, condDarkBg)

        // Same physical color should appear different under different backgrounds
        // (different J values)
        expect(Math.abs(appearanceWhite.J - appearanceDark.J)).toBeGreaterThan(0.1)
      })
    )

    it.effect("should produce J=0 for black (XYZ all zeros)", () =>
      Effect.gen(function* () {
        const conditions = yield* makeViewingConditions(LA, 20, WHITE)
        const black: XYZ = { X: 0, Y: 0, Z: 0 }
        const appearance = yield* forward(black, WHITE, conditions)

        expect(appearance.J).toBeCloseTo(0, 1)
      })
    )
  })

  describe("inverse", () => {
    it.effect("should recover original XYZ from forward round-trip (Yb=20)", () =>
      Effect.gen(function* () {
        const conditions = yield* makeViewingConditions(LA, 20, WHITE)
        const appearance = yield* forward(TEST_COLOR_XYZ, WHITE, conditions)
        const recovered = yield* inverse(
          { J: appearance.J, C: appearance.C, h: appearance.h },
          WHITE,
          conditions
        )

        expect(recovered.X).toBeCloseTo(TEST_COLOR_XYZ.X, 1)
        expect(recovered.Y).toBeCloseTo(TEST_COLOR_XYZ.Y, 1)
        expect(recovered.Z).toBeCloseTo(TEST_COLOR_XYZ.Z, 1)
      })
    )

    it.effect("should recover original XYZ from forward round-trip (Yb=100)", () =>
      Effect.gen(function* () {
        const conditions = yield* makeViewingConditions(LA, 100, WHITE)
        const appearance = yield* forward(TEST_COLOR_XYZ, WHITE, conditions)
        const recovered = yield* inverse(
          { J: appearance.J, C: appearance.C, h: appearance.h },
          WHITE,
          conditions
        )

        expect(recovered.X).toBeCloseTo(TEST_COLOR_XYZ.X, 1)
        expect(recovered.Y).toBeCloseTo(TEST_COLOR_XYZ.Y, 1)
        expect(recovered.Z).toBeCloseTo(TEST_COLOR_XYZ.Z, 1)
      })
    )

    it.effect("should recover original XYZ from forward round-trip (Yb=10)", () =>
      Effect.gen(function* () {
        const conditions = yield* makeViewingConditions(LA, 10, WHITE)
        const appearance = yield* forward(TEST_COLOR_XYZ, WHITE, conditions)
        const recovered = yield* inverse(
          { J: appearance.J, C: appearance.C, h: appearance.h },
          WHITE,
          conditions
        )

        expect(recovered.X).toBeCloseTo(TEST_COLOR_XYZ.X, 1)
        expect(recovered.Y).toBeCloseTo(TEST_COLOR_XYZ.Y, 1)
        expect(recovered.Z).toBeCloseTo(TEST_COLOR_XYZ.Z, 1)
      })
    )

    it.effect("should handle an achromatic color round-trip", () =>
      Effect.gen(function* () {
        // A neutral gray: X=Y=Z proportional to white point
        const gray: XYZ = { X: 47.5235, Y: 50, Z: 54.4415 }
        const conditions = yield* makeViewingConditions(LA, 20, WHITE)
        const appearance = yield* forward(gray, WHITE, conditions)
        const recovered = yield* inverse(
          { J: appearance.J, C: appearance.C, h: appearance.h },
          WHITE,
          conditions
        )

        expect(recovered.X).toBeCloseTo(gray.X, 1)
        expect(recovered.Y).toBeCloseTo(gray.Y, 1)
        expect(recovered.Z).toBeCloseTo(gray.Z, 1)
      })
    )

    it.effect("should round-trip a saturated blue", () =>
      Effect.gen(function* () {
        // sRGB blue #2D72D2 ≈ XYZ
        const blue: XYZ = { X: 17.7, Y: 17.3, Z: 63.8 }
        const conditions = yield* makeViewingConditions(LA, 20, WHITE)
        const appearance = yield* forward(blue, WHITE, conditions)
        const recovered = yield* inverse(
          { J: appearance.J, C: appearance.C, h: appearance.h },
          WHITE,
          conditions
        )

        expect(recovered.X).toBeCloseTo(blue.X, 1)
        expect(recovered.Y).toBeCloseTo(blue.Y, 1)
        expect(recovered.Z).toBeCloseTo(blue.Z, 1)
      })
    )

    it.effect("should round-trip across multiple random colors", () =>
      Effect.gen(function* () {
        const conditions = yield* makeViewingConditions(LA, 20, WHITE)
        const testColors: ReadonlyArray<XYZ> = [
          { X: 50, Y: 50, Z: 50 },
          { X: 30, Y: 20, Z: 10 },
          { X: 10, Y: 60, Z: 30 },
          { X: 5, Y: 5, Z: 40 },
          { X: 80, Y: 90, Z: 70 }
        ]

        for (const color of testColors) {
          const appearance = yield* forward(color, WHITE, conditions)
          const recovered = yield* inverse(
            { J: appearance.J, C: appearance.C, h: appearance.h },
            WHITE,
            conditions
          )

          expect(recovered.X).toBeCloseTo(color.X, 0)
          expect(recovered.Y).toBeCloseTo(color.Y, 0)
          expect(recovered.Z).toBeCloseTo(color.Z, 0)
        }
      })
    )
  })

  describe("cross-condition transform", () => {
    it.effect("should produce different XYZ when inverse uses different conditions", () =>
      Effect.gen(function* () {
        const sourceCond = yield* makeViewingConditions(LA, 100, WHITE)
        const targetCond = yield* makeViewingConditions(LA, 10, WHITE)

        const appearance = yield* forward(TEST_COLOR_XYZ, WHITE, sourceCond)
        const adapted = yield* inverse(
          { J: appearance.J, C: appearance.C, h: appearance.h },
          WHITE,
          targetCond
        )

        // The adapted color should differ from the original — that's the whole point
        const xDiff = Math.abs(adapted.X - TEST_COLOR_XYZ.X)
        const yDiff = Math.abs(adapted.Y - TEST_COLOR_XYZ.Y)
        const zDiff = Math.abs(adapted.Z - TEST_COLOR_XYZ.Z)

        expect(xDiff + yDiff + zDiff).toBeGreaterThan(0.1)
      })
    )

    it.effect("should be identity when source and target conditions are the same", () =>
      Effect.gen(function* () {
        const conditions = yield* makeViewingConditions(LA, 50, WHITE)

        const appearance = yield* forward(TEST_COLOR_XYZ, WHITE, conditions)
        const recovered = yield* inverse(
          { J: appearance.J, C: appearance.C, h: appearance.h },
          WHITE,
          conditions
        )

        expect(recovered.X).toBeCloseTo(TEST_COLOR_XYZ.X, 1)
        expect(recovered.Y).toBeCloseTo(TEST_COLOR_XYZ.Y, 1)
        expect(recovered.Z).toBeCloseTo(TEST_COLOR_XYZ.Z, 1)
      })
    )
  })
})
