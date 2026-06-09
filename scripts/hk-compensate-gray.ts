/**
 * Helmholtz-Kohlrausch Gray Compensation CLI Script
 *
 * Generates a lightness-compensated gray palette from a chromatic reference pattern.
 * The H-K effect adds perceived brightness to chromatic colors. This script adjusts
 * each gray stop's lightness so its perceived brightness matches the reference
 * pattern's chromatic colors at corresponding stops.
 *
 * Usage:
 *   npx tsx scripts/hk-compensate-gray.ts \
 *     --reference patterns/default.json \
 *     --hue 257 --chroma 0.025 \
 *     --name "gray-hk" \
 *     --output patterns/gray-source.json
 *
 * Flags:
 *   --reference  (required) path to reference pattern JSON
 *   --hue        (required) target hue angle for gray palette
 *   --chroma     (required) target chroma for gray palette
 *   --name       (optional, default "gray-hk") palette name
 *   --output     (required) output path for compensated pattern JSON
 */

import { Array as Arr, Effect } from "effect"
import * as fs from "node:fs"
import { clampToGamut, oklchToHex, parseColorStringToOKLCH } from "../src/domain/color/color.js"
import type { OKLCHColor } from "../src/domain/color/color.schema.js"
import { compensateLightness } from "../src/domain/color/helmholtz-kohlrausch.js"

// ============================================================================
// Types
// ============================================================================

interface ParsedArgs {
  readonly reference: string
  readonly hue: number
  readonly chroma: number
  readonly name: string
  readonly output: string
}

interface PatternStop {
  readonly position: number
  readonly hex: string
}

interface PatternJSON {
  readonly name: string
  readonly description: string
  readonly stops: ReadonlyArray<PatternStop>
}

interface CompensationResult {
  readonly position: number
  readonly referenceL: number
  readonly correctedL: number
  readonly deltaL: number
  readonly hex: string
}

// ============================================================================
// Argument Parsing
// ============================================================================

/** Parse CLI arguments into structured form */
const parseArgs = (argv: ReadonlyArray<string>): Effect.Effect<ParsedArgs, Error> =>
  Effect.try({
    try: () => {
      const args = argv.slice(2)
      let reference: string | undefined
      let hue: number | undefined
      let chroma: number | undefined
      let name = "gray-hk"
      let output: string | undefined

      let i = 0
      while (i < args.length) {
        const arg = args[i]
        switch (arg) {
          case "--reference": {
            i++
            reference = args[i]
            break
          }
          case "--hue": {
            i++
            const h = Number(args[i])
            if (isNaN(h)) throw new Error(`Invalid hue: ${args[i]}`)
            hue = h
            break
          }
          case "--chroma": {
            i++
            const c = Number(args[i])
            if (isNaN(c)) throw new Error(`Invalid chroma: ${args[i]}`)
            chroma = c
            break
          }
          case "--name": {
            i++
            const n = args[i]
            if (n !== undefined) name = n
            break
          }
          case "--output": {
            i++
            output = args[i]
            break
          }
          default:
            break
        }
        i++
      }

      if (reference === undefined) throw new Error("Missing required flag: --reference")
      if (hue === undefined) throw new Error("Missing required flag: --hue")
      if (chroma === undefined) throw new Error("Missing required flag: --chroma")
      if (output === undefined) throw new Error("Missing required flag: --output")

      return { reference, hue, chroma, name, output }
    },
    catch: (error) => error instanceof Error ? error : new Error(String(error))
  })

// ============================================================================
// File I/O
// ============================================================================

/** Read and parse a pattern JSON file */
const loadPattern = (path: string): Effect.Effect<PatternJSON, Error> =>
  Effect.try({
    try: () => {
      const content = fs.readFileSync(path, "utf-8")
      return JSON.parse(content) satisfies PatternJSON
    },
    catch: (error) => error instanceof Error ? error : new Error(`Failed to read pattern: ${String(error)}`)
  })

/** Write pattern JSON to a file */
const writePattern = (path: string, pattern: PatternJSON): Effect.Effect<void, Error> =>
  Effect.try({
    try: () => {
      fs.writeFileSync(path, JSON.stringify(pattern, null, 2) + "\n", "utf-8")
    },
    catch: (error) => error instanceof Error ? error : new Error(`Failed to write pattern: ${String(error)}`)
  })

// ============================================================================
// Output Formatting
// ============================================================================

/** Format results as a comparison table */
const formatResultsTable = (
  results: ReadonlyArray<CompensationResult>,
  args: ParsedArgs
): string => {
  const lines: Array<string> = []
  lines.push("")
  lines.push(`H-K Lightness Compensation: ${args.reference} → ${args.output}`)
  lines.push(`Target hue: ${args.hue}°, chroma: ${args.chroma}`)
  lines.push("─".repeat(72))
  lines.push(
    `${"Stop".padEnd(8)} ${"Ref L".padEnd(10)} ${"Corrected L".padEnd(14)} ${"ΔL".padEnd(10)} ${"Hex"}`
  )
  lines.push("─".repeat(72))

  for (const r of results) {
    const sign = r.deltaL >= 0 ? "+" : ""
    lines.push(
      `${String(r.position).padEnd(8)} ${r.referenceL.toFixed(4).padEnd(10)} ${r.correctedL.toFixed(4).padEnd(14)} ${
        (sign + r.deltaL.toFixed(4)).padEnd(10)
      } ${r.hex}`
    )
  }

  lines.push("─".repeat(72))
  lines.push("")
  return lines.join("\n")
}

// ============================================================================
// Main
// ============================================================================

const main = Effect.gen(function*() {
  const args = yield* parseArgs(process.argv)

  yield* Effect.log(`Loading reference pattern: ${args.reference}`)
  const pattern = yield* loadPattern(args.reference)

  yield* Effect.log(`Processing ${pattern.stops.length} stops (hue=${args.hue}, chroma=${args.chroma})...`)

  const results = yield* Effect.forEach(pattern.stops, (stop) =>
    Effect.gen(function*() {
      // Parse reference stop hex to OKLCH
      const refColor = yield* parseColorStringToOKLCH(stop.hex)

      // Create target color with reference L but target hue/chroma
      const targetColor: OKLCHColor = {
        l: refColor.l,
        c: args.chroma,
        h: args.hue,
        alpha: 1
      }

      // Compensate lightness using H-K model
      const compensated = yield* compensateLightness(refColor, targetColor)

      // Gamut-clamp the corrected color
      const clamped = yield* clampToGamut(compensated)

      // Format as hex
      const hex = yield* oklchToHex(clamped)

      return {
        position: stop.position,
        referenceL: refColor.l,
        correctedL: clamped.l,
        deltaL: clamped.l - refColor.l,
        hex
      }
    }))

  // Build output pattern
  const outputPattern: PatternJSON = {
    name: args.name,
    description: `H-K compensated gray palette (hue=${args.hue}, chroma=${args.chroma}) from ${pattern.name}`,
    stops: Arr.map(results, (r) => ({ position: r.position, hex: r.hex }))
  }

  // Write output
  yield* writePattern(args.output, outputPattern)
  yield* Effect.log(`Written to ${args.output}`)

  // Print comparison table
  const table = formatResultsTable(results, args)
  yield* Effect.log(table)
})

Effect.runPromise(
  main.pipe(
    Effect.catchAll((error) =>
      Effect.log(`Error: ${error}`).pipe(
        Effect.flatMap(() => Effect.sync(() => process.exit(1)))
      )
    )
  )
)
