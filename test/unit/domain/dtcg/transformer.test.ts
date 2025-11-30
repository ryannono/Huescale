import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import type {
  BatchExtensionMetadata,
  DTCGColorToken,
  DTCGExportDocument,
  DTCGPalette
} from "../../../../src/domain/dtcg/dtcg.schema.js"
import { EXTENSION_NAMESPACE } from "../../../../src/domain/dtcg/dtcg.schema.js"
import { batchResultToDTCG, paletteResultToDTCG } from "../../../../src/domain/dtcg/transformer.js"
import type {
  BatchResult,
  FormattedStop,
  PaletteResult,
  StopPosition
} from "../../../../src/domain/palette/palette.schema.js"
import { ISOTimestampSchema } from "../../../../src/domain/palette/palette.schema.js"

// ============================================================================
// Type Helpers
// ============================================================================

/** Type guard for DTCGPalette */
const isDTCGPalette = (value: unknown): value is DTCGPalette =>
  value !== null && typeof value === "object" && "$type" in value

/** Type guard for DTCGColorToken */
const isDTCGColorToken = (value: unknown): value is DTCGColorToken =>
  value !== null && typeof value === "object" && "$type" in value && "$value" in value

/** Extract palette from DTCG document with type narrowing */
const getPalette = (doc: DTCGExportDocument, name: string): DTCGPalette | undefined => {
  const entry = doc[name]
  return isDTCGPalette(entry) ? entry : undefined
}

/** Extract color token from palette with type narrowing */
const getToken = (palette: DTCGPalette | undefined, position: string): DTCGColorToken | undefined => {
  if (palette === undefined) return undefined
  const entry = palette[position]
  return isDTCGColorToken(entry) ? entry : undefined
}

/** Type guard for BatchExtensionMetadata */
const isBatchExtensionMetadata = (value: unknown): value is BatchExtensionMetadata =>
  value !== null && typeof value === "object" && "outputFormat" in value && "generatedAt" in value

// ============================================================================
// Test Fixtures
// ============================================================================

const makeFormattedStop = (position: StopPosition, l: number, value: string): FormattedStop => ({
  position,
  color: { l, c: 0.1, h: 259, alpha: 1 },
  value
})

const makePaletteResult = (name: string): PaletteResult => ({
  name,
  inputColor: "#2d72d2",
  anchorStop: 500,
  outputFormat: "hex",
  stops: [
    makeFormattedStop(100, 0.95, "#f0f4f9"),
    makeFormattedStop(200, 0.85, "#d0e1f9"),
    makeFormattedStop(300, 0.75, "#a0c4f3"),
    makeFormattedStop(400, 0.65, "#6ba3e8"),
    makeFormattedStop(500, 0.57, "#2d72d2"),
    makeFormattedStop(600, 0.48, "#2662b8"),
    makeFormattedStop(700, 0.40, "#1d4f96"),
    makeFormattedStop(800, 0.32, "#153c74"),
    makeFormattedStop(900, 0.24, "#0e2952"),
    makeFormattedStop(1000, 0.15, "#071630")
  ]
})

/** Test ISO timestamp for batch results */
const TEST_TIMESTAMP = Schema.decodeSync(ISOTimestampSchema)("2024-01-15T12:00:00.000Z")

const makeBatchResult = (): BatchResult => ({
  groupName: "test-batch",
  outputFormat: "hex",
  generatedAt: TEST_TIMESTAMP,
  palettes: [makePaletteResult("primary"), makePaletteResult("secondary")],
  failures: []
})

// ============================================================================
// Tests
// ============================================================================

