/**
 * Single palette mode handler
 */

import * as clack from "@clack/prompts"
import { Effect, Option as O } from "effect"
import { promptForPaletteName } from "../../prompts.js"
import { displayPaletteInteractive, displayPaletteSimple, generateAndDisplay } from "../shared.js"
import { validateColor, validateFormat, validateStop } from "./validation.js"

/**
 * Handle single palette mode generation
 */
export const handleSingleMode = ({
  colorOpt,
  formatOpt,
  isInteractive,
  nameOpt,
  pattern,
  stopOpt
}: {
  colorOpt: O.Option<string>
  formatOpt: O.Option<string>
  isInteractive: boolean
  nameOpt: O.Option<string>
  pattern: string
  stopOpt: O.Option<number>
}) =>
  Effect.gen(function*() {
    if (isInteractive) {
      clack.intro("🎨 BP Color Palette Generator")
    }

    // Validate inputs with retry on error
    const color = yield* validateColor(colorOpt)
    const stop = yield* validateStop(stopOpt)
    const format = yield* validateFormat(formatOpt)

    const name = yield* O.match(nameOpt, {
      onNone: () => promptForPaletteName("generated"),
      onSome: (value) => Effect.succeed(value)
    })

    // Create spinner for generation if interactive
    const spinner = isInteractive ? clack.spinner() : undefined
    if (spinner) {
      spinner.start("Generating palette...")
    }

    // Generate palette
    const result = yield* generateAndDisplay({ color, format, name, pattern, stop })

    if (spinner) {
      spinner.stop("✅ Palette generated!")
    }

    // Display with appropriate formatting
    if (isInteractive) {
      yield* displayPaletteInteractive(result)
    } else {
      yield* displayPaletteSimple(result)
    }

    return result
  })
