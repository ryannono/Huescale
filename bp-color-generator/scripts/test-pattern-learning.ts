/**
 * Test script to verify pattern learning from example palette
 */

import { Effect } from "effect"
import { smoothPattern } from "../src/domain/math/interpolation.js"
import { learnFromSinglePalette } from "../src/programs/learn-patterns.js"

const program = Effect.gen(function*() {
  console.log("Loading example blue palette...")

  const result = yield* learnFromSinglePalette("test/fixtures/palettes/example-blue.json")

  console.log("\n✅ Palette loaded:", result.palette.name)
  console.log("\n📊 Extracted Pattern (Raw):")
  console.log(`  Reference Stop: ${result.pattern.referenceStop}`)
  console.log(`  Confidence: ${result.pattern.metadata.confidence}`)
  console.log(`  Source Count: ${result.pattern.metadata.sourceCount}`)

  console.log("\n🎨 Raw Transformations (relative to stop 500):")
  for (const [stop, transform] of Object.entries(result.pattern.transforms)) {
    console.log(`  Stop ${stop}:`)
    console.log(`    L: ×${transform.lightnessMultiplier.toFixed(3)}`)
    console.log(`    C: ×${transform.chromaMultiplier.toFixed(3)}`)
    console.log(`    H: ${transform.hueShiftDegrees >= 0 ? "+" : ""}${transform.hueShiftDegrees.toFixed(1)}°`)
  }

  // Smooth the pattern
  const smoothed = smoothPattern(result.pattern)

  console.log("\n✨ Smoothed Transformations:")
  for (const [stop, transform] of Object.entries(smoothed.transforms)) {
    console.log(`  Stop ${stop}:`)
    console.log(`    L: ×${transform.lightnessMultiplier.toFixed(3)} (linear)`)
    console.log(`    C: ×${transform.chromaMultiplier.toFixed(3)} (smooth curve)`)
    console.log(
      `    H: ${transform.hueShiftDegrees >= 0 ? "+" : ""}${transform.hueShiftDegrees.toFixed(1)}° (consistent)`
    )
  }

  console.log("\n🎯 Original Colors (OKLCH):")
  for (const stop of result.palette.stops) {
    console.log(
      `  ${stop.position}: L=${stop.color.l.toFixed(3)} C=${stop.color.c.toFixed(3)} H=${stop.color.h.toFixed(1)}°`
    )
  }
})

Effect.runPromise(program).catch(console.error)
