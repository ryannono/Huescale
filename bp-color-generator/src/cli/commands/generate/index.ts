/**
 * Generate command definition
 *
 * Provides both direct (all flags required) and interactive modes
 * Supports single palette and batch generation with export options
 */

import { Command, Options } from "@effect/cli"
import { handleGenerate } from "./handler.js"

/**
 * Color input option - can be comma-separated for batch mode
 * Examples:
 * - Single: -c "#2D72D2"
 * - Batch: -c "#2D72D2::500,#DB2C6F::600"
 */
const colorOption = Options.text("color").pipe(
  Options.withAlias("c"),
  Options.optional,
  Options.withDescription("Color(s): single color or comma-separated pairs (e.g., #2D72D2::500,#DB2C6F::600)")
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
 * Export target option
 */
const exportOption = Options.text("export").pipe(
  Options.withAlias("e"),
  Options.optional,
  Options.withDescription("Export target: none, json, clipboard")
)

/**
 * Export path option (for JSON export)
 */
const exportPathOption = Options.text("export-path").pipe(
  Options.optional,
  Options.withDescription("File path for JSON export")
)

/**
 * Smart generate command - automatically prompts for missing options
 * Detects batch mode from color input (comma-separated values)
 * Supports single and batch modes with export options
 */
export const generate = Command.make("generate", {
  color: colorOption,
  export: exportOption,
  exportPath: exportPathOption,
  format: formatOption,
  name: nameOption,
  pattern: patternOption,
  stop: stopOption
}).pipe(
  Command.withHandler(
    ({ color: colorOpt, export: exportOpt, exportPath, format: formatOpt, name: nameOpt, pattern, stop: stopOpt }) =>
      handleGenerate({
        colorOpt,
        exportOpt,
        exportPath,
        formatOpt,
        nameOpt,
        pattern,
        stopOpt
      })
  ),
  Command.withDescription("Generate a color palette (interactive if options missing)")
)
