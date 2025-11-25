import { Command } from "@effect/cli"
import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { MainLive } from "../layers/MainLive.js"
import { generate } from "./commands/generate/index.js"

const cli = Command.make("bp-color").pipe(
  Command.withSubcommands([generate])
)

const runCli = Command.run(cli, {
  name: "BP Color Generator",
  version: "0.1.0"
})

const main = runCli(process.argv).pipe(Effect.provide(MainLive))

NodeRuntime.runMain(main)
