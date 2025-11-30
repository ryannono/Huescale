/**
 * Dependency Graph Generator
 *
 * Scans service files and generates a dependency graph showing:
 * - Service identifiers
 * - Dependencies between services
 * - Test layer patterns
 *
 * Usage: npx tsx scripts/dependency-graph.ts
 */

import { FileSystem, Path } from "@effect/platform"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Array as Arr, Effect, Option as O, pipe } from "effect"

// ============================================================================
// Types
// ============================================================================

interface ServiceInfo {
  readonly name: string
  readonly identifier: string
  readonly filePath: string
  readonly dependencies: ReadonlyArray<string>
  readonly testPattern: string
}

// ============================================================================
// Parsing
// ============================================================================

/** Extract service name from Effect.Service pattern */
const extractServiceName = (content: string): O.Option<string> =>
  pipe(
    content.match(/class\s+(\w+)\s+extends\s+Effect\.Service/),
    O.fromNullable,
    O.flatMap((m) => O.fromNullable(m[1]))
  )

/** Extract service identifier from Effect.Service pattern */
const extractIdentifier = (content: string): O.Option<string> =>
  pipe(
    content.match(/Effect\.Service<\w+>\(\)\(\s*["']([^"']+)["']/),
    O.fromNullable,
    O.flatMap((m) => O.fromNullable(m[1]))
  )

/** Extract dependencies from dependencies array */
const extractDependencies = (content: string): ReadonlyArray<string> => {
  const match = content.match(/dependencies:\s*\[([^\]]*)\]/)
  if (!match?.[1]) return []

  const depsContent = match[1]
  // Match both Service.Default and NodeXxx.layer patterns
  const serviceMatches = depsContent.match(/(\w+)\.Default/g) ?? []
  const layerMatches = depsContent.match(/(Node\w+)\.layer/g) ?? []

  const serviceDeps = serviceMatches.map((d) => d.replace(".Default", ""))
  const layerDeps = layerMatches.map((d) => d.replace(".layer", ""))

  return [...serviceDeps, ...layerDeps]
}

/** Determine test pattern from static Test definition */
const extractTestPattern = (content: string, serviceName: string): string => {
  // Pattern D: DefaultWithoutDependencies.pipe(Layer.provide(...))
  // Check this FIRST as it's more specific
  if (content.includes("DefaultWithoutDependencies.pipe")) {
    return "Pattern D"
  }

  // Pattern: = ServiceName.Default (pure service)
  if (content.includes(`static readonly Test = ${serviceName}.Default`)) {
    return "= Default"
  }

  // Pattern A: Effect.Service<...>()(...).Default
  if (content.match(/static readonly Test\s*=\s*Effect\.Service/)) {
    return "Pattern A"
  }

  // Factory pattern
  if (content.includes("makeTest")) {
    return "Factory makeTest()"
  }

  return "Unknown"
}

/** Parse a service file and extract service info */
const parseServiceFile = (
  filePath: string,
  content: string
): O.Option<ServiceInfo> =>
  pipe(
    O.all({
      name: extractServiceName(content),
      identifier: extractIdentifier(content)
    }),
    O.map(({ identifier, name }) => ({
      name,
      identifier,
      filePath: filePath.replace(/^.*\/src\//, "src/"),
      dependencies: extractDependencies(content),
      testPattern: extractTestPattern(content, name)
    }))
  )

// ============================================================================
// File Discovery
// ============================================================================

/** Find all TypeScript files that might contain services */
const findServiceFiles = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  const searchDirs = ["src/services", "src/cli"]

  const findInDir = (dir: string): Effect.Effect<ReadonlyArray<string>, Error> =>
    Effect.gen(function*() {
      const exists = yield* fs.exists(dir)
      if (!exists) return []

      const entries = yield* fs.readDirectory(dir)
      const results: Array<string> = []

      for (const entry of entries) {
        const fullPath = path.join(dir, entry)
        const stat = yield* fs.stat(fullPath)

        if (stat.type === "Directory") {
          const subFiles = yield* findInDir(fullPath)
          results.push(...subFiles)
        } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".schema.ts")) {
          results.push(fullPath)
        }
      }

      return results
    })

  const allFiles = yield* Effect.forEach(searchDirs, findInDir)
  return Arr.flatten(allFiles)
})

