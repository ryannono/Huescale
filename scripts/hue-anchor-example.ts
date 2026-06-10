/**
 * Hue-anchor exploration: generate one hue's light + dark ramp from a chosen
 * anchor color, reusing the production pipeline (orange reference for L/C, the
 * orange pattern for the ramp curve, CIECAM02 for dark). Prints JSON to stdout.
 *
 * Usage:
 *   npx tsx scripts/hue-anchor-example.ts "#d1980b" "#f0b726"
 */

import { FileSystem } from "@effect/platform"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { applyOpticalAppearance, oklchToHex, parseColorStringToOKLCH } from "../src/domain/color/color.js"
import { compensateForBackground } from "../src/domain/color/contrast-compensation.js"
import { makeFilePatternLoader } from "../src/io/patternLoader.js"
import { generatePaletteWithPattern } from "../src/usecases/generatePalette.js"

const REFERENCE = "#BD5200"
const PATTERN_PATH = "patterns/default.json"

const rampFromAnchor = (anchor: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const pattern = yield* makeFilePatternLoader(fs)(PATTERN_PATH)
    const reference = yield* parseColorStringToOKLCH(REFERENCE)
    const target = yield* parseColorStringToOKLCH(anchor)
    const stampedHex = yield* oklchToHex(yield* applyOpticalAppearance(reference, target))

    const result = yield* generatePaletteWithPattern(
      { inputColor: stampedHex, anchorStop: 500, outputFormat: "hex", paletteName: "example" },
      pattern,
    )

    const white = yield* parseColorStringToOKLCH("#ffffff")
    const black = yield* parseColorStringToOKLCH("#000000")
    const stops = yield* Effect.forEach(result.stops, (stop) =>
      Effect.gen(function*() {
        const lightOklch = yield* parseColorStringToOKLCH(stop.value)
        const darkHex = yield* oklchToHex(yield* compensateForBackground(lightOklch, white, black))
        return { position: stop.position, light: stop.value.toLowerCase(), dark: darkHex.toLowerCase() }
      }))
    return { anchor, stops }
  })

const main = Effect.gen(function*() {
  const anchors = process.argv.slice(2)
  const ramps = yield* Effect.forEach(anchors, rampFromAnchor)
  yield* Effect.log(JSON.stringify(ramps))
}).pipe(Effect.orDie)

NodeRuntime.runMain(main.pipe(Effect.provide(NodeContext.layer)))
