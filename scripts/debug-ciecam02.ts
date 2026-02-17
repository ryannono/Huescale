/**
 * Diagnostic script to trace CIECAM02 compensation for #2D72D2
 * white bg → dark bg, showing intermediate values at each step.
 */

import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { parseColorStringToOKLCH } from "../src/domain/color/color.js"
import {
  D65_WHITE_POINT,
  forward,
  inverse,
  makeViewingConditions
} from "../src/domain/color/ciecam02.js"
import * as culori from "culori"

const toXyz = (color: { l: number; c: number; h: number; alpha: number }) => {
  const xyz = culori.xyz65({ mode: "oklch", l: color.l, c: color.c, h: color.h })
  return { X: (xyz?.x ?? 0) * 100, Y: (xyz?.y ?? 0) * 100, Z: (xyz?.z ?? 0) * 100 }
}

const main = Effect.gen(function* () {
  const color = yield* parseColorStringToOKLCH("#2D72D2")
  const whiteBg = yield* parseColorStringToOKLCH("#ffffff")
  const darkBg = yield* parseColorStringToOKLCH("#000105")

  const colorXyz = toXyz(color)
  const whiteBgXyz = toXyz(whiteBg)
  const darkBgXyz = toXyz(darkBg)

  yield* Effect.log("=== Input ===")
  yield* Effect.log(`Color OKLCH: L=${color.l.toFixed(4)} C=${color.c.toFixed(4)} H=${color.h.toFixed(1)}`)
  yield* Effect.log(`Color XYZ: X=${colorXyz.X.toFixed(4)} Y=${colorXyz.Y.toFixed(4)} Z=${colorXyz.Z.toFixed(4)}`)
  yield* Effect.log(`White BG XYZ Y: ${whiteBgXyz.Y.toFixed(4)}`)
  yield* Effect.log(`Dark BG XYZ Y: ${darkBgXyz.Y.toFixed(4)}`)

  yield* Effect.log("\n=== Source Viewing Conditions (white bg) ===")
  const sourceCond = yield* makeViewingConditions(64, whiteBgXyz.Y, D65_WHITE_POINT)
  yield* Effect.log(`n: ${sourceCond.n.toFixed(6)}`)
  yield* Effect.log(`Nbb: ${sourceCond.Nbb.toFixed(6)}`)
  yield* Effect.log(`Ncb: ${sourceCond.Ncb.toFixed(6)}`)
  yield* Effect.log(`z: ${sourceCond.z.toFixed(6)}`)
  yield* Effect.log(`D: ${sourceCond.D.toFixed(6)}`)
  yield* Effect.log(`Fl: ${sourceCond.Fl.toFixed(6)}`)
  yield* Effect.log(`Aw: ${sourceCond.Aw.toFixed(6)}`)
  yield* Effect.log(`0.29^n: ${Math.pow(0.29, sourceCond.n).toFixed(6)}`)
  yield* Effect.log(`chroma scale (1.64 - 0.29^n): ${(1.64 - Math.pow(0.29, sourceCond.n)).toFixed(6)}`)

  yield* Effect.log("\n=== Target Viewing Conditions (dark bg) ===")
  const targetCond = yield* makeViewingConditions(64, darkBgXyz.Y, D65_WHITE_POINT)
  yield* Effect.log(`n: ${targetCond.n.toFixed(6)}`)
  yield* Effect.log(`Nbb: ${targetCond.Nbb.toFixed(6)}`)
  yield* Effect.log(`Ncb: ${targetCond.Ncb.toFixed(6)}`)
  yield* Effect.log(`z: ${targetCond.z.toFixed(6)}`)
  yield* Effect.log(`D: ${targetCond.D.toFixed(6)}`)
  yield* Effect.log(`Fl: ${targetCond.Fl.toFixed(6)}`)
  yield* Effect.log(`Aw: ${targetCond.Aw.toFixed(6)}`)
  yield* Effect.log(`0.29^n: ${Math.pow(0.29, targetCond.n).toFixed(6)}`)
  yield* Effect.log(`chroma scale (1.64 - 0.29^n): ${(1.64 - Math.pow(0.29, targetCond.n)).toFixed(6)}`)

  yield* Effect.log("\n=== Forward Transform (color under source conditions) ===")
  const appearance = yield* forward(colorXyz, D65_WHITE_POINT, sourceCond)
  yield* Effect.log(`J: ${appearance.J.toFixed(4)}`)
  yield* Effect.log(`C: ${appearance.C.toFixed(4)}`)
  yield* Effect.log(`h: ${appearance.h.toFixed(4)}`)
  yield* Effect.log(`M: ${appearance.M.toFixed(4)}`)
  yield* Effect.log(`s: ${appearance.s.toFixed(4)}`)
  yield* Effect.log(`Q: ${appearance.Q.toFixed(4)}`)

  yield* Effect.log("\n=== Inverse Transform (same J,C,h under target conditions) ===")
  const compensatedXyz = yield* inverse(
    { J: appearance.J, C: appearance.C, h: appearance.h },
    D65_WHITE_POINT,
    targetCond
  )
  yield* Effect.log(`Compensated XYZ: X=${compensatedXyz.X.toFixed(4)} Y=${compensatedXyz.Y.toFixed(4)} Z=${compensatedXyz.Z.toFixed(4)}`)

  // Convert back
  const compensatedOklch = culori.oklch({ mode: "xyz65", x: compensatedXyz.X / 100, y: compensatedXyz.Y / 100, z: compensatedXyz.Z / 100 })
  yield* Effect.log(`Compensated OKLCH: L=${compensatedOklch?.l?.toFixed(4)} C=${compensatedOklch?.c?.toFixed(4)} H=${compensatedOklch?.h?.toFixed(1)}`)

  // Verify: forward transform the compensated color under TARGET conditions
  yield* Effect.log("\n=== Verification: forward(compensated, target) ===")
  const verifyAppearance = yield* forward(compensatedXyz, D65_WHITE_POINT, targetCond)
  yield* Effect.log(`J: ${verifyAppearance.J.toFixed(4)} (should be ${appearance.J.toFixed(4)})`)
  yield* Effect.log(`C: ${verifyAppearance.C.toFixed(4)} (should be ${appearance.C.toFixed(4)})`)
  yield* Effect.log(`h: ${verifyAppearance.h.toFixed(4)} (should be ${appearance.h.toFixed(4)})`)

  // Also check: what does the compensated color look like under SOURCE conditions?
  yield* Effect.log("\n=== What compensated looks like under source (white bg) ===")
  const compOnWhite = yield* forward(compensatedXyz, D65_WHITE_POINT, sourceCond)
  yield* Effect.log(`J: ${compOnWhite.J.toFixed(4)} (original: ${appearance.J.toFixed(4)})`)
  yield* Effect.log(`C: ${compOnWhite.C.toFixed(4)} (original: ${appearance.C.toFixed(4)})`)
  yield* Effect.log(`h: ${compOnWhite.h.toFixed(4)} (original: ${appearance.h.toFixed(4)})`)
})

NodeRuntime.runMain(
  main.pipe(
    Effect.provide(NodeContext.layer),
    Effect.catchAll((error) => Effect.log(`Error: ${error}`))
  )
)