// ============================================================================
// Graph Generation
// ============================================================================

/** Generate ASCII dependency graph */
const generateAsciiGraph = (services: ReadonlyArray<ServiceInfo>): string => {
  const lines: Array<string> = []
  lines.push("```")
  lines.push("Service Dependency Graph")
  lines.push("========================")
  lines.push("")

  // Group by dependency level
  const noDeps = services.filter((s) => s.dependencies.length === 0)
  const withDeps = services.filter((s) => s.dependencies.length > 0)

  lines.push("Platform Layer:")
  lines.push("  NodeContext (FileSystem, Path)")
  lines.push("")

  lines.push("Independent Services (no dependencies):")
  for (const s of noDeps) {
    lines.push(`  ├── ${s.name}`)
  }
  lines.push("")

  lines.push("Dependent Services:")
  for (const s of withDeps) {
    const deps = s.dependencies.join(", ")
    lines.push(`  ├── ${s.name}`)
    lines.push(`  │     └── depends on: ${deps}`)
  }

  lines.push("```")
  return lines.join("\n")
}

/** Generate markdown table */
const generateTable = (services: ReadonlyArray<ServiceInfo>): string => {
  const lines: Array<string> = []
  lines.push("| Service | Identifier | Test Pattern | Dependencies |")
  lines.push("|---------|------------|--------------|--------------|")

  const sorted = [...services].sort((a, b) => a.name.localeCompare(b.name))

  for (const s of sorted) {
    const deps = s.dependencies.length > 0 ? s.dependencies.join(", ") : "None"
    lines.push(`| ${s.name} | \`${s.identifier}\` | ${s.testPattern} | ${deps} |`)
  }

  return lines.join("\n")
}

// ============================================================================
// Main
// ============================================================================

const main = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem

  yield* Effect.log("Scanning for service files...")

  const files = yield* findServiceFiles
  yield* Effect.log(`Found ${files.length} potential service files`)

  const services: Array<ServiceInfo> = []

  for (const file of files) {
    const content = yield* fs.readFileString(file)
    const info = parseServiceFile(file, content)
    if (O.isSome(info)) {
      services.push(info.value)
      yield* Effect.log(`  ✓ ${info.value.name} (${info.value.testPattern})`)
    }
  }

  yield* Effect.log("")
  yield* Effect.log(`Found ${services.length} services`)
  yield* Effect.log("")

  // Output formats
  yield* Effect.log("=== ASCII Graph ===")
  yield* Effect.log(generateAsciiGraph(services))
  yield* Effect.log("")

  yield* Effect.log("=== Markdown Table ===")
  yield* Effect.log(generateTable(services))
  yield* Effect.log("")

  // Summary
  yield* Effect.log("=== Summary ===")
  yield* Effect.log(`Total services: ${services.length}`)
  yield* Effect.log(`With dependencies: ${services.filter((s) => s.dependencies.length > 0).length}`)
  yield* Effect.log(`Pattern A (different impl): ${services.filter((s) => s.testPattern === "Pattern A").length}`)
  yield* Effect.log(`Pattern D (test deps): ${services.filter((s) => s.testPattern === "Pattern D").length}`)
  yield* Effect.log(`= Default (pure): ${services.filter((s) => s.testPattern === "= Default").length}`)
})

NodeRuntime.runMain(
  main.pipe(
    Effect.provide(NodeContext.layer),
    Effect.catchAll((error) => Effect.log(`Error: ${error}`))
  )
)
