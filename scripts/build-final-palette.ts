/**
 * Final Palette Builder
 *
 * Encodes the complete Blueprint BP7 intent-palette formula as one reproducible
 * pipeline so the recipe is never lost. Starting from a single source pattern
 * (orange), it produces every intent ramp in both light and dark modes:
 *
 *   1. LIGHT (chromatic) — orange supplies the chroma and rendered luminance for
 *      stop 500; each family keeps the hue angle from its old BP `.3` color, and
 *      the orange pattern expands the corrected anchor across all stops.
 *   2. LIGHT (grey) — loaded from patterns/gray-source.json, the approved source
 *      of truth. It was originally derived via Helmholtz-Kohlrausch lightness
 *      compensation (hue 257, chroma 0.025) off the orange reference, with the
 *      800–1000 stops hand-tuned afterward. One lightness adjustment aligns its
 *      500 with the chromatic families without changing the source curve.
 *   3. DARK (all hues) — derive each light stop via CIECAM02 simultaneous-contrast
 *      compensation, adapting from a white background (#ffffff) to black (#000000)
 *      with an effective background luminance Yb=15.
 *   4. white / black — fixed alpha ramps over #ffffff and #000105 respectively.
 *
 * The script writes palette.final.json after checking the shared foreground
 * stops against the WCAG contrast threshold for normal text.
 *
 * Usage:
 *   pnpm dlx tsx scripts/build-final-palette.ts
 */

import { FileSystem } from "@effect/platform"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import * as culori from "culori"
import { Array as Arr, Effect } from "effect"
import {
  applyOpticalAppearance,
  clamp,
  clampToGamut,
  matchRelativeLuminance,
  oklchToHex,
  parseColorStringToOKLCH
} from "../src/domain/color/color.js"
import type { OKLCHColor } from "../src/domain/color/color.schema.js"
import { compensateForBackground } from "../src/domain/color/contrast-compensation.js"
import { ExamplePaletteRequest, STOP_POSITIONS } from "../src/domain/palette/palette.schema.js"
import { makeFilePatternLoader } from "../src/io/patternLoader.js"
import { generatePaletteWithPattern } from "../src/usecases/generatePalette.js"

// ============================================================================
// Formula Constants — the recipe, encoded
// ============================================================================

/** Orange source pattern: defines the per-stop lightness/chroma/hue progression. */
const SOURCE_PATTERN_PATH = "patterns/default.json"

/** Grey light ramp: approved source of truth (H-K derived, 800–1000 hand-tuned). */
const GREY_SOURCE_PATH = "patterns/gray-source.json"

/** Softens grey's cool/blue cast by scaling OKLCH chroma (1 = unchanged, lower = more neutral). */
const GREY_CHROMA_SCALE = 0.6

/** Stop where each anchor color sits in its ramp. */
const ANCHOR_STOP = 500

/**
 * Appearance reference: orange, anchored at the source pattern's 500 (#BD5200).
 * Supplies the initial lightness and chroma for every hue's 500 anchor. After hue
 * transfer and gamut mapping, the generator adjusts lightness until the rendered
 * sRGB color matches this reference's relative luminance.
 */
const ORANGE_REFERENCE = "#BD5200"

/**
 * Chromatic hue anchors at stop 500. Each anchor supplies only its hue (taken from
 * the hue's old BP `.3` color); the orange reference supplies the initial lightness
 * and chroma plus the rendered-luminance target, and the orange pattern defines
 * the ramp curve.
 */
const CHROMATIC_ANCHORS = [
  { name: "orange", anchor: ORANGE_REFERENCE },
  { name: "blue", anchor: "#2d72d2" },
  { name: "green", anchor: "#238551" },
  { name: "red", anchor: "#cd4246" },
  { name: "vermilion", anchor: "#d33d17" },
  { name: "rose", anchor: "#db2c6f" },
  { name: "violet", anchor: "#9d3f9d" },
  { name: "indigo", anchor: "#7961db" },
  { name: "cerulean", anchor: "#147eb3" },
  { name: "turquoise", anchor: "#00a396" },
  { name: "forest", anchor: "#29a634" },
  { name: "lime", anchor: "#8eb125" },
  { name: "gold", anchor: "#d1980b" },
  { name: "sepia", anchor: "#946638" }
] as const

/** Dark-mode derivation: adapt light colors from a white bg to a black bg. */
const DARK_SOURCE_BG = "#ffffff"
const DARK_TARGET_BG = "#000000"

