// Scores every slider against its Lightroom export with the current tuning.ts.
// Usage: node tools/tune/score.cjs [size]    (size: 4 = quarter size, faster; 2 = half size)
const open = require('./browser.cjs')
const CASES = require('./cases.cjs')

;(async () => {
  const refs = CASES.flatMap((c) => c.refs)
  const h = await open(+process.argv[2] || 4, ['baseline', ...refs.map((r) => r.ref)])
  console.log(`size ${h.dims.join(' × ')}`)
  const show = (name, m) => console.log(`${name.padEnd(16)} ${m.matchPct.toFixed(1).padStart(5)}%   avg ΔE ${m.avgDeltaE.toFixed(2)}   95% of pixels ≤ ΔE ${m.p95DeltaE.toFixed(2)}`)
  show('no edits', await h.run({}, {}, 'baseline'))
  for (const r of refs) show(r.ref, await h.run({}, r.adj, r.ref))
  await h.close()
})()
