/**
 * Interactive CLI prompts using @clack/prompts
 *
 * All prompts return Effects with schema validation
 */

import * as clack from "@clack/prompts"
import { Effect } from "effect"
import type { ParseError } from "effect/ParseResult"
import { ColorSpace, ColorString } from "../schemas/color.js"
import { STOP_POSITIONS, StopPosition, type StopPosition as StopPositionType } from "../schemas/palette.js"

/**
 * Prompt for color input
 */
export const promptForColor = (): Effect.Effect<string, ParseError, never> =>
  Effect.gen(function*() {
    const color = yield* Effect.promise(() =>
      clack.text({
        message: "Enter a color:",
        placeholder: "#2D72D2 or 2D72D2",
        validate: (value) => {
          if (!value) return "Color is required"
          return undefined
        }
      })
    )

    if (clack.isCancel(color)) {
      clack.cancel("Operation cancelled")
      process.exit(0)
    }

    return yield* ColorString(color)
  })

/**
 * Prompt for stop position
 */
export const promptForStop = (): Effect.Effect<StopPositionType, ParseError> =>
  Effect.gen(function*() {
    const stop = yield* Effect.promise(() =>
      clack.select({
        message: "Which stop does this color represent?",
        options: STOP_POSITIONS.map((pos) => ({
          label: `${pos}${getStopDescription(pos)}`,
          value: pos
        }))
      })
    )

    if (clack.isCancel(stop)) {
      clack.cancel("Operation cancelled")
      process.exit(0)
    }

    return yield* StopPosition(stop)
  })

/**
 * Prompt for output format
 */
export const promptForOutputFormat = (): Effect.Effect<ColorSpace, ParseError> =>
  Effect.gen(function*() {
    const format = yield* Effect.promise(() =>
      clack.select({
        message: "Choose output format:",
        options: [
          { label: "Hex (#RRGGBB)", value: "hex", hint: "e.g., #2D72D2" },
          { label: "RGB", value: "rgb", hint: "e.g., rgb(45, 114, 210)" },
          { label: "OKLCH", value: "oklch", hint: "e.g., oklch(57.23% 0.154 258.7)" },
          { label: "OKLAB", value: "oklab", hint: "e.g., oklab(57.23% -0.051 -0.144)" }
        ]
      })
    )

    if (clack.isCancel(format)) {
      clack.cancel("Operation cancelled")
      process.exit(0)
    }

    return yield* ColorSpace(format)
  })

/**
 * Prompt for palette name
 */
export const promptForPaletteName = (
  defaultName: string
): Effect.Effect<string, ParseError> =>
  Effect.gen(function*() {
    const name = yield* Effect.promise(() =>
      clack.text({
        message: "Palette name (optional):",
        placeholder: defaultName,
        defaultValue: defaultName
      })
    )

    if (clack.isCancel(name)) {
      clack.cancel("Operation cancelled")
      process.exit(0)
    }

    return yield* Effect.succeed(name || defaultName)
  })

/**
 * Get a description for a stop position
 */
const getStopDescription = (stop: StopPositionType): string => {
  switch (stop) {
    case 100:
      return " - Lightest"
    case 200:
      return " - Very light"
    case 300:
      return " - Light"
    case 400:
      return " - Medium-light"
    case 500:
      return " - Medium (reference)"
    case 600:
      return " - Medium-dark"
    case 700:
      return " - Dark"
    case 800:
      return " - Very dark"
    case 900:
      return " - Darkest"
    case 1000:
      return " - Almost black"
  }
}
