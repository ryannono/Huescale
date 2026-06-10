/**
 * Final Palette Builder
 *
 * Encodes the complete Blueprint BP7 intent-palette formula as one reproducible
 * pipeline so the recipe is never lost. Starting from a single source pattern
 * (orange), it produces every intent ramp in both light and dark modes:
 *
 *   1. LIGHT (chromatic) — take orange's optical appearance (its per-stop OKLCH
 *      lightness/chroma progression) and apply it to each hue's 500 anchor.
 *      Orange is the reference; blue/green/red are targets.
 *   2. LIGHT (grey) — loaded from patterns/gray-source.json, the approved source
 *      of truth. It was originally derived via Helmholtz-Kohlrausch lightness
 *      compensation (hue 257, chroma 0.025) off the orange reference, with the
 *      800–1000 stops hand-tuned afterward.
 *   3. DARK (all hues) — derive each light stop via CIECAM02 simultaneous-contrast
 *      compensation, adapting from a white background (#ffffff) to black (#000000)
 *      with an effective background luminance Yb=15.
 *   4. white / black — fixed alpha ramps over #ffffff and #000105 respectively.
 *
 * The script writes palette.final.json and prints a validation table comparing
 * every generated value against the approved Figma swatches (the oracle below).
 *
 * Usage:
 *   pnpm dlx tsx scripts/build-final-palette.ts
 */

import { FileSystem } from "@effect/platform"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import * as culori from "culori"
import { Array as Arr, Effect } from "effect"
import { applyOpticalAppearance, oklchToHex, parseColorStringToOKLCH } from "../src/domain/color/color.js"
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

/** Stop where each anchor color sits in its ramp. */
const ANCHOR_STOP = 500

/**
 * Appearance reference: orange, anchored at the source pattern's 500 (#BD5200).
 * Supplies the uniform lightness + chroma for every hue's 500 anchor — each hue
 * keeps only its own hue angle (from its `.3` color), so all 500 anchors share
 * L and C and differ only in H.
 */
const ORANGE_REFERENCE = "#BD5200"

/**
 * Chromatic hue anchors at stop 500. Each anchor supplies only its hue (taken from
 * the hue's old BP `.3` color); the orange reference supplies the shared lightness
 * + chroma, and the orange pattern defines the ramp curve.
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
  { name: "sepia", anchor: "#946638" },
] as const

/** Dark-mode derivation: adapt light colors from a white bg to a black bg. */
const DARK_SOURCE_BG = "#ffffff"
const DARK_TARGET_BG = "#000000"

/** Alpha ramp definitions for the two neutral overlay scales. */
const ALPHA_RAMPS = {
  white: {
    base: "#ffffff",
    light: [0.06, 0.12, 0.2, 0.3, 0.5, 0.8, 0.85, 0.9, 0.95, 1],
    dark: [0.07, 0.11, 0.16, 0.3, 0.5, 0.8, 0.85, 0.9, 0.95, 1],
  },
  black: {
    base: "#000105",
    light: [0.025, 0.09, 0.12, 0.3, 0.5, 0.8, 0.85, 0.9, 0.95, 1],
    dark: [0.03, 0.1, 0.2, 0.3, 0.5, 0.8, 0.85, 0.9, 0.95, 1],
  },
} as const

// ============================================================================
// Validation Oracle — the approved Figma swatches
// ============================================================================

/**
 * Validation oracle: approved Figma swatches. orange/blue/red/grey are pinned to
 * Figma; green and the extended hues are generated fresh from their `.3` anchors
 * (no approved Figma yet).
 */
