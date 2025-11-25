/**
 * Generate commands for palette generation
 *
 * Provides both direct (all flags required) and interactive modes
 */

import * as clack from "@clack/prompts"
import { Command, Options } from "@effect/cli"
import { Effect, Option as O } from "effect"
import { ColorSpace, ColorString } from "../../schemas/color.js"
import { StopPosition } from "../../schemas/palette.js"
import { promptForColor, promptForOutputFormat, promptForPaletteName, promptForStop } from "../prompts.js"
import { displayPaletteInteractive, displayPaletteSimple, generateAndDisplay } from "./shared.js"

/**
 * Color input option (optional - prompts if missing)
 */
const colorOption = Options.text("color").pipe(
  Options.withAlias("c"),
  Options.optional,
  Options.withDescription("Input color (hex, rgb(), hsl(), oklch(), etc.)")
)

/**
 * Stop position option (optional - prompts if missing)
 */
const stopOption = Options.integer("stop").pipe(
  Options.withAlias("s"),
  Options.optional,
  Options.withDescription("Stop position (100-1000)")
)

/**
 * Output format option (optional - prompts if missing)
 */
const formatOption = Options.text("format").pipe(
  Options.withAlias("f"),
  Options.optional,
  Options.withDescription("Output format: hex, rgb, oklch, oklab")
)

/**
 * Palette name option (optional - prompts if missing)
 */
const nameOption = Options.text("name").pipe(
  Options.withAlias("n"),
  Options.optional,
  Options.withDescription("Palette name")
)

/**
 * Pattern source option (for advanced users)
 */
const patternOption = Options.text("pattern").pipe(
  Options.withAlias("p"),
  Options.withDefault("test/fixtures/palettes/example-blue.json"),
  Options.withDescription("Pattern source file path")
)

/**
 * Smart generate command - automatically prompts for missing options
 */
export const generate = Command.make("generate", {
  color: colorOption,
  format: formatOption,
  name: nameOption,
  pattern: patternOption,
  stop: stopOption
}).pipe(
  Command.withHandler(({ color: colorOpt, format: formatOpt, name: nameOpt, pattern, stop: stopOpt }) =>
    Effect.gen(function*() {
      // Check if any required options are missing (interactive mode)
      const isInteractive = O.match(colorOpt, {
        onNone: () => true,
        onSome: () =>
          O.match(stopOpt, {
            onNone: () => true,
            onSome: () => false
          })
      })

      if (isInteractive) {
        clack.intro("🎨 BP Color Palette Generator")
      }

      // Prompt for missing values with retry on error
      let color: string
      while (true) {
        const colorResult = yield* Effect.either(
          O.match(colorOpt, {
            onNone: () => promptForColor(),
            onSome: (value) => ColorString(value)
          })
        )
        if (colorResult._tag === "Right") {
          color = colorResult.right
          break
        }
        // On error, always prompt interactively
        clack.log.error("Invalid color format. Please try again.")
        const retryColor = yield* promptForColor()
        const retryResult = yield* Effect.either(ColorString(retryColor))
        if (retryResult._tag === "Right") {
          color = retryResult.right
          break
        }
      }

      let stop: StopPosition
      while (true) {
        const stopResult = yield* Effect.either(
          O.match(stopOpt, {
            onNone: () => promptForStop(),
            onSome: (value) => StopPosition(value)
          })
        )
        if (stopResult._tag === "Right") {
          stop = stopResult.right
          break
        }
        // On error, always prompt interactively
        clack.log.error("Invalid stop position. Please try again.")
        const retryStop = yield* promptForStop()
        const retryResult = yield* Effect.either(StopPosition(retryStop))
        if (retryResult._tag === "Right") {
          stop = retryResult.right
          break
        }
      }

      let format: ColorSpace
      while (true) {
        const formatResult = yield* Effect.either(
          O.match(formatOpt, {
            onNone: () => promptForOutputFormat(),
            onSome: (value) => ColorSpace(value)
          })
        )
        if (formatResult._tag === "Right") {
          format = formatResult.right
          break
        }
        // On error, always prompt interactively
        clack.log.error("Invalid format. Please try again.")
        const retryFormat = yield* promptForOutputFormat()
        const retryResult = yield* Effect.either(ColorSpace(retryFormat))
        if (retryResult._tag === "Right") {
          format = retryResult.right
          break
        }
      }

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
  ),
  Command.withDescription("Generate a color palette (interactive if options missing)")
)
