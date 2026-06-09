import { NodeContext, NodeRuntime } from "@effect/platform-node"
import * as culori from "culori"
import { Effect } from "effect"
import { D65_WHITE_POINT, forward, inverse, makeViewingConditions } from "../src/domain/color/ciecam02.js"
import { clampToGamut, parseColorStringToOKLCH } from "../src/domain/color/color.js"

const oklchToXyz65 = (color: { l: number; c: number; h: number; alpha: number }) => {
  const xyz = culori.xyz65({ mode: "oklch", l: color.l, c: color.c, h: color.h })
  return { X: (xyz?.x ?? 0) * 100, Y: (xyz?.y ?? 0) * 100, Z: (xyz?.z ?? 0) * 100 }
}
const xyz65ToOklch = (xyz: { X: number; Y: number; Z: number }) => {
  const o = culori.oklch({ mode: "xyz65", x: xyz.X / 100, y: xyz.Y / 100, z: xyz.Z / 100 })
  return { l: Math.max(0, Math.min(1, o?.l ?? 0)), c: Math.max(0, o?.c ?? 0), h: o?.h ?? 0, alpha: o?.alpha ?? 1 }
}

const main = Effect.gen(function*() {
  const colors = ["#E5F0FF", "#727C8A", "#3475D0", "#0F1723"]
  const srcY = 100

  for (const minYb of [5, 20, 25]) {
    yield* Effect.log(`\n--- MIN_YB=${minYb} ---`)
    for (const hex of colors) {
      const color = yield* parseColorStringToOKLCH(hex)
      const colorXyz = oklchToXyz65(color)
      const srcCond = yield* makeViewingConditions(64, Math.max(minYb, srcY), D65_WHITE_POINT)
      const tgtCond = yield* makeViewingConditions(64, minYb, D65_WHITE_POINT)
      const app = yield* forward(colorXyz, D65_WHITE_POINT, srcCond)
      const compXyz = yield* inverse({ J: app.J, C: app.C, h: app.h }, D65_WHITE_POINT, tgtCond)
      const comp = xyz65ToOklch(compXyz)
      const clamped = yield* clampToGamut(comp)
      const result = culori.formatHex({ mode: "oklch", l: clamped.l, c: clamped.c, h: clamped.h })
      yield* Effect.log(`  ${hex} → ${result}`)
    }
  }
})

NodeRuntime.runMain(
  main.pipe(
    Effect.provide(NodeContext.layer),
    Effect.catchAll((error) => Effect.log(`Error: ${error}`))
  )
)