/** Alpha overlay scales, shared across light and dark (no dark override). */
const ALPHA_RAMPS = {
  white: {
    base: "#ffffff",
    opacity: [0.06, 0.12, 0.2, 0.3, 0.5, 0.8, 0.85, 0.9, 0.95, 1]
  },
  black: {
    base: "#000105",
    opacity: [0.025, 0.09, 0.12, 0.3, 0.5, 0.8, 0.85, 0.9, 0.95, 1]
  }
} as const

// ============================================================================
// Accessibility Invariants
// ============================================================================

/** Blueprint uses white text on solid intent surfaces in both modes. */
const SOLID_FOREGROUND = "#ffffff"

/** WCAG AA contrast threshold for normal text. */
const MINIMUM_TEXT_CONTRAST = 4.5

/** The lightest solid intent surface used in each mode. */
const FOREGROUND_STOPS = [
  { mode: "light", position: 500, getHex: (stop: FinalStop) => stop.light.hex },
  { mode: "dark", position: 400, getHex: (stop: FinalStop) => stop.dark.hex }
] as const

// ============================================================================
// Types
// ============================================================================

/** A resolved color in one mode: OKLCH (the canonical value) plus its sRGB hex fallback. */
interface PaletteValue {
  readonly oklch: OKLCHColor
  readonly hex: string
}

/** A single resolved palette stop in both modes. */
interface FinalStop {
  readonly position: number
  readonly light: PaletteValue
  readonly dark: PaletteValue
}

/** A named ramp of resolved stops. */
interface FinalHue {
  readonly name: string
  readonly stops: ReadonlyArray<FinalStop>
}

/** A light stop carrying its sRGB hex; OKLCH is derived from it for the token value and the dark mode. */
interface LightStop {
  readonly position: number
  readonly hex: string
}

// ============================================================================
// Pure Helpers
// ============================================================================

/** Lowercase a hex string for stable comparison. */
const normalizeHex = (hex: string): string => hex.toLowerCase()

/** Format a base color at a given alpha as #RRGGBB (alpha=1) or #RRGGBBAA. */
const formatAlphaHex = (baseHex: string, alpha: number): string => {
  const parsed = culori.rgb(culori.parse(baseHex))
  if (parsed === undefined) return baseHex
  const withAlpha = { ...parsed, alpha }
  return alpha >= 1 ? culori.formatHex(withAlpha) : culori.formatHex8(withAlpha)
}

