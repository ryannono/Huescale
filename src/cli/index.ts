import * as clack from "@clack/prompts"
import { Command } from "@effect/cli"
import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { MainLive } from "../layers/MainLive.js"
import { generate } from "./commands/generate/index.js"
// Self-reference import via package.json exports field
import packageJson from "huescale/package.json" with { type: "json" }
import { CancelledError } from "../services/PromptService/index.js"

const cli = Command.make("huescale").pipe(
  Command.withSubcommands([generate])
)


const runCli = Command.run(cli, {
  name: "Huescale",
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