const ORACLE: Readonly<Record<string, ReadonlyArray<{ position: number; light: string; dark: string }>>> = {
  orange: [
    { position: 100, light: "#fcdbcb", dark: "#f7d1bf" },
    { position: 200, light: "#f8b695", dark: "#eca480" },
    { position: 300, light: "#eb9265", dark: "#d77b4c" },
    { position: 400, light: "#d77139", dark: "#bb571e" },
    { position: 500, light: "#bd5200", dark: "#9a3700" },
    { position: 600, light: "#9e3600", dark: "#771c00" },
    { position: 700, light: "#782300", dark: "#520c00" },
    { position: 800, light: "#531200", dark: "#300200" },
    { position: 900, light: "#2f0300", dark: "#140000" },
    { position: 1000, light: "#0b0100", dark: "#010000" },
  ],
  blue: [
    { position: 100, light: "#d1e5ff", dark: "#c5ddfb" },
    { position: 200, light: "#a3caff", dark: "#8dbaf7" },
    { position: 300, light: "#7aaef9", dark: "#5d98eb" },
    { position: 400, light: "#5591e8", dark: "#3476d3" },
    { position: 500, light: "#3475d0", dark: "#0a58b4" },
    { position: 600, light: "#1759b1", dark: "#003b8f" },
    { position: 700, light: "#003f8d", dark: "#002369" },
    { position: 800, light: "#002864", dark: "#001041" },
    { position: 900, light: "#001338", dark: "#00031c" },
    { position: 1000, light: "#00030d", dark: "#000002" },
  ],
  red: [
    { position: 100, light: "#fed8d5", dark: "#f9ceca" },
    { position: 200, light: "#fcb0ac", dark: "#f09e9a" },
    { position: 300, light: "#ef8b87", dark: "#db7370" },
    { position: 400, light: "#db6866", dark: "#bf4d4d" },
    { position: 500, light: "#c14849", dark: "#9e2c31" },
    { position: 600, light: "#a22b30", dark: "#7b0f1a" },
    { position: 700, light: "#7e111c", dark: "#560009" },
    { position: 800, light: "#58010c", dark: "#330002" },
    { position: 900, light: "#310004", dark: "#150000" },
    { position: 1000, light: "#0b0101", dark: "#020000" },
  ],
  grey: [
    { position: 100, light: "#e5f0ff", dark: "#deebfd" },
    { position: 200, light: "#c7d2e1", dark: "#b8c5d6" },
    { position: 300, light: "#aab5c3", dark: "#95a1b1" },
    { position: 400, light: "#8e98a6", dark: "#75808e" },
    { position: 500, light: "#727c8a", dark: "#57616f" },
    { position: 600, light: "#57616f", dark: "#3c4552" },
    { position: 700, light: "#3e4754", dark: "#252c37" },
    { position: 800, light: "#242c39", dark: "#0f151f" },
    { position: 900, light: "#161e2b", dark: "#050a14" },
    { position: 1000, light: "#0a121e", dark: "#01040a" },
  ],
}

// ============================================================================
// Types
// ============================================================================

/** A single resolved palette stop in both modes. */
interface FinalStop {
  readonly position: number
  readonly light: string
  readonly dark: string
}

/** A named ramp of resolved stops. */
interface FinalHue {
  readonly name: string
  readonly stops: ReadonlyArray<FinalStop>
}

/** A light stop carrying just enough to derive its dark counterpart. */
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
  loadPattern: ReturnType<typeof makeFilePatternLoader>,
) =>
  Effect.gen(function*() {
    const pattern = yield* loadPattern(SOURCE_PATTERN_PATH)
    const target = yield* parseColorStringToOKLCH(hue.anchor)
    const stamped = yield* applyOpticalAppearance(reference, target)
    const stampedHex = yield* oklchToHex(stamped)

    const result = yield* generatePaletteWithPattern(
      { inputColor: stampedHex, anchorStop: ANCHOR_STOP, outputFormat: "hex", paletteName: hue.name },
      pattern,
    )

    const stops: ReadonlyArray<LightStop> = Arr.map(result.stops, (stop) => ({
      position: stop.position,
      hex: normalizeHex(stop.value),
    }))

    return { name: hue.name, stops }
  })

/** Load grey's light ramp from the approved source-of-truth pattern. */
const loadGreyLight = (fs: FileSystem.FileSystem) =>
  Effect.gen(function*() {
    const content = yield* fs.readFileString(GREY_SOURCE_PATH)
    const json = yield* Effect.try({
      try: (): unknown => JSON.parse(content),
      catch: (cause) => new Error(`Failed to parse ${GREY_SOURCE_PATH}: ${String(cause)}`),
    })
    const parsed = yield* ExamplePaletteRequest(json)
    const stops = Arr.map(parsed.stops, (s) => ({ position: s.position, hex: normalizeHex(s.hex) }))
    return { name: "grey", stops }
  })

// ============================================================================
// Dark Derivation
// ============================================================================

/** Derive a hue's dark ramp from its light ramp via CIECAM02 contrast compensation. */
const deriveDark = (
  light: { readonly name: string; readonly stops: ReadonlyArray<LightStop> },
  sourceBg: OKLCHColor,
  targetBg: OKLCHColor,
): Effect.Effect<FinalHue, never> =>
  Effect.gen(function*() {
    const stops = yield* Effect.forEach(light.stops, (stop) =>
      Effect.gen(function*() {
        const lightOklch = yield* parseColorStringToOKLCH(stop.hex)
        const darkOklch = yield* compensateForBackground(lightOklch, sourceBg, targetBg)
        const darkHex = yield* oklchToHex(darkOklch)
        return { position: stop.position, light: stop.hex, dark: normalizeHex(darkHex) }
      }))
    return { name: light.name, stops }
  }).pipe(Effect.orDie)

