import * as clack from "@clack/prompts"
import { Command } from "@effect/cli"
import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { MainLive } from "../layers/MainLive.js"
import { generate } from "./commands/generate/index.js"
import { CancelledError } from "./prompts.js"
// Self-reference import via package.json exports field
import packageJson from "oklch-palette-generator/package.json" with { type: "json" }

const cli = Command.make("color-palette-generator").pipe(
  Command.withSubcommands([generate])
)

const runCli = Command.run(cli, {
  name: "Color Palette Generator",
  version: packageJson.version
})

const main = runCli(process.argv).pipe(
  Effect.provide(MainLive),
  Effect.catchIf(
    (error): error is CancelledError => error instanceof CancelledError,
    (error) =>
      Effect.sync(() => {
        clack.cancel(error.message)
      })
  )
)

NodeRuntime.runMain(main)
