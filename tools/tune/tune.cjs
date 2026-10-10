// Auto-tuner: for each slider, searches its knobs (Nelder–Mead) to get the lowest average ΔE against Lightroom.
// Usage: node tools/tune/tune.cjs [size] [names]    e.g. node tools/tune/tune.cjs 4 Shadows+,Shadows-
// Prints the best values; copy them into src/gl/tuning.ts. Also saves them to tools/tune/tuned.json.
const open = require('./browser.cjs')
const CASES = require('./cases.cjs')
const fs = require('fs')
const path = require('path')

/** Turn a list of numbers back into tuning values ("zone.1" means item 1 of the zone pair). */
function toPatch(keys, x, base) {
  const p = {}
  keys.forEach((k, i) => {
    const [n, j] = k.split('.')
    if (j === undefined) p[n] = x[i]
    else { p[n] = p[n] || [...base[n]]; p[n][+j] = x[i] }
  })
  return p
}

async function nelderMead(f, x0, lo, hi) {
  const n = x0.length
  const clamp = (x) => x.map((v, i) => Math.min(hi[i], Math.max(lo[i], v)))
  let pts = [x0, ...x0.map((_, i) => {
    const y = [...x0], step = 0.15 * (hi[i] - lo[i])
    y[i] += y[i] + step > hi[i] ? -step : step
    return clamp(y)
  })]
  let vals = []
  for (const p of pts) vals.push(await f(p))
  for (let it = 0; it < 40 * n; it++) {
    const order = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b])
    pts = order.map((i) => pts[i]); vals = order.map((i) => vals[i])
    const centre = x0.map((_, j) => pts.slice(0, n).reduce((s, p) => s + p[j], 0) / n)
    const at = (t) => clamp(centre.map((v, j) => v + t * (pts[n][j] - v)))
    const r = at(-1), fr = await f(r)
    if (fr < vals[0]) { const e = at(-2), fe = await f(e); [pts[n], vals[n]] = fe < fr ? [e, fe] : [r, fr] }
    else if (fr < vals[n - 1]) { pts[n] = r; vals[n] = fr }
    else {
      const k = at(0.5), fk = await f(k)
      if (fk < vals[n]) { pts[n] = k; vals[n] = fk }
      else for (let i = 1; i <= n; i++) { pts[i] = clamp(pts[i].map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j]))); vals[i] = await f(pts[i]) }
    }
    if (Math.abs(vals[n] - vals[0]) < 2e-3) break
  }
  const best = vals.indexOf(Math.min(...vals))
  return [pts[best], vals[best]]
}

;(async () => {
  const only = process.argv[3] ? process.argv[3].split(',') : null
  const cases = CASES.filter((c) => Object.keys(c.params).length && (!only || only.includes(c.name)))
  const h = await open(+process.argv[2] || 4, cases.flatMap((c) => c.refs.map((r) => r.ref)))
  const base = h.base, result = {}
  for (const c of cases) {
    const keys = Object.keys(c.params)
    const lo = keys.map((k) => c.params[k][0]), hi = keys.map((k) => c.params[k][1])
    const x0 = keys.map((k) => { const [n, j] = k.split('.'); return j === undefined ? base[n] : base[n][+j] })
    const avgDeltaE = async (x) => {
      let sum = 0
      for (const r of c.refs) sum += (await h.run(toPatch(keys, x, base), r.adj, r.ref)).avgDeltaE
      return sum / c.refs.length
    }
    const before = await avgDeltaE(x0)
    const [best, after] = await nelderMead(avgDeltaE, x0, lo, hi)
    const patch = toPatch(keys, best, base)
    const scores = []
    for (const r of c.refs) scores.push(`${r.ref} ${(await h.run(patch, r.adj, r.ref)).matchPct.toFixed(1)}%`)
    console.log(`${c.name}: avg ΔE ${before.toFixed(2)} → ${after.toFixed(2)} | ${JSON.stringify(patch)} | ${scores.join(', ')}`)
    result[c.name] = patch
  }
  fs.writeFileSync(path.join(__dirname, 'tuned.json'), JSON.stringify(result, null, 1))
  await h.close()
})()