describe("DTCG Transformer", () => {
  describe("paletteResultToDTCG", () => {
    it.effect("should transform PaletteResult to DTCG format", () =>
      Effect.gen(function*() {
        const palette = makePaletteResult("primary")
        const result = yield* paletteResultToDTCG(palette)

        // Should have the palette at root level
        expect(result).toHaveProperty("primary")
        const dtcgPalette = getPalette(result, "primary")

        // Palette should have $type and $extensions
        expect(dtcgPalette).toHaveProperty("$type", "color")
        expect(dtcgPalette).toHaveProperty("$extensions")
      }))

    it.effect("should include palette metadata in extensions", () =>
      Effect.gen(function*() {
        const palette = makePaletteResult("primary")
        const result = yield* paletteResultToDTCG(palette)

        const dtcgPalette = getPalette(result, "primary")
        const extensions = dtcgPalette?.$extensions?.[EXTENSION_NAMESPACE]

        expect(extensions).toEqual({
          inputColor: "#2d72d2",
          anchorStop: 500,
          outputFormat: "hex"
        })
      }))

    it.effect("should transform all 10 stops to DTCG tokens", () =>
      Effect.gen(function*() {
        const palette = makePaletteResult("primary")
        const result = yield* paletteResultToDTCG(palette)

        const dtcgPalette = getPalette(result, "primary")

        // Should have all 10 stops
        for (const position of [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]) {
          expect(dtcgPalette).toHaveProperty(String(position))
        }
      }))

    it.effect("should produce valid DTCG color tokens", () =>
      Effect.gen(function*() {
        const palette = makePaletteResult("primary")
        const result = yield* paletteResultToDTCG(palette)

        const dtcgPalette = getPalette(result, "primary")
        const token500 = getToken(dtcgPalette, "500")

        // Token should have correct structure
        expect(token500).toHaveProperty("$type", "color")
        expect(token500).toHaveProperty("$value")

        const value = token500?.$value
        expect(value).toHaveProperty("colorSpace", "oklch")
        expect(value).toHaveProperty("components")
        expect(value?.components).toHaveLength(3)

        // Components should be [L, C, H]
        const [l, c, h] = value?.components ?? []
        expect(l).toBeCloseTo(0.57, 1)
        expect(c).toBeCloseTo(0.1, 1)
        expect(h).toBeCloseTo(259, 0)
      }))

    it.effect("should include stop metadata in token extensions", () =>
      Effect.gen(function*() {
        const palette = makePaletteResult("primary")
        const result = yield* paletteResultToDTCG(palette)

        const dtcgPalette = getPalette(result, "primary")
        const token500 = getToken(dtcgPalette, "500")
        const extensions = token500?.$extensions?.[EXTENSION_NAMESPACE]

        expect(extensions).toEqual({
          position: 500,
          formattedValue: "#2d72d2"
        })
      }))

    it.effect("should generate hex fallback when possible", () =>
      Effect.gen(function*() {
        const palette = makePaletteResult("primary")
        const result = yield* paletteResultToDTCG(palette)

        const dtcgPalette = getPalette(result, "primary")
        const token500 = getToken(dtcgPalette, "500")

        // Hex fallback should be present and valid
        expect(token500?.$value?.hex).toMatch(/^#[0-9a-f]{6}$/i)
      }))
  })

  describe("batchResultToDTCG", () => {
    it.effect("should transform BatchResult to DTCG format", () =>
      Effect.gen(function*() {
        const batch = makeBatchResult()
        const result = yield* batchResultToDTCG(batch)

        // Should have both palettes
        expect(result).toHaveProperty("primary")
        expect(result).toHaveProperty("secondary")

        // Should have root-level metadata
        expect(result).toHaveProperty("$description", "test-batch")
        expect(result).toHaveProperty("$extensions")
      }))

    it.effect("should include batch metadata in extensions", () =>
      Effect.gen(function*() {
        const batch = makeBatchResult()
        const result = yield* batchResultToDTCG(batch)

        const extensions = result.$extensions?.[EXTENSION_NAMESPACE]

        expect(extensions).toHaveProperty("outputFormat", "hex")
        expect(extensions).toHaveProperty("generatedAt", "2024-01-15T12:00:00.000Z")
      }))

    it.effect("should include failures in batch extensions when present", () =>
      Effect.gen(function*() {
        const batch: BatchResult = {
          ...makeBatchResult(),
          failures: [
            { color: "#invalid", stop: 500, error: "Failed to generate" }
          ]
        }
        const result = yield* batchResultToDTCG(batch)

        const extensions = result.$extensions?.[EXTENSION_NAMESPACE]

        expect(extensions).toHaveProperty("failures")
        expect(isBatchExtensionMetadata(extensions) && extensions.failures).toBeTruthy()
        if (isBatchExtensionMetadata(extensions) && extensions.failures !== undefined) {
          expect(extensions.failures).toHaveLength(1)
        }
      }))

    it.effect("should not include failures key when empty", () =>
      Effect.gen(function*() {
        const batch = makeBatchResult()
        const result = yield* batchResultToDTCG(batch)

        const extensions = result.$extensions?.[EXTENSION_NAMESPACE]

        expect(extensions).not.toHaveProperty("failures")
      }))
  })
})
