/**
 * Contrast Compensation CLI Script
 *
 * Compensates foreground colors for simultaneous contrast when moving
 * between different background colors using the CIECAM02 appearance model.
 *
 * Usage:
 *   npx tsx scripts/contrast-compensate.ts \
 *     --source-bg "#ffffff" --target-bg "#1a1a1a" \
 *     "#2D72D2" "#D13913" "#0D8050"
 *
 * Flags:
 *   --source-bg   (required) background colors were designed for
 *   --target-bg   (required) background to adapt colors to
 *   --format      (optional, default "hex") output: hex, rgb, oklch, oklab
 *   Positional    foreground colors to compensate
 */

import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Array as Arr, Effect } from "effect"
import { parseColorStringToOKLCH } from "../src/domain/color/color.js"
import type { ColorSpace, OKLCHColor } from "../src/domain/color/color.schema.js"
import { compensateForBackground } from "../src/domain/color/contrast-compensation.js"
import { formatColor } from "../src/domain/color/formatter.js"

// ============================================================================
// Argument Parsing
// ============================================================================

interface ParsedArgs {
  readonly sourceBg: string
  readonly targetBg: string
  readonly format: ColorSpace
  readonly colors: ReadonlyArray<string>
}

/** Parse CLI arguments into structured form */
const parseArgs = (argv: ReadonlyArray<string>): Effect.Effect<ParsedArgs, Error> =>
  Effect.try({
    try: () => {
      const args = argv.slice(2) // skip node and script path
      let sourceBg: string | undefined
      let targetBg: string | undefined
      let format: ColorSpace = "hex"
      const colors: Array<string> = []

      let i = 0
      while (i < args.length) {
        const arg = args[i]
        switch (arg) {
          case "--source-bg": {
            i++
            sourceBg = args[i]
            break
          }
          case "--target-bg": {
            i++
            targetBg = args[i]
            break
          }
          case "--format": {
            i++
            const fmt = args[i]
            if (fmt !== "hex" && fmt !== "rgb" && fmt !== "oklch" && fmt !== "oklab") {
              throw new Error(`Invalid format: ${fmt}. Expected: hex, rgb, oklch, oklab`)
            }
            format = fmt
            break
          }
          default:
            // Positional argument = foreground color
            if (arg !== undefined) {
              colors.push(arg)
            }
            break
        }
        i++
      }

      if (sourceBg === undefined) throw new Error("Missing required flag: --source-bg")
      if (targetBg === undefined) throw new Error("Missing required flag: --target-bg")
      if (colors.length === 0) throw new Error("No foreground colors provided")

      return { sourceBg, targetBg, format, colors }
    },
    catch: (error) => error instanceof Error ? error : new Error(String(error))
  })

// ============================================================================
// Output Formatting
// ============================================================================

interface CompensationResult {
  readonly original: string
  readonly compensated: string
  readonly originalOklch: OKLCHColor
  readonly compensatedOklch: OKLCHColor
}

/** Format results as a table */
const formatResultsTable = (
  results: ReadonlyArray<CompensationResult>,
  sourceBg: string,
  targetBg: string,
  format: ColorSpace
): string => {
  const lines: Array<string> = []
  lines.push("")
  lines.push(`Contrast Compensation: ${sourceBg} → ${targetBg}`)
  lines.push(`Output format: ${format}`)
  lines.push("─".repeat(60))
  lines.push(`${"Original".padEnd(24)} ${"Compensated".padEnd(24)} ΔL`)
  lines.push("─".repeat(60))

  for (const r of results) {
    const deltaL = (r.compensatedOklch.l - r.originalOklch.l).toFixed(4)
    const sign = r.compensatedOklch.l >= r.originalOklch.l ? "+" : ""
    lines.push(
      `${r.original.padEnd(24)} ${r.compensated.padEnd(24)} ${sign}${deltaL}`
    )
  }

  lines.push("─".repeat(60))
  lines.push("")
  return lines.join("\n")
}

// ============================================================================
// Main
// ============================================================================

const main = Effect.gen(function* () {
  const args = yield* parseArgs(process.argv)

  yield* Effect.log(`Parsing source background: ${args.sourceBg}`)
  const sourceBg = yield* parseColorStringToOKLCH(args.sourceBg)

  yield* Effect.log(`Parsing target background: ${args.targetBg}`)
  const targetBg = yield* parseColorStringToOKLCH(args.targetBg)

  yield* Effect.log(`Compensating ${args.colors.length} colors...`)

  const results = yield* Effect.forEach(args.colors, (colorStr) =>
    Effect.gen(function* () {
      const originalOklch = yield* parseColorStringToOKLCH(colorStr)
      const compensatedOklch = yield* compensateForBackground(originalOklch, sourceBg, targetBg)
      const original = yield* formatColor(originalOklch, args.format)
      const compensated = yield* formatColor(compensatedOklch, args.format)
      return { original, compensated, originalOklch, compensatedOklch }
    })
  )

  const table = formatResultsTable(
    Arr.map(results, (r) => r),
    args.sourceBg,
    args.targetBg,
    args.format
  )

  yield* Effect.log(table)
})

NodeRuntime.runMain(
  main.pipe(
    Effect.provide(NodeContext.layer),
    Effect.catchAll((error) => Effect.log(`Error: ${error}`))
  )
)