/** Build a fixed alpha ramp hue (no derivation — light/dark are authored). */
const buildAlphaHue = (
  name: "white" | "black",
): FinalHue => {
  const ramp = ALPHA_RAMPS[name]
  const stops = Arr.zip(STOP_POSITIONS, Arr.zip(ramp.light, ramp.dark)).map(([position, [lightA, darkA]]) => ({
    position,
    light: formatAlphaHex(ramp.base, lightA),
    dark: formatAlphaHex(ramp.base, darkA),
  }))
  return { name, stops }
}

// ============================================================================
// Validation
// ============================================================================

/** Compare a generated hue against the oracle; return mismatch lines. */
const validateHue = (hue: FinalHue): ReadonlyArray<string> => {
  const expected = ORACLE[hue.name]
  if (expected === undefined) return []
  return hue.stops.flatMap((stop) => {
    const want = expected.find((e) => e.position === stop.position)
    if (want === undefined) return []
    const lines: Array<string> = []
    if (normalizeHex(want.light) !== stop.light) {
      lines.push(`  ✗ ${hue.name}.${stop.position} light: got ${stop.light}, want ${normalizeHex(want.light)}`)
    }
    if (normalizeHex(want.dark) !== stop.dark) {
      lines.push(`  ✗ ${hue.name}.${stop.position} dark:  got ${stop.dark}, want ${normalizeHex(want.dark)}`)
    }
    return lines
  })
}

/** Render a compact per-hue summary line. */
const summarizeHue = (hue: FinalHue): string => {
  const mismatches = validateHue(hue).length
  const status = ORACLE[hue.name] === undefined ? "(no oracle)" : mismatches === 0 ? "✓ matches Figma" : `✗ ${mismatches} mismatch(es)`
  return `  ${hue.name.padEnd(7)} ${hue.stops.length} stops  ${status}`
}

// ============================================================================
// Output
// ============================================================================

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
      hueAnchors: Object.fromEntries(CHROMATIC_ANCHORS.map((h) => [h.name, h.anchor])),
    },
    grey: {
      method: "helmholtz-kohlrausch (hue 257, chroma 0.025) off the orange reference; 800–1000 hand-tuned",
      source: GREY_SOURCE_PATH,
    },
    dark: {
      method: "ciecam02-contrast-compensation",
      sourceBg: DARK_SOURCE_BG,
      targetBg: DARK_TARGET_BG,
      yb: 15,
    },
    alphaRamps: ALPHA_RAMPS,
  },
  hues: Object.fromEntries(
    hues.map((hue) => [
      hue.name,
      Object.fromEntries(hue.stops.map((stop) => [stop.position, { light: stop.light, dark: stop.dark }])),
    ]),
  ),
})

// ============================================================================
// Main
// ============================================================================

const OUTPUT_PATH = "palette.final.json"

const main = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const loadPattern = makeFilePatternLoader(fs)

  yield* Effect.log("Generating light ramps (orange reference → blue/green/red)...")
  const reference = yield* parseColorStringToOKLCH(ORANGE_REFERENCE)
  const chromaticLight = yield* Effect.forEach(
    CHROMATIC_ANCHORS,
    (hue) => generateChromaticLight(hue, reference, loadPattern),
    { concurrency: "unbounded" },
  )

  yield* Effect.log("Loading grey light ramp (source of truth)...")
  const greyLight = yield* loadGreyLight(fs)

  yield* Effect.log("Deriving dark ramps (CIECAM02 contrast compensation)...")
  const sourceBg = yield* parseColorStringToOKLCH(DARK_SOURCE_BG)
  const targetBg = yield* parseColorStringToOKLCH(DARK_TARGET_BG)
  const chromaticHues = yield* Effect.forEach(
    [...chromaticLight, greyLight],
    (light) => deriveDark(light, sourceBg, targetBg),
    { concurrency: "unbounded" },
  )

  const alphaHues: ReadonlyArray<FinalHue> = [buildAlphaHue("white"), buildAlphaHue("black")]
  const allHues = [...chromaticHues, ...alphaHues]

  const output = buildOutput(allHues)
  yield* fs.writeFileString(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n")
  yield* Effect.log(`Wrote ${OUTPUT_PATH}`)

  yield* Effect.log("\nValidation against Figma swatches:")
  yield* Effect.forEach(allHues, (hue) => Effect.log(summarizeHue(hue)))

  const mismatches = allHues.flatMap(validateHue)
  if (mismatches.length > 0) {
    yield* Effect.log("\nMismatches:")
    yield* Effect.forEach(mismatches, (line) => Effect.log(line))
  } else {
    yield* Effect.log("\nAll chromatic + grey ramps reproduce the Figma swatches exactly.")
  }
})

NodeRuntime.runMain(
  main.pipe(
    Effect.provide(NodeContext.layer),
    Effect.catchAll((error) => Effect.log(`Error: ${error}`)),
  ),
)
