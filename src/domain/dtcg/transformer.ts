/**
 * DTCG Transformer Functions
 *
 * Transforms internal palette data structures to DTCG 2025.10 compliant format.
 * Reuses existing color and palette domain types.
 */

import { Array as Arr, Effect } from "effect"
import { oklchToHex } from "../color/color.js"
import type { HexColor } from "../color/color.schema.js"
import type { BatchResult, FormattedStop, PaletteResult } from "../palette/palette.schema.js"
import type {
  BatchExtensionMetadata,
  DTCGColorToken,
  DTCGColorValue,
  DTCGExportDocument,
  DTCGPalette,
  PaletteExtensionMetadata,
  StopExtensionMetadata
} from "./dtcg.schema.js"
import { EXTENSION_NAMESPACE } from "./dtcg.schema.js"

// ============================================================================
// Public API
// ============================================================================

/**
 * Transform a PaletteResult to DTCG format.
 */
export const paletteResultToDTCG = (palette: PaletteResult): Effect.Effect<DTCGExportDocument, never> =>
  Effect.gen(function*() {
    const hexFallbacks = yield* generateHexFallbacks(palette.stops)
    return {
      [palette.name]: buildPalette(palette, hexFallbacks)
    }
  })

/**
 * Transform a BatchResult to DTCG format.
 */
export const batchResultToDTCG = (batch: BatchResult): Effect.Effect<DTCGExportDocument, never> =>
  Effect.gen(function*() {
    const palettesWithHex = yield* Effect.forEach(
      batch.palettes,
      (palette) =>
        generateHexFallbacks(palette.stops).pipe(
          Effect.map((hexFallbacks) => ({ hexFallbacks, palette }))
        ),
      { concurrency: "unbounded" }
    )

    return {
      $description: batch.groupName,
      $extensions: {
        [EXTENSION_NAMESPACE]: buildBatchExtension(batch)
      },
      ...buildPalettesRecord(palettesWithHex)
    }
  })

// ============================================================================
// Hex Fallback Generation
// ============================================================================

/** Generate hex fallback for a stop, returning undefined on failure */
const generateHexFallback = (stop: FormattedStop): Effect.Effect<HexColor | undefined, never> =>
  oklchToHex(stop.color).pipe(Effect.orElseSucceed((): HexColor | undefined => undefined))

/** Generate hex fallbacks for all stops */
const generateHexFallbacks = (
  stops: ReadonlyArray<FormattedStop>
): Effect.Effect<ReadonlyArray<HexColor | undefined>, never> =>
  Effect.forEach(stops, generateHexFallback, { concurrency: "unbounded" })

// ============================================================================
// Palette Builders
// ============================================================================

/** Build DTCG palette from PaletteResult with hex fallbacks */
const buildPalette = (
  palette: PaletteResult,
  hexFallbacks: ReadonlyArray<HexColor | undefined>
): DTCGPalette => ({
  $type: "color",
  $extensions: {
    [EXTENSION_NAMESPACE]: buildPaletteExtension(palette)
  },
  ...buildStopTokensRecord(palette.stops, hexFallbacks)
})

/** Build palettes record from palettes with hex fallbacks */
const buildPalettesRecord = (
  palettesWithHex: ReadonlyArray<{
    readonly hexFallbacks: ReadonlyArray<HexColor | undefined>
    readonly palette: PaletteResult
  }>
): Record<string, DTCGPalette> =>
  Object.fromEntries(
    Arr.map(palettesWithHex, ({ hexFallbacks, palette }) => [palette.name, buildPalette(palette, hexFallbacks)])
  )

/** Build stop tokens record from stops and hex fallbacks */
const buildStopTokensRecord = (
  stops: ReadonlyArray<FormattedStop>,
  hexFallbacks: ReadonlyArray<HexColor | undefined>
): Record<string, DTCGColorToken> =>
  Object.fromEntries(
    Arr.map(Arr.zip(stops, hexFallbacks), ([stop, hex]) => [String(stop.position), buildColorToken(stop, hex)])
  )

// ============================================================================
// Token Builders
// ============================================================================

/** Build DTCG color token from FormattedStop */
const buildColorToken = (stop: FormattedStop, hex: HexColor | undefined): DTCGColorToken => ({
  $type: "color",
  $value: buildColorValue(stop, hex),
  $extensions: {
    [EXTENSION_NAMESPACE]: buildStopExtension(stop)
  }
})

/** Build DTCG color value from FormattedStop */
const buildColorValue = (stop: FormattedStop, hex: HexColor | undefined): DTCGColorValue => ({
  colorSpace: "oklch",
  components: [stop.color.l, stop.color.c, stop.color.h],
  ...(stop.color.alpha !== 1 ? { alpha: stop.color.alpha } : {}),
  ...(hex !== undefined ? { hex } : {})
})

// ============================================================================
// Extension Builders
// ============================================================================

/** Build stop extension from FormattedStop */
const buildStopExtension = (stop: FormattedStop): StopExtensionMetadata => ({
  position: stop.position,
  formattedValue: stop.value
})

/** Build palette extension from PaletteResult */
const buildPaletteExtension = (palette: PaletteResult): PaletteExtensionMetadata => ({
  inputColor: palette.inputColor,
  anchorStop: palette.anchorStop,
  outputFormat: palette.outputFormat
})

/** Build batch extension from BatchResult */
const buildBatchExtension = (batch: BatchResult): BatchExtensionMetadata => ({
  outputFormat: batch.outputFormat,
  generatedAt: batch.generatedAt,
  ...(Arr.isNonEmptyReadonlyArray(batch.failures) ? { failures: batch.failures } : {})
})
