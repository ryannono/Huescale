import { Command } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { generate } from "./commands/generate.js"

const cli = Command.make("bp-color").pipe(
  Command.withSubcommands([generate])
)

const runCli = Command.run(cli, {
  name: "BP Color Generator",
  version: "0.1.0"
})

const MainLive = NodeContext.layer

const main = runCli(process.argv).pipe(
  Effect.provide(MainLive)
)

NodeRuntime.runMain(main)
