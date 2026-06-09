import { NodeContext, NodeRuntime } from "@effect/platform-node"
import * as culori from "culori"
import { Effect } from "effect"
import { D65_WHITE_POINT, forward, inverse, makeViewingConditions } from "../src/domain/color/ciecam02.js"
import { clampToGamut, parseColorStringToOKLCH } from "../src/domain/color/color.js"

const oklchToXyz65 = (c: { l: number; c: number; h: number; alpha: number }) => {
  const xyz = culori.xyz65({ mode: "oklch", l: c.l, c: c.c, h: c.h })
  return { X: (xyz?.x ?? 0) * 100, Y: (xyz?.y ?? 0) * 100, Z: (xyz?.z ?? 0) * 100 }
}
const xyz65ToOklch = (xyz: { X: number; Y: number; Z: number }) => {
  const o = culori.oklch({ mode: "xyz65", x: xyz.X / 100, y: xyz.Y / 100, z: xyz.Z / 100 })
  return { l: Math.max(0, Math.min(1, o?.l ?? 0)), c: Math.max(0, o?.c ?? 0), h: o?.h ?? 0, alpha: 1 }
}

const light = ["#E5F0FF", "#C7D2E1", "#AAB5C3", "#8E98A6", "#727C8A", "#57616F", "#3E4754", "#252E3B", "#0F1723", "#01040D"]
const darkObs = ["#DEEBFD", "#B8C5D6", "#95A1B1", "#75808E", "#57616F", "#3C4552", "#252C37", "#101721", "#03060E", "#000002"]

const rgbDist = (a: string, b: string) => {
  const x = culori.rgb(a), y = culori.rgb(b)
  if (!x || !y) return 999
  return Math.sqrt(((x.r - y.r) ** 2 + (x.g - y.g) ** 2 + (x.b - y.b) ** 2)) * 255
}

const compensate = (hex: string, srcBg: string, tgtBg: string, minYb: number) =>
  Effect.gen(function*() {
    const color = yield* parseColorStringToOKLCH(hex)
    const sBg = yield* parseColorStringToOKLCH(srcBg)
    const tBg = yield* parseColorStringToOKLCH(tgtBg)
    const sY = Math.max(minYb, oklchToXyz65(sBg).Y)
    const tY = Math.max(minYb, oklchToXyz65(tBg).Y)
    const sCond = yield* makeViewingConditions(64, sY, D65_WHITE_POINT)
    const tCond = yield* makeViewingConditions(64, tY, D65_WHITE_POINT)
    const app = yield* forward(oklchToXyz65(color), D65_WHITE_POINT, sCond)
    const out = yield* inverse({ J: app.J, C: app.C, h: app.h }, D65_WHITE_POINT, tCond)
    const clamped = yield* clampToGamut(xyz65ToOklch(out))
    return culori.formatHex({ mode: "oklch", l: clamped.l, c: clamped.c, h: clamped.h }) ?? "#000000"
  })

const main = Effect.gen(function*() {
  const srcBgs = ["#ffffff", "#E5F0FF", "#fafafa"]
  const tgtBgs: Array<string> = ["#000000", "#01040d", "#03060e", "#000002"]
  for (let l = 0.06; l <= 0.30; l += 0.02) tgtBgs.push(culori.formatHex({ mode: "oklch", l, c: 0.02, h: 256.8 }) ?? "#000")
  const minYbs = [5, 10, 15, 20, 25]

  let best = { err: 1e9, srcBg: "", tgtBg: "", minYb: 0 }
  for (const srcBg of srcBgs) {
    for (const tgtBg of tgtBgs) {
      for (const minYb of minYbs) {
        let err = 0
        for (let i = 0; i < light.length; i++) {
          const got = yield* compensate(light[i]!, srcBg, tgtBg, minYb)
          err += rgbDist(got, darkObs[i]!)
        }
        err /= light.length
        if (err < best.err) best = { err, srcBg, tgtBg, minYb }
      }
    }
  }
  yield* Effect.log(`BEST: srcBg=${best.srcBg} tgtBg=${best.tgtBg} minYb=${best.minYb} avgErr=${best.err.toFixed(2)} (RGB 0-255)`)
  yield* Effect.log("stop  light    observed  reproduced")
  for (let i = 0; i < light.length; i++) {
    const got = yield* compensate(light[i]!, best.srcBg, best.tgtBg, best.minYb)
    yield* Effect.log(`${[100,200,300,400,500,600,700,800,900,1000][i]}\t${light[i]}  ${darkObs[i]}   ${got}  d=${rgbDist(got, darkObs[i]!).toFixed(1)}`)
  }
})

NodeRuntime.runMain(main.pipe(Effect.provide(NodeContext.layer), Effect.catchAll((e) => Effect.log(`Error: ${e}`))))
