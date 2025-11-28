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

// ============================================================================
// Public API
// ============================================================================

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
    ).pipe(Effect.flatMap(handleCancel))

    return yield* ColorString(color)
  })

/**
 * Prompt for stop position
 */
export const promptForStop = (color?: ColorString, colorIndex?: number): Effect.Effect<StopPositionType, ParseError> =>
  Effect.gen(function*() {
    const message = buildStopMessage(color, colorIndex)

    const stop = yield* Effect.promise(() =>
      clack.select({
        message,
        options: STOP_POSITIONS.map((pos) => ({
          label: `${pos}${getStopDescription(pos)}`,
          value: pos
        }))
      })
    ).pipe(Effect.flatMap(handleCancel))

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
    ).pipe(Effect.flatMap(handleCancel))

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
    ).pipe(Effect.flatMap(handleCancel))

    return name || defaultName
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
    ).pipe(Effect.flatMap(handleCancel))

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
    ).pipe(Effect.flatMap(handleCancel))

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
    ).pipe(Effect.flatMap(handleCancel))

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
    ).pipe(Effect.flatMap(handleCancel))

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
    ).pipe(Effect.flatMap(handleCancel))

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
    ).pipe(Effect.flatMap(handleCancel))

    // Split by comma and validate each
    const colorInputs = input.split(",").map((c) => c.trim()).filter((c) => c.length > 0)

    // Validate each color with ColorString schema using Effect.all
    return yield* Effect.all(colorInputs.map((colorInput) => ColorString(colorInput)))
  })

/**
 * Prompt to add another transformation
 *
 * Note: Treats cancel as "no" rather than exiting the program,
 * since we already have valid input and just want to know if more is coming.
 */
export const promptForAnotherTransformation = (): Effect.Effect<boolean, never> =>
  Effect.gen(function*() {
    const answer = yield* Effect.promise(() =>
      clack.confirm({
        message: "Add another transformation?"
      })
    )

    return clack.isCancel(answer) ? false : answer
  })

// ============================================================================
// Helpers
// ============================================================================

/**
 * Handle cancellation by exiting the process
 */
const handleCancel = <T>(value: T | symbol): Effect.Effect<T, never> => {
  if (clack.isCancel(value)) {
    return Effect.sync(() => {
      clack.cancel("Operation cancelled")
      process.exit(0)
    })
  }
  return Effect.succeed(value)
}

/**
 * Stop position descriptions
 */
const STOP_DESCRIPTIONS: Readonly<Record<StopPositionType, string>> = {
  100: " - Lightest",
  200: " - Very light",
  300: " - Light",
  400: " - Medium-light",
  500: " - Medium (reference)",
  600: " - Medium-dark",
  700: " - Dark",
  800: " - Very dark",
  900: " - Darkest",
  1000: " - Almost black"
}

/**
 * Get description for a stop position
 */
const getStopDescription = (stop: StopPositionType): string => STOP_DESCRIPTIONS[stop]

/**
 * Build stop prompt message based on context
 *
 * @param color - Optional color string to display in the message
 * @param colorIndex - Optional 1-indexed color number for display (never 0)
 */
const buildStopMessage = (color?: ColorString, colorIndex?: number): string => {
  if (color && colorIndex) return `Which stop does color ${colorIndex} (${color}) represent?`
  if (color) return `Which stop does this color (${color}) represent?`
  return "Which stop does this color represent?"
}