const round = (value: number, places: number): number => {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

// ============================================================================
// Light Generation
// ============================================================================

/**
 * Generate a chromatic hue's light ramp: stamp the orange reference's optical
 * appearance onto the hue's anchor, then expand to all stops via the pattern.
 */
const generateChromaticLight = (
  hue: { readonly name: string; readonly anchor: string },
  reference: OKLCHColor,
  loadPattern: ReturnType<typeof makeFilePatternLoader>
) =>
  Effect.gen(function*() {
    const pattern = yield* loadPattern(SOURCE_PATTERN_PATH)
    const target = yield* parseColorStringToOKLCH(hue.anchor)
    const stamped = yield* applyOpticalAppearance(reference, target)
    const luminanceMatched = yield* matchRelativeLuminance(reference, stamped)
    const stampedHex = yield* oklchToHex(luminanceMatched)

    const result = yield* generatePaletteWithPattern(
      { inputColor: stampedHex, anchorStop: ANCHOR_STOP, outputFormat: "hex", paletteName: hue.name },
      pattern
    )

    const stops: ReadonlyArray<LightStop> = Arr.map(result.stops, (stop) => ({
      position: stop.position,
      hex: normalizeHex(stop.value)
    }))

    return { name: hue.name, stops }
  })

/**
 * Load grey's light ramp from the approved source-of-truth pattern, scaling its
 * OKLCH chroma toward neutral to soften the cool/blue cast (lightness and hue kept).
 */
const loadGreyLight = (fs: FileSystem.FileSystem, reference: OKLCHColor) =>
  Effect.gen(function*() {
    const content = yield* fs.readFileString(GREY_SOURCE_PATH)
    const json = yield* Effect.try({
      try: (): unknown => JSON.parse(content),
      catch: (cause) => new Error(`Failed to parse ${GREY_SOURCE_PATH}: ${String(cause)}`)
    })
    const parsed = yield* ExamplePaletteRequest(json)
    const scaledStops = yield* Effect.forEach(parsed.stops, (stop) =>
      Effect.gen(function*() {
        const color = yield* parseColorStringToOKLCH(stop.hex)
        return { position: stop.position, color: { ...color, c: color.c * GREY_CHROMA_SCALE } }
      }))

    const referenceStop = scaledStops.find((stop) => stop.position === ANCHOR_STOP)
    if (referenceStop === undefined) {
      return yield* Effect.fail(new Error(`Grey source is missing stop ${ANCHOR_STOP}`))
    }

    const luminanceMatched = yield* matchRelativeLuminance(reference, referenceStop.color)
    const lightnessAdjustment = luminanceMatched.l - referenceStop.color.l
    const stops = yield* Effect.forEach(scaledStops, (stop) =>
      Effect.gen(function*() {
        const adjusted = yield* clampToGamut({
          ...stop.color,
          l: clamp(stop.color.l + lightnessAdjustment, 0, 1)
        })
        const hex = yield* oklchToHex(adjusted)
        return { position: stop.position, hex: normalizeHex(hex) }
      }))

    return { name: "grey", stops }
  })

// ============================================================================
// Dark Derivation
// ============================================================================

/** Derive a hue's dark ramp from its light ramp via CIECAM02 contrast compensation. */
const deriveDark = (
  light: { readonly name: string; readonly stops: ReadonlyArray<LightStop> },
  sourceBg: OKLCHColor,
  targetBg: OKLCHColor
): Effect.Effect<FinalHue, never> =>
  Effect.gen(function*() {
    const stops = yield* Effect.forEach(light.stops, (stop) =>
      Effect.gen(function*() {
        const lightOklch = yield* parseColorStringToOKLCH(stop.hex)
        const darkOklch = yield* compensateForBackground(lightOklch, sourceBg, targetBg)
        const darkHex = yield* oklchToHex(darkOklch)
        return {
          position: stop.position,
          light: { oklch: lightOklch, hex: stop.hex },
          dark: { oklch: darkOklch, hex: normalizeHex(darkHex) }
        }
      }))
    return { name: light.name, stops }
  }).pipe(Effect.orDie)

/** Build a fixed alpha ramp hue: one authored opacity scale, identical in both modes. */
const buildAlphaHue = (name: "white" | "black"): Effect.Effect<FinalHue, never> =>
  Effect.gen(function*() {
    const ramp = ALPHA_RAMPS[name]
    const base = yield* parseColorStringToOKLCH(ramp.base)
    const stops = Arr.zip(STOP_POSITIONS, ramp.opacity).map(([position, alpha]) => {
      const value = { oklch: { ...base, alpha }, hex: formatAlphaHex(ramp.base, alpha) }
      return { position, light: value, dark: value }
    })
    return { name, stops }
  }).pipe(Effect.orDie)

// ============================================================================
// Validation
// ============================================================================

interface ContrastResult {
  readonly hue: string
  readonly mode: "light" | "dark"
  readonly position: number
  readonly hex: string
  readonly contrast: number
}

/** Measure white foreground contrast at each mode's lightest solid surface stop. */
const measureForegroundContrast = (hues: ReadonlyArray<FinalHue>): ReadonlyArray<ContrastResult> =>
  hues.flatMap((hue) =>
    FOREGROUND_STOPS.map(({ getHex, mode, position }) => {
      const stop = hue.stops.find((candidate) => candidate.position === position)
      if (stop === undefined) throw new Error(`${hue.name} is missing stop ${position}`)
      const hex = getHex(stop)
      return { hue: hue.name, mode, position, hex, contrast: culori.wcagContrast(SOLID_FOREGROUND, hex) }
    })
  )

/** Fail generation if a shared foreground stop does not meet WCAG AA for normal text. */
const assertForegroundContrast = (hues: ReadonlyArray<FinalHue>) =>
  Effect.sync(() => {
    const results = measureForegroundContrast(hues)
    const failures = results.filter(({ contrast }) => contrast < MINIMUM_TEXT_CONTRAST)

    if (failures.length > 0) {
      const details = failures
        .map(({ contrast, hex, hue, mode, position }) => `${mode} ${hue}.${position} ${hex}: ${contrast.toFixed(2)}:1`)
        .join("\n")
      throw new Error(`Foreground contrast fell below ${MINIMUM_TEXT_CONTRAST}:1:\n${details}`)
    }

    return results
  })

// ============================================================================
// Output
// ============================================================================

/** Build a DTCG OKLCH color value (components rounded) with an sRGB hex fallback. */
const toDTCG = (value: PaletteValue) => {
  const components = [round(value.oklch.l, 4), round(value.oklch.c, 4), round(value.oklch.h, 2)]
  return value.oklch.alpha < 1
    ? { colorSpace: "oklch", components, alpha: round(value.oklch.alpha, 4), hex: value.hex }
    : { colorSpace: "oklch", components, hex: value.hex }
}

/** Shape the final palette into a serializable object with the formula recorded. */
const buildOutput = (hues: ReadonlyArray<FinalHue>) => ({
  $description:
    "Blueprint BP7 intent palette (final). Light = orange appearance pattern transformed onto each hue's 500 anchor; grey from gray-source.json. Dark = CIECAM02 simultaneous-contrast compensation (#ffffff→#000000, Yb=15). white/black are fixed alpha ramps.",
  formula: {
    light: {
      method: "optical-appearance-transform",
      sourcePattern: SOURCE_PATTERN_PATH,
      reference: ORANGE_REFERENCE,
      anchorStop: ANCHOR_STOP,
      hueAnchors: Object.fromEntries(CHROMATIC_ANCHORS.map((h) => [h.name, h.anchor]))
    },
    grey: {
      method: "helmholtz-kohlrausch (hue 257, chroma 0.025) off the orange reference; 800–1000 hand-tuned",
      source: GREY_SOURCE_PATH,
      chromaScale: GREY_CHROMA_SCALE
    },
    dark: {
      method: "ciecam02-contrast-compensation",
      sourceBg: DARK_SOURCE_BG,
      targetBg: DARK_TARGET_BG,
      yb: 15
    },
    alphaRamps: ALPHA_RAMPS
  },
  hues: Object.fromEntries(
    hues.map((hue) => [
      hue.name,
      Object.fromEntries(
        hue.stops.map((stop) => [stop.position, { light: toDTCG(stop.light), dark: toDTCG(stop.dark) }])
      )
    ])
  )
})

// ============================================================================
// Main
// ============================================================================

const OUTPUT_PATH = "palette.final.json"

const main = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const loadPattern = makeFilePatternLoader(fs)

  yield* Effect.log("Generating light ramps (orange supplies uniform L+C; hue per color from its .3)...")
  const reference = yield* parseColorStringToOKLCH(ORANGE_REFERENCE)
  const chromaticLight = yield* Effect.forEach(
    CHROMATIC_ANCHORS,
    (hue) => generateChromaticLight(hue, reference, loadPattern),
    { concurrency: "unbounded" }
  )

  yield* Effect.log("Loading grey light ramp (source of truth)...")
  const greyLight = yield* loadGreyLight(fs, reference)

  yield* Effect.log("Deriving dark ramps (CIECAM02 contrast compensation)...")
  const sourceBg = yield* parseColorStringToOKLCH(DARK_SOURCE_BG)
  const targetBg = yield* parseColorStringToOKLCH(DARK_TARGET_BG)
  const colorHues = yield* Effect.forEach(
    [...chromaticLight, greyLight],
    (light) => deriveDark(light, sourceBg, targetBg),
    { concurrency: "unbounded" }
  )

  const alphaHues = yield* Effect.forEach(["white", "black"] as const, buildAlphaHue)
  const contrastResults = yield* assertForegroundContrast(colorHues)
  yield* Effect.log("\nWhite foreground contrast:")
  yield* Effect.forEach(
    contrastResults,
    ({ contrast, hex, hue, mode, position }) =>
      Effect.log(`  ${mode.padEnd(5)} ${hue.padEnd(10)} ${position} ${hex}  ${contrast.toFixed(2)}:1`)
  )

  const allHues = [...colorHues, ...alphaHues]

  const output = buildOutput(allHues)
  yield* fs.writeFileString(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n")
  yield* Effect.log(`Wrote ${OUTPUT_PATH}`)

  yield* Effect.log(`All shared foreground stops meet ${MINIMUM_TEXT_CONTRAST}:1.`)
})

NodeRuntime.runMain(
  main.pipe(
    Effect.provide(NodeContext.layer),
    Effect.catchAll((error) => Effect.log(`Error: ${error}`))
  )
)
