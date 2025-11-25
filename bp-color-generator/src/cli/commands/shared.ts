/**
 * Shared command logic for palette generation
 */

import * as clack from "@clack/prompts"
import { Effect } from "effect"
import { generatePalette } from "../../programs/generate-palette.js"
import type { ColorSpace } from "../../schemas/color.js"
import { GeneratePaletteInput } from "../../schemas/generate-palette.js"
import type { StopPosition } from "../../schemas/palette.js"

/**
 * Generate and display palette
 */
export const generateAndDisplay = ({
  color,
  format,
  name,
  pattern,
  stop
}: {
  color: string
  format: ColorSpace
  name: string
  pattern: string
  stop: StopPosition
}) =>
  Effect.gen(function*() {
    // Validate and create input using schema
    const input = yield* GeneratePaletteInput({
      anchorStop: stop,
      inputColor: color,
      outputFormat: format,
      paletteName: name,
      patternSource: pattern
    })

    // Generate palette
    const result = yield* generatePalette(input)

    return result
  })

/**
 * Display palette with simple formatting (for direct CLI)
 */
export const displayPaletteSimple = (
  result: Effect.Effect.Success<ReturnType<typeof generateAndDisplay>>
) =>
  Effect.sync(() => {
    console.log(`\n🎨 Generated Palette: ${result.name}`)
    console.log(`   Input: ${result.inputColor} at stop ${result.anchorStop}`)
    console.log(`   Format: ${result.outputFormat}\n`)

    for (const stop of result.stops) {
      console.log(`   ${stop.position}: ${stop.value}`)
    }
    console.log()
  })

/**
 * Display palette with clack formatting (for interactive CLI)
 */
export const displayPaletteInteractive = (
  result: Effect.Effect.Success<ReturnType<typeof generateAndDisplay>>
) =>
  Effect.sync(() => {
    clack.note(
      `Input: ${result.inputColor} at stop ${result.anchorStop}\nFormat: ${result.outputFormat}\n\n${
        result.stops.map((s) => `  ${s.position}: ${s.value}`).join("\n")
      }`,
      `Palette: ${result.name}`
    )

    clack.outro("Done! 🎉")
  })
