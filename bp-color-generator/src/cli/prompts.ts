/**
 * Interactive CLI prompts using @clack/prompts
 *
 * All prompts return Effects with schema validation
 */

import * as clack from "@clack/prompts"
import { Effect } from "effect"
import type { ParseError } from "effect/ParseResult"
import { ColorSpace, ColorString } from "../schemas/color.js"
import {
  BatchInputMode,
  type BatchInputMode as BatchInputModeType,
  BatchPasteInput,
  ExportTarget,
  type ExportTarget as ExportTargetType,
  JsonPath,
  type JsonPath as JsonPathType
} from "../schemas/export.js"
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
export const promptForStop = (color?: string, colorIndex?: number): Effect.Effect<StopPositionType, ParseError> =>
  Effect.gen(function*() {
    let message = "Which stop does this color represent?"
    if (color && colorIndex) {
      message = `Which stop does color ${colorIndex} (${color}) represent?`
    } else if (color) {
      message = `Which stop does this color (${color}) represent?`
    }

    const stop = yield* Effect.promise(() =>
      clack.select({
        message,
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
 * Prompt for batch input mode
 */
export const promptForBatchInputMode = (): Effect.Effect<BatchInputModeType, ParseError> =>
  Effect.gen(function*() {
    const mode = yield* Effect.promise(() =>
      clack.select({
        message: "How would you like to generate palettes?",
        options: [
          {
            label: "Paste multiple colors",
            value: "paste",
            hint: "Batch mode: multi-line or comma-separated"
          },
          {
            label: "Enter a single color",
            value: "cycle",
            hint: "Interactive prompts for one palette"
          },
          {
            label: "Transform colors (apply optical appearance)",
            value: "transform",
            hint: "Apply lightness+chroma from one color to another's hue"
          }
        ]
      })
    )

    if (clack.isCancel(mode)) {
      clack.cancel("Operation cancelled")
      process.exit(0)
    }

    return yield* BatchInputMode(mode)
  })

/**
 * Prompt for paste mode batch input
 */
export const promptForBatchPaste = (): Effect.Effect<string, ParseError> =>
  Effect.gen(function*() {
    const input = yield* Effect.promise(() =>
      clack.text({
        message: "Paste color/stop pairs:",
        placeholder: "#2D72D2::500\n#163F79::700\nor: #2D72D2:500, #163F79:700",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Input is required"
          }
          return undefined
        }
      })
    )

    if (clack.isCancel(input)) {
      clack.cancel("Operation cancelled")
      process.exit(0)
    }

    return yield* BatchPasteInput(input)
  })

/**
 * Prompt for export target
 */
export const promptForExportTarget = (): Effect.Effect<ExportTargetType, ParseError> =>
  Effect.gen(function*() {
    const target = yield* Effect.promise(() =>
      clack.select({
        message: "Where to export the result?",
        options: [
          { label: "Display only (no export)", value: "none" },
          { label: "Copy to clipboard", value: "clipboard" },
          { label: "Save to JSON file", value: "json" }
        ]
      })
    )

    if (clack.isCancel(target)) {
      clack.cancel("Operation cancelled")
      process.exit(0)
    }

    return yield* ExportTarget(target)
  })

/**
 * Prompt for JSON file path
 */
export const promptForJsonPath = (): Effect.Effect<JsonPathType, ParseError> =>
  Effect.gen(function*() {
    const path = yield* Effect.promise(() =>
      clack.text({
        message: "Enter JSON file path:",
        placeholder: "./output/palettes.json",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "File path is required"
          }
          return undefined
        }
      })
    )

    if (clack.isCancel(path)) {
      clack.cancel("Operation cancelled")
      process.exit(0)
    }

    return yield* JsonPath(path)
  })

/**
 * Prompt for transformation reference color
 */
export const promptForReferenceColor = (): Effect.Effect<string, ParseError> =>
  Effect.gen(function*() {
    const color = yield* Effect.promise(() =>
      clack.text({
        message: "Enter reference color (source of lightness + chroma):",
        placeholder: "#2D72D2 or 2D72D2",
        validate: (value) => {
          if (!value) return "Reference color is required"
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
 * Prompt for transformation target color(s)
 */
export const promptForTargetColors = (): Effect.Effect<Array<string>, ParseError> =>
  Effect.gen(function*() {
    const input = yield* Effect.promise(() =>
      clack.text({
        message: "Enter target color(s) (hue to preserve):",
        placeholder: "Single: 238551  or  Multiple: 238551,DC143C,FF6B6B",
        validate: (value) => {
          if (!value) return "At least one target color is required"
          return undefined
        }
      })
    )

    if (clack.isCancel(input)) {
      clack.cancel("Operation cancelled")
      process.exit(0)
    }

    // Split by comma and validate each
    const colorInputs = input.split(",").map((c) => c.trim()).filter((c) => c.length > 0)

    // Validate each color with ColorString schema
    const validatedColors = []
    for (const colorInput of colorInputs) {
      const validated = yield* ColorString(colorInput)
      validatedColors.push(validated)
    }

    return validatedColors
  })

/**
 * Prompt to add another transformation
 */
export const promptForAnotherTransformation = (): Effect.Effect<boolean, never> =>
  Effect.gen(function*() {
    const answer = yield* Effect.promise(() =>
      clack.confirm({
        message: "Add another transformation?"
      })
    )

    if (clack.isCancel(answer)) {
      return false
    }

    return answer
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
